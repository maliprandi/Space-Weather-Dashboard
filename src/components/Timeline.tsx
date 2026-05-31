import { useEffect, useRef } from "react";
import { useDash } from "@/state/dashboard";
import { TYPE_COLOR } from "@/lib/eventColors";

const SPEEDS: { label: string; ms: number }[] = [
  { label: "30M/S", ms: 30 * 60_000 },
  { label: "2H/S", ms: 2 * 3600_000 },
  { label: "6H/S", ms: 6 * 3600_000 },
  { label: "1D/S", ms: 24 * 3600_000 },
];

export function Timeline() {
  const {
    events,
    cursorTime,
    setCursor,
    windowStart,
    windowEnd,
    playing,
    setPlaying,
    speed,
    setSpeed,
    select,
    selectedId,
  } = useDash();
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!playing) return;
    let raf: number;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = t - last;
      last = t;
      const cur = useDash.getState().cursorTime;
      let next = cur + (speed * dt) / 1000;
      if (next > windowEnd) next = windowStart;
      setCursor(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, windowEnd, windowStart, setCursor]);

  const pct = ((cursorTime - windowStart) / (windowEnd - windowStart)) * 100;

  const onScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setCursor(windowStart + p * (windowEnd - windowStart));
  };

  return (
    <div className="border-t border-cyan-950/60 bg-[#070b14] font-mono text-[11px] text-slate-300">
      <div className="flex items-center justify-between border-b border-cyan-950/40 px-4 py-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPlaying(!playing)}
            className="border border-cyan-700/70 bg-cyan-950/40 px-3 py-1 text-cyan-200 tracking-widest hover:bg-cyan-900/60"
          >
            {playing ? "PAUSE" : "PLAY"}
          </button>
          {SPEEDS.map((s) => (
            <button
              key={s.label}
              onClick={() => setSpeed(s.ms)}
              className={`border px-2 py-1 tracking-widest ${
                speed === s.ms
                  ? "border-cyan-700/70 bg-cyan-950/60 text-cyan-200"
                  : "border-slate-800 text-slate-500 hover:border-slate-700"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="text-[11px] tracking-widest text-slate-400">
          {new Date(cursorTime).toISOString().replace("T", " ").slice(0, 19)} UTC ·{" "}
          <span className="text-slate-500">{events.length} EVENTS · 30 DAY WINDOW</span>
        </div>
        <div className="text-[10px] tracking-widest text-slate-500">
          {new Date(windowStart).toISOString().slice(0, 10)} → {new Date(windowEnd).toISOString().slice(0, 10)}
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="flex gap-2">
          {/* Y-axis: event-type labels stacked vertically, aligned to rows */}
          <div className="relative h-14 w-12 shrink-0 text-[9px] tracking-widest text-slate-500">
            {(["flare", "cme", "gst", "neo", "fireball"] as const).map((t, i) => (
              <div
                key={t}
                className="absolute right-0 -translate-y-1/2 pr-1 text-right"
                style={{ top: `${[0.17, 0.34, 0.5, 0.66, 0.83][i] * 100}%`, color: TYPE_COLOR[t] }}
              >
                {t === "fireball" ? "FIR" : t.toUpperCase()}
              </div>
            ))}
          </div>

          <div className="flex-1">
            <div
              ref={trackRef}
              onClick={onScrub}
              className="relative h-14 cursor-pointer rounded-sm border border-slate-900 bg-gradient-to-b from-[#0a1422] to-[#040813]"
            >
              {/* Day grid */}
              {Array.from({ length: 31 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full border-l border-slate-900"
                  style={{ left: `${(i / 30) * 100}%` }}
                />
              ))}

              {/* Event dots */}
              {events.map((ev) => {
                const p = (ev.time - windowStart) / (windowEnd - windowStart);
                if (p < 0 || p > 1) return null;
                const row = { flare: 0.17, cme: 0.34, gst: 0.5, neo: 0.66, fireball: 0.83 }[ev.type];
                return (
                  <button
                    key={ev.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      select(ev.id);
                      setCursor(ev.time);
                    }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition hover:scale-150"
                    style={{
                      left: `${p * 100}%`,
                      top: `${row * 100}%`,
                      width: selectedId === ev.id ? 12 : 7,
                      height: selectedId === ev.id ? 12 : 7,
                      background: TYPE_COLOR[ev.type],
                      boxShadow: `0 0 6px ${TYPE_COLOR[ev.type]}`,
                    }}
                    title={`${ev.title} — ${new Date(ev.time).toISOString().slice(0, 16)}`}
                  />
                );
              })}

              {/* Cursor */}
              <div
                className="pointer-events-none absolute top-0 h-full w-px bg-cyan-300"
                style={{ left: `${pct}%`, boxShadow: "0 0 8px #22d3ee" }}
              >
                <div className="absolute -left-1 -top-1 h-2 w-2 rotate-45 bg-cyan-300" />
              </div>
            </div>

            {/* X-axis: date markers */}
            <div className="relative mt-1 h-3 text-[9px] tracking-widest text-slate-500">
              {Array.from({ length: 7 }).map((_, i) => {
                const p = i / 6;
                const t = windowStart + p * (windowEnd - windowStart);
                const label = new Date(t).toISOString().slice(5, 10).replace("-", "/");
                return (
                  <div
                    key={i}
                    className="absolute -translate-x-1/2"
                    style={{ left: `${p * 100}%` }}
                  >
                    {label}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
