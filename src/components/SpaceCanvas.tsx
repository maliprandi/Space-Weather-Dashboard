import { useEffect, useMemo, useRef, useState } from "react";
import { useDash } from "@/state/dashboard";
import { TYPE_COLOR } from "@/lib/eventColors";
import { MISSIONS } from "@/data/missions";
import type { DashEvent } from "@/lib/nasa";
import earthImg from "@/assets/earth.png";
import moonImg from "@/assets/moon.png";
import sunImg from "@/assets/sun.png";
import marsImg from "@/assets/mars.png";

const W = 2800;
const H = 1100;
const SUN_X = 650;
const SUN_Y = H / 2;
const EARTH_X = 1550;
const EARTH_Y = H / 2;
const MOON_OFFSET = 280;
// Mars pushed out for visual clarity (not to scale) so lunar vs Martian
// spacecraft clusters are unambiguously separated from the Earth–Moon system.
const MARS_X = 2250;
const MARS_Y = H / 2;
// Sun→Earth = 900 svg units = 1 AU = 149,597,871 km
const KM_PER_UNIT = 149_597_871 / (EARTH_X - SUN_X);

function niceRound(n: number): number {
  const exp = Math.floor(Math.log10(n));
  const base = n / Math.pow(10, exp);
  const nice = base < 1.5 ? 1 : base < 3.5 ? 2 : base < 7.5 ? 5 : 10;
  return nice * Math.pow(10, exp);
}

function formatKm(km: number): string {
  if (km >= 1e6) return `${(km / 1e6).toFixed(km / 1e6 < 10 ? 1 : 0)} M km`;
  if (km >= 1e3) return `${(km / 1e3).toFixed(0)} k km`;
  return `${km.toFixed(0)} km`;
}


// Earth-Sun distance ≈ 150e6 km. CME travel: ms = (150e6 / speed) * 1000
function cmeTravelMs(speedKms?: number) {
  if (!speedKms) return 3 * 24 * 3600_000;
  return (150_000_000 / speedKms) * 1000;
}

function eventActive(ev: DashEvent, cursor: number): { active: boolean; progress: number } {
  if (ev.type === "flare") {
    const end = ev.endTime ?? ev.time + 30 * 60_000;
    const active = cursor >= ev.time && cursor <= end + 6 * 3600_000;
    return { active, progress: Math.min(1, Math.max(0, (cursor - ev.time) / Math.max(1, end - ev.time))) };
  }
  if (ev.type === "cme") {
    const dur = cmeTravelMs(ev.speed);
    const active = cursor >= ev.time && cursor <= ev.time + dur + 12 * 3600_000;
    return { active, progress: Math.min(1, Math.max(0, (cursor - ev.time) / dur)) };
  }
  if (ev.type === "gst") {
    const active = cursor >= ev.time - 6 * 3600_000 && cursor <= ev.time + 36 * 3600_000;
    return { active, progress: 0 };
  }
  if (ev.type === "fireball") {
    // Always visible across the loaded window so all impact sites are findable
    // around Earth. Progress is used only for streak animation phase.
    const span = 72 * 3600_000;
    const t0 = ev.time - 36 * 3600_000;
    return { active: true, progress: Math.min(1, Math.max(0, (cursor - t0) / span)) };
  }
  // neo — visible for a generous window around close approach so they're easy to spot
  const active = cursor >= ev.time - 3 * 24 * 3600_000 && cursor <= ev.time + 3 * 24 * 3600_000;
  return { active, progress: 0 };
}

const Starfield = () => {
  const stars = useMemo(() => {
    const arr: { x: number; y: number; r: number; o: number }[] = [];
    for (let i = 0; i < 220; i++) {
      arr.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.4 + 0.2,
        o: 0.2 + Math.random() * 0.6,
      });
    }
    return arr;
  }, []);
  return (
    <g>
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#cbd5e1" opacity={s.o} />
      ))}
    </g>
  );
};

export function SpaceCanvas() {
  const { events, cursorTime, layers, selectedId, select, selectedMissionId, selectMission, selectInfo } = useDash();
  const [{ tx, ty, scale }, setView] = useState({ tx: 0, ty: 0, scale: 1 });
  const dragging = useRef<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 1, h: 1 });

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => setDims({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Zoom anchored at a given SVG-space point: keep that point fixed under the cursor.
  const zoomAt = (svgX: number, svgY: number, factor: number) => {
    setView((view) => {
      const newScale = Math.min(3, Math.max(0.5, view.scale * factor));
      const worldX = (svgX - view.tx) / view.scale;
      const worldY = (svgY - view.ty) / view.scale;
      return {
        scale: newScale,
        tx: svgX - worldX * newScale,
        ty: svgY - worldY * newScale,
      };
    });
  };

  // Convert a client (pixel) point to SVG user-space coordinates.
  const clientToSvg = (clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: W / 2, y: H / 2 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: W / 2, y: H / 2 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (!svgRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
      const svg = svgRef.current;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const p = pt.matrixTransform(ctm.inverse());
      const factor = Math.exp(-e.deltaY * 0.0015);
      zoomAt(p.x, p.y, factor);
    };
    window.addEventListener("wheel", handler, { passive: false });
    return () => window.removeEventListener("wheel", handler);
  }, [scale, tx, ty]);

  const onMouseDown = (e: React.MouseEvent) => {
    const p = clientToSvg(e.clientX, e.clientY);
    dragging.current = { x: p.x - tx, y: p.y - ty };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return;
    const p = clientToSvg(e.clientX, e.clientY);
    const drag = dragging.current;
    setView((view) => ({ ...view, tx: p.x - drag.x, ty: p.y - drag.y }));
  };
  const onMouseUp = () => {
    dragging.current = null;
  };

  // Zoom anchored at the center of the viewport (for + / - buttons).
  const zoomAtCenter = (newScaleRaw: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const { x, y } = clientToSvg(rect.left + rect.width / 2, rect.top + rect.height / 2);
    zoomAt(x, y, newScaleRaw / scale);
  };

  // Active events at cursor
  const active = events
    .map((ev) => ({ ev, ...eventActive(ev, cursorTime) }))
    .filter((x) => x.active && layers[x.ev.type]);

  const flares = active.filter((a) => a.ev.type === "flare");
  const cmes = active.filter((a) => a.ev.type === "cme");
  const gsts = active.filter((a) => a.ev.type === "gst");
  const neos = active.filter((a) => a.ev.type === "neo");
  const fireballs = active.filter((a) => a.ev.type === "fireball");

  const flareGlowColor = flares.length > 0 ? TYPE_COLOR.flare : null;
  const gstGlowColor = gsts.length > 0 ? TYPE_COLOR.gst : null;


  // Distance scale: compute how many real km a ~180px bar represents at current zoom.
  // SVG uses preserveAspectRatio="xMidYMid slice": svg-units-per-screen-pixel =
  // min(W/containerW, H/containerH).
  const svgPerPx = dims.w > 0 && dims.h > 0 ? Math.min(W / dims.w, H / dims.h) : 1;
  const TARGET_PX = 180;
  const rawKm = (TARGET_PX * svgPerPx * KM_PER_UNIT) / scale;
  const niceKm = niceRound(rawKm);
  const scaleBarPx = (niceKm / KM_PER_UNIT) * scale / svgPerPx;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-[#05070d] cursor-grab active:cursor-grabbing"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-full w-full"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <radialGradient id="sunGrad">
            <stop offset="0%" stopColor="#fff3c4" />
            <stop offset="40%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#b45309" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="sunCore">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#fde68a" />
            <stop offset="100%" stopColor="#f59e0b" />
          </radialGradient>
          <radialGradient id="earthGrad">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="80%" stopColor="#1e3a8a" />
            <stop offset="100%" stopColor="#0c1330" />
          </radialGradient>
          <radialGradient id="vignette">
            <stop offset="60%" stopColor="#05070d" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.9" />
          </radialGradient>
        </defs>

        <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
          <Starfield />

          {/* Ecliptic line Sun → Earth → Mars */}
          <line x1={SUN_X} y1={SUN_Y} x2={MARS_X} y2={MARS_Y} stroke="#1f2937" strokeDasharray="3 6" strokeWidth={1} />

          {/* SUN */}
          <g onClick={(e) => { e.stopPropagation(); selectInfo("sun"); }} style={{ cursor: "pointer" }}>
            {flareGlowColor && (
              <circle cx={SUN_X} cy={SUN_Y} r={180} fill={flareGlowColor} opacity={0.25} pointerEvents="none">
                <animate attributeName="r" values="160;220;160" dur="3s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.15;0.4;0.15" dur="3s" repeatCount="indefinite" />
              </circle>
            )}
            <image
              href={sunImg}
              x={SUN_X - 130}
              y={SUN_Y - 130}
              width={260}
              height={260}
              style={{ filter: "drop-shadow(0 0 40px rgba(251,191,36,0.55))" }}
            />
            <text x={SUN_X} y={SUN_Y + 150} textAnchor="middle" fill="#fde68a" fontSize={11} fontFamily="ui-monospace,monospace" letterSpacing={3} style={{ filter: "drop-shadow(0 0 6px rgba(251,191,36,0.9))" }}>SUN</text>
            <text x={SUN_X} y={SUN_Y + 164} textAnchor="middle" fill="#fbbf24" fontSize={8} fontFamily="ui-monospace,monospace" style={{ filter: "drop-shadow(0 0 4px rgba(251,191,36,0.7))" }}>0 AU</text>
          </g>

          {/* CMEs render order moved below — see after MARS */}


          {/* EARTH */}
          <g>
            {flareGlowColor && (
              <>
                <circle cx={EARTH_X} cy={EARTH_Y} r={60} fill={flareGlowColor} opacity={0.35}>
                  <animate attributeName="r" values="50;180;50" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.55;0;0.55" dur="2s" repeatCount="indefinite" />
                </circle>
                <circle cx={EARTH_X} cy={EARTH_Y} r={60} fill="none" stroke={flareGlowColor} strokeWidth={2} opacity={0.8}>
                  <animate attributeName="r" values="55;140;55" dur="2s" begin="0.4s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.9;0;0.9" dur="2s" begin="0.4s" repeatCount="indefinite" />
                </circle>
              </>
            )}
            {gstGlowColor && (
              <circle cx={EARTH_X} cy={EARTH_Y} r={70} fill="none" stroke={gstGlowColor} strokeWidth={3} opacity={0.6}>
                <animate attributeName="r" values="60;90;60" dur="3s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.3;0.7;0.3" dur="3s" repeatCount="indefinite" />
              </circle>
            )}

            <g onClick={(e) => { e.stopPropagation(); selectInfo("earth"); }} style={{ cursor: "pointer" }}>
              <image
                href={earthImg}
                x={EARTH_X - 52}
                y={EARTH_Y - 52}
                width={104}
                height={104}
                style={{ filter: "drop-shadow(0 0 12px rgba(59,130,246,0.45))" }}
              />
              <text x={EARTH_X} y={EARTH_Y + 72} textAnchor="middle" fill="#60a5fa" fontSize={11} fontFamily="ui-monospace,monospace" letterSpacing={3}>EARTH</text>
              <text x={EARTH_X} y={EARTH_Y + 86} textAnchor="middle" fill="#1e3a8a" fontSize={8} fontFamily="ui-monospace,monospace">1.000 AU</text>
            </g>

            {/* Van Allen radiation belts */}
            {layers.vanAllen && (
              <g>
                {[
                  { id: "van-allen-inner", r: 68, w: 10, label: "INNER", labelY: -28, labelX: -54 },
                  { id: "van-allen-outer", r: 100, w: 22, label: "OUTER", labelY: -44, labelX: -78 },
                ].map((b) => (
                  <g
                    key={b.id}
                    onClick={(e) => { e.stopPropagation(); selectInfo(b.id); }}
                    style={{ cursor: "pointer" }}
                  >
                    <circle
                      cx={EARTH_X} cy={EARTH_Y} r={b.r}
                      fill="none" stroke="#c4b5fd" strokeWidth={b.w} opacity={0.28}
                      pointerEvents="stroke"
                    />
                    <circle
                      cx={EARTH_X} cy={EARTH_Y} r={b.r}
                      fill="none" stroke="#a78bfa" strokeWidth={0.6} opacity={0.7}
                      strokeDasharray="2 3" pointerEvents="none"
                    />
                    <text
                      x={EARTH_X + b.labelX} y={EARTH_Y + b.labelY}
                      textAnchor="end" fill="#c4b5fd" fontSize={8}
                      fontFamily="ui-monospace,monospace" letterSpacing={2}
                      pointerEvents="none"
                    >
                      VAN ALLEN · {b.label}
                    </text>
                  </g>
                ))}
              </g>
            )}

            {/* Earth orbital zones (stylized — not to scale) */}
            {layers.orbits && (
              <g fontFamily="ui-monospace,monospace" fontSize={8} fill="#64748b">
                {[
                  { r: 58, label: "LEO", note: "≤2,000 km" },
                  { r: 78, label: "MEO", note: "2k–35k km" },
                  { r: 104, label: "GEO", note: "35,786 km" },
                  { r: 180, label: "HEO", note: "highly elliptical" },
                ].map((o) => (
                  <g key={o.label}>
                    <circle cx={EARTH_X} cy={EARTH_Y} r={o.r} fill="none" stroke="#334155" strokeDasharray="1 5" strokeWidth={0.8} opacity={0.7} />
                    <text x={EARTH_X} y={EARTH_Y - o.r - 3} textAnchor="middle" fill="#64748b" letterSpacing={2}>
                      {o.label}
                    </text>
                  </g>
                ))}
              </g>
            )}

            {/* Moon orbit */}
            <circle cx={EARTH_X} cy={EARTH_Y} r={MOON_OFFSET} fill="none" stroke="#1e293b" strokeDasharray="2 4" />
            <g onClick={(e) => { e.stopPropagation(); selectInfo("moon"); }} style={{ cursor: "pointer" }}>
              <image
                href={moonImg}
                x={EARTH_X + MOON_OFFSET - 16}
                y={EARTH_Y - 16}
                width={32}
                height={32}
                style={{ filter: "drop-shadow(0 0 4px rgba(148,163,184,0.4))" }}
              />
              <text x={EARTH_X + MOON_OFFSET} y={EARTH_Y + 32} textAnchor="middle" fill="#94a3b8" fontSize={9} fontFamily="ui-monospace,monospace">MOON</text>
              <text x={EARTH_X + MOON_OFFSET} y={EARTH_Y + 44} textAnchor="middle" fill="#475569" fontSize={7} fontFamily="ui-monospace,monospace">0.0026 AU</text>
            </g>
          </g>

          {/* MARS */}
          <g onClick={(e) => { e.stopPropagation(); selectInfo("mars"); }} style={{ cursor: "pointer" }}>
            <image
              href={marsImg}
              x={MARS_X - 36}
              y={MARS_Y - 36}
              width={72}
              height={72}
              style={{ filter: "drop-shadow(0 0 10px rgba(234,88,12,0.4))" }}
            />
            <text x={MARS_X} y={MARS_Y + 86} textAnchor="middle" fill="#fb923c" fontSize={11} fontFamily="ui-monospace,monospace" letterSpacing={3}>MARS</text>
            <text x={MARS_X} y={MARS_Y + 100} textAnchor="middle" fill="#7c2d12" fontSize={8} fontFamily="ui-monospace,monospace">1.524 AU</text>
          </g>

          {/* CMEs — rendered after planets so nodes stay on top and clickable */}
          {cmes.map(({ ev, progress }) => {
            const angle = ((ev.angleDeg ?? 0) * Math.PI) / 180;
            const distance = 60 + progress * 900;
            const x = SUN_X + Math.cos(angle) * distance;
            const y = SUN_Y + Math.sin(angle) * distance;
            const color = TYPE_COLOR.cme;
            const active = selectedId === ev.id;
            return (
              <g key={ev.id} onClick={(e) => { e.stopPropagation(); select(ev.id); }} className="cursor-pointer">
                <path
                  d={`M ${SUN_X} ${SUN_Y} L ${x} ${y}`}
                  stroke={color}
                  strokeWidth={2}
                  opacity={0.5}
                  pointerEvents="none"
                />
                <circle cx={x} cy={y} r={active ? 12 : 8} fill={color} opacity={0.9} stroke="#fff" strokeWidth={active ? 1.5 : 0}>
                  <animate attributeName="r" values={active ? "11;15;11" : "6;12;6"} dur="2s" repeatCount="indefinite" />
                </circle>
                {active && (
                  <circle cx={x} cy={y} r={18} fill="none" stroke={color} strokeWidth={1.5} opacity={0.7}>
                    <animate attributeName="r" values="16;26;16" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.8;0.1;0.8" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                <polygon
                  points={`${x},${y - 6} ${x + 12},${y} ${x},${y + 6}`}
                  fill={color}
                  transform={`rotate(${(ev.angleDeg ?? 0)} ${x} ${y})`}
                  opacity={0.85}
                  pointerEvents="none"
                />
                {/* invisible enlarged hit target */}
                <circle cx={x} cy={y} r={20} fill="transparent" />
              </g>
            );
          })}

          {/* Solar flares — clickable bubbles around Earth (flare radiation reaches Earth) */}
          {flares.map(({ ev }, i) => {
            const color = TYPE_COLOR.flare;
            const activeSel = selectedId === ev.id;
            // Stable hash → spread bubbles around Earth
            let h = 0;
            const s = String(ev.id);
            for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) | 0;
            const angle = ((((h % 360) + 360) % 360) * Math.PI) / 180;
            const radius = 150 + ((Math.abs(h) >> 8) % 40);
            const x = EARTH_X + Math.cos(angle) * radius;
            const y = EARTH_Y + Math.sin(angle) * radius;
            return (
              <g key={ev.id} onClick={(e) => { e.stopPropagation(); select(ev.id); }} className="cursor-pointer">
                <line x1={EARTH_X} y1={EARTH_Y} x2={x} y2={y} stroke={color} strokeWidth={1} opacity={0.35} strokeDasharray="2 3" pointerEvents="none" />
                <circle cx={x} cy={y} r={activeSel ? 11 : 7} fill={color} opacity={0.9} stroke="#fff" strokeWidth={activeSel ? 1.5 : 0}>
                  <animate attributeName="r" values={activeSel ? "10;14;10" : "6;10;6"} dur="1.6s" repeatCount="indefinite" />
                </circle>
                <circle cx={x} cy={y} r={14} fill="none" stroke={color} strokeWidth={1.2} opacity={0.6}>
                  <animate attributeName="r" values="10;22;10" dur="1.6s" begin={`${(i % 5) * 0.2}s`} repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.7;0;0.7" dur="1.6s" begin={`${(i % 5) * 0.2}s`} repeatCount="indefinite" />
                </circle>
                {activeSel && (
                  <circle cx={x} cy={y} r={18} fill="none" stroke={color} strokeWidth={1.5} opacity={0.7}>
                    <animate attributeName="r" values="16;26;16" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.8;0.1;0.8" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                {/* invisible enlarged hit target */}
                <circle cx={x} cy={y} r={18} fill="transparent" />
              </g>
            );
          })}

          {/* Lagrange points */}

          <g fontFamily="ui-monospace,monospace" fontSize={9} fill="#64748b">
            <circle cx={EARTH_X - 120} cy={EARTH_Y} r={3} fill="#64748b" />
            <text x={EARTH_X - 120} y={EARTH_Y - 8} textAnchor="middle">L1</text>
            <circle cx={EARTH_X + 120} cy={EARTH_Y} r={3} fill="#64748b" />
            <text x={EARTH_X + 120} y={EARTH_Y - 8} textAnchor="middle">L2</text>
          </g>

          {/* Missions */}
          {layers.missions && (() => {
            const inv = 1 / Math.sqrt(Math.max(0.5, Math.min(scale, 3)));
            // Layout labels with greedy collision avoidance. Marker positions
            // are absolute and authoritative; only label placement varies.
            type Box = { x: number; y: number; w: number; h: number };
            const overlap = (a: Box, b: Box) =>
              a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
            const placed: Box[] = [];
            const markerHalf = 5 * inv + 1;
            const charW = 5.4 * inv;
            const labelH = 11 * inv;
            const pad = 3 * inv;

            // Reserve marker boxes first so labels don't sit on top of other markers.
            const markers = MISSIONS.map((m) => {
              const ax = m.anchor === "mars" ? MARS_X : EARTH_X;
              const ay = m.anchor === "mars" ? MARS_Y : EARTH_Y;
              return { id: m.id, cx: ax + m.x, cy: ay + m.y };
            });
            markers.forEach((mk) =>
              placed.push({ x: mk.cx - markerHalf, y: mk.cy - markerHalf, w: markerHalf * 2, h: markerHalf * 2 })
            );

            const layouts = MISSIONS.map((m, idx) => {
              const mk = markers[idx];
              const w = m.name.length * charW + 4 * inv;
              const h = labelH;
              // Preferred sides based on quadrant relative to anchor center.
              const ax = m.anchor === "mars" ? MARS_X : EARTH_X;
              const ay = m.anchor === "mars" ? MARS_Y : EARTH_Y;
              const dx = mk.cx - ax;
              const dy = mk.cy - ay;
              const prefRight = dx >= 0;
              const prefBelow = dy >= 0;
              type Cand = { dx: number; dy: number; anchor: "start" | "end" | "middle" };
              const sides: Cand[] = [];
              const right: Cand = { dx: markerHalf + pad, dy: h / 3, anchor: "start" };
              const left: Cand = { dx: -markerHalf - pad, dy: h / 3, anchor: "end" };
              const below: Cand = { dx: 0, dy: markerHalf + h, anchor: "middle" };
              const above: Cand = { dx: 0, dy: -markerHalf - pad, anchor: "middle" };
              sides.push(prefRight ? right : left);
              sides.push(prefRight ? left : right);
              sides.push(prefBelow ? below : above);
              sides.push(prefBelow ? above : below);

              let chosen: { box: Box; cand: Cand } | null = null;
              // Try every side at small push before escalating, so labels stay close.
              outer: for (let push = 0; push < 8; push++) {
                for (const cand of sides) {
                  const off = push * (h + 2 * inv) * (cand.dy < 0 ? -1 : 1);
                  const labelLeft =
                    cand.anchor === "start"
                      ? mk.cx + cand.dx
                      : cand.anchor === "end"
                        ? mk.cx + cand.dx - w
                        : mk.cx + cand.dx - w / 2;
                  const labelTop = mk.cy + cand.dy - h + off;
                  const box = { x: labelLeft - 1 * inv, y: labelTop, w: w + 2 * inv, h };
                  if (!placed.some((b) => overlap(b, box))) {
                    chosen = { box, cand: { ...cand, dy: cand.dy + off } };
                    break outer;
                  }
                }
              }
              if (!chosen) {
                const cand = sides[0];
                const labelLeft =
                  cand.anchor === "start" ? mk.cx + cand.dx : mk.cx + cand.dx - w;
                chosen = {
                  box: { x: labelLeft, y: mk.cy + cand.dy - h, w, h },
                  cand,
                };
              }
              placed.push(chosen.box);
              return { mission: m, marker: mk, cand: chosen.cand };
            });

            return layouts.map(({ mission: m, marker: mk, cand }) => {
              const active = selectedMissionId === m.id;
              const color = m.status === "planned" ? "transparent" : "#22d3ee";
              return (
                <g
                  key={m.id}
                  onClick={(e) => { e.stopPropagation(); selectMission(active ? null : m.id); }}
                  className="cursor-pointer"
                >
                  <g transform={`translate(${mk.cx} ${mk.cy}) scale(${inv})`}>
                    <rect x={-5} y={-5} width={10} height={10} fill={color} stroke="#22d3ee" strokeWidth={active ? 1.8 : 1} />
                    {active && (
                      <circle cx={0} cy={0} r={12} fill="none" stroke="#22d3ee" strokeWidth={1} opacity={0.6}>
                        <animate attributeName="r" values="10;16;10" dur="2s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.7;0.1;0.7" dur="2s" repeatCount="indefinite" />
                      </circle>
                    )}
                  </g>
                  <text
                    x={mk.cx + cand.dx}
                    y={mk.cy + cand.dy}
                    textAnchor={cand.anchor}
                    fill={active ? "#e0f2fe" : "#94a3b8"}
                    fontSize={9 * inv}
                    fontFamily="ui-monospace,monospace"
                  >
                    {m.name}
                  </text>
                </g>
              );
            });
          })()}

          {/* NEOs — each placed around Earth at a radius scaled by miss distance,
              with a flyby trajectory that grazes the close-approach point (never
              striking Earth unless the miss distance is essentially zero). */}
          {neos.map(({ ev }) => {
            const angle = ((ev.angleDeg ?? 0) * Math.PI) / 180;
            // Moon orbit (~1 LD) is at MOON_OFFSET=280 svg units from Earth.
            // Map miss distances logarithmically into ~80–360 svg units so
            // both close (<1 LD) and far (>50 LD) passes are visible.
            const ld = Math.max(0.05, ev.missLD ?? 5);
            const r = 80 + Math.min(360, 60 * Math.log10(ld + 1) + 120);
            const x = EARTH_X + Math.cos(angle) * r;
            const y = EARTH_Y + Math.sin(angle) * r;
            // Trajectory: a line tangent to the close-approach point,
            // perpendicular to the Earth→NEO radius, extending ±260 units.
            const tx0 = -Math.sin(angle);
            const ty0 = Math.cos(angle);
            const L = 260;
            const x1 = x + tx0 * L;
            const y1 = y + ty0 * L;
            const x2 = x - tx0 * L;
            const y2 = y - ty0 * L;
            const color = TYPE_COLOR.neo;
            const active = selectedId === ev.id;
            // Size hints visual scale: tiny dot for small, larger for big.
            const dia = ev.diameter ?? 50;
            const base = Math.max(3, Math.min(8, 2 + Math.log10(dia + 1) * 2));
            return (
              <g key={ev.id} onClick={(e) => { e.stopPropagation(); select(ev.id); }} className="cursor-pointer">
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={0.8} opacity={0.45} strokeDasharray="2 3" pointerEvents="none" />
                <circle cx={x} cy={y} r={active ? base + 4 : base} fill={color} stroke="#fff" strokeWidth={active ? 1.2 : 0} />
                {active && (
                  <circle cx={x} cy={y} r={base + 8} fill="none" stroke={color} strokeWidth={1.2} opacity={0.7}>
                    <animate attributeName="r" values={`${base + 6};${base + 14};${base + 6}`} dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.8;0.1;0.8" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                {/* Enlarged hit target */}
                <circle cx={x} cy={y} r={14} fill="transparent" />
              </g>
            );
          })}

          {/* Fireballs — atmospheric impacts. Streak from outside Earth into Earth,
              with the marker resting at impact point just above the surface. */}
          {fireballs.map(({ ev }) => {
            const angle = ((ev.angleDeg ?? 0) * Math.PI) / 180;
            const impactR = 56; // just outside Earth icon
            const ix = EARTH_X + Math.cos(angle) * impactR;
            const iy = EARTH_Y + Math.sin(angle) * impactR;
            // Origin of streak: ~220 units further out along the same radial
            const ox = EARTH_X + Math.cos(angle) * (impactR + 220);
            const oy = EARTH_Y + Math.sin(angle) * (impactR + 220);
            const color = TYPE_COLOR.fireball;
            const activeSel = selectedId === ev.id;
            // Size scales with log(energy)
            const e = ev.impactEnergyKt ?? ev.energyKt ?? 0.05;
            const base = Math.max(3, Math.min(11, 3 + Math.log10(e + 0.01) * 2.5));
            return (
              <g key={ev.id} onClick={(ev2) => { ev2.stopPropagation(); select(ev.id); }} className="cursor-pointer">
                {/* Streak / trajectory */}
                <line
                  x1={ox} y1={oy} x2={ix} y2={iy}
                  stroke={color}
                  strokeWidth={activeSel ? 2.2 : 1.4}
                  opacity={0.75}
                  strokeLinecap="round"
                  pointerEvents="none"
                />
                <line
                  x1={ox} y1={oy} x2={ix} y2={iy}
                  stroke={color}
                  strokeWidth={6}
                  opacity={0.18}
                  strokeLinecap="round"
                  pointerEvents="none"
                />
                {/* Impact flash */}
                <circle cx={ix} cy={iy} r={activeSel ? base + 4 : base} fill={color} stroke="#fff" strokeWidth={activeSel ? 1.2 : 0}>
                  <animate attributeName="opacity" values="0.6;1;0.6" dur="1.4s" repeatCount="indefinite" />
                </circle>
                <circle cx={ix} cy={iy} r={base + 6} fill="none" stroke={color} strokeWidth={1.2} opacity={0.7} pointerEvents="none">
                  <animate attributeName="r" values={`${base + 4};${base + 14};${base + 4}`} dur="1.8s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.8;0;0.8" dur="1.8s" repeatCount="indefinite" />
                </circle>
                {activeSel && (
                  <circle cx={ix} cy={iy} r={base + 12} fill="none" stroke={color} strokeWidth={1.5} opacity={0.7}>
                    <animate attributeName="r" values={`${base + 10};${base + 22};${base + 10}`} dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.9;0.1;0.9" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                {/* Enlarged hit target */}
                <circle cx={ix} cy={iy} r={18} fill="transparent" />
              </g>
            );
          })}



          {/* Flare clickable nodes (small) */}
          {flares.map(({ ev }, i) => {
            const offsetAngle = (i / Math.max(1, flares.length)) * Math.PI * 2;
            const r = 90;
            const x = SUN_X + Math.cos(offsetAngle) * r;
            const y = SUN_Y + Math.sin(offsetAngle) * r;
            const color = TYPE_COLOR.flare;
            return (
              <circle
                key={ev.id}
                cx={x}
                cy={y}
                r={selectedId === ev.id ? 8 : 5}
                fill={color}
                stroke="#fff"
                strokeWidth={selectedId === ev.id ? 1 : 0}
                onClick={() => select(ev.id)}
                className="cursor-pointer"
              />
            );
          })}

          {/* GST nodes orbiting earth */}
          {gsts.map(({ ev }, i) => {
            const a = (i / Math.max(1, gsts.length)) * Math.PI * 2;
            const r = 85;
            const x = EARTH_X + Math.cos(a) * r;
            const y = EARTH_Y + Math.sin(a) * r;
            const color = TYPE_COLOR.gst;
            return (
              <circle
                key={ev.id}
                cx={x}
                cy={y}
                r={selectedId === ev.id ? 8 : 5}
                fill={color}
                stroke="#fff"
                strokeWidth={selectedId === ev.id ? 1 : 0}
                onClick={() => select(ev.id)}
                className="cursor-pointer"
              />
            );
          })}

          <rect x={0} y={0} width={W} height={H} fill="url(#vignette)" pointerEvents="none" />
        </g>
      </svg>

      {/* Zoom controls */}
      <div className="absolute bottom-4 left-4 flex gap-1 font-mono text-xs">
        <button
          onClick={() => zoomAtCenter(scale * 1.25)}
          className="border border-cyan-900 bg-black/60 px-2 py-1 text-cyan-300 hover:bg-cyan-950"
        >
          +
        </button>
        <button
          onClick={() => zoomAtCenter(scale / 1.25)}
          className="border border-cyan-900 bg-black/60 px-2 py-1 text-cyan-300 hover:bg-cyan-950"
        >
          −
        </button>
        <button
          onClick={() => setView({ scale: 1, tx: 0, ty: 0 })}
          className="border border-cyan-900 bg-black/60 px-3 py-1 text-cyan-300 hover:bg-cyan-950 tracking-widest"
        >
          RESET VIEW
        </button>
      </div>

      {/* Distance scale */}
      <div className="pointer-events-none absolute bottom-4 right-4 font-mono text-[10px] text-slate-300">
        <div className="mb-1 text-right tracking-widest text-slate-500">SCALE</div>
        <div className="flex items-end gap-2">
          <div className="flex flex-col items-start">
            <div
              className="relative h-2 border-x border-b border-slate-300"
              style={{ width: `${scaleBarPx}px` }}
            >
              <div className="absolute left-1/2 top-0 h-2 w-px bg-slate-300" />
            </div>
            <div className="mt-1 text-slate-300" style={{ width: `${scaleBarPx}px`, textAlign: "center" }}>
              {formatKm(niceKm)}
            </div>
          </div>
        </div>
        <div className="mt-1 text-right text-[9px] text-slate-600">
          Sun→Earth 149.6M km · Earth→Moon 384k km
        </div>
      </div>
    </div>
  );
}
