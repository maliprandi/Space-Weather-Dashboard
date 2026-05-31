import { useDash, type LayerKey } from "@/state/dashboard";
import { THREAT_COLOR, THREAT_LABEL } from "@/lib/threat";
import { TYPE_COLOR } from "@/lib/eventColors";
import { MISSIONS, type Mission } from "@/data/missions";
import { INFO_CARDS } from "@/data/infoCards";
import { useEffect, useMemo, useRef } from "react";

const LAYER_DEFS: { key: LayerKey; label: string; color: string; hint: string }[] = [
  { key: "flare", label: "Solar Flares", color: TYPE_COLOR.flare, hint: "NASA DONKI · FLR" },
  { key: "cme", label: "Coronal Mass Ejections", color: TYPE_COLOR.cme, hint: "NASA DONKI · CME" },
  { key: "gst", label: "Geomagnetic Storms", color: TYPE_COLOR.gst, hint: "NASA DONKI · GST" },
  { key: "neo", label: "Near-Earth Objects", color: TYPE_COLOR.neo, hint: "NASA NeoWs feed" },
  { key: "fireball", label: "Fireballs / Bolides", color: TYPE_COLOR.fireball, hint: "JPL CNEOS atmospheric impacts" },
  { key: "orbits", label: "Earth Orbital Zones", color: "#64748b", hint: "LEO · MEO · GEO · HEO" },
  { key: "vanAllen", label: "Van Allen Belts", color: "#c4b5fd", hint: "Inner & outer radiation belts" },
  { key: "missions", label: "Spacecraft Assets", color: "#22d3ee", hint: "Curated catalog" },
];

const TYPE_LABEL: Record<Mission["type"], string> = {
  leo: "LEO",
  lagrange: "LAGRANGE",
  lunar: "LUNAR",
  deep: "DEEP SPACE",
  mars: "MARS",
};

export function RightRail() {
  const { layers, toggleLayer, events, selectedId, select, selectedMissionId, selectMission, selectedInfoId, selectInfo } = useDash();
  const selected = useMemo(() => events.find((e) => e.id === selectedId), [events, selectedId]);
  const selectedMission = useMemo(() => MISSIONS.find((m) => m.id === selectedMissionId), [selectedMissionId]);
  const selectedInfo = selectedInfoId ? INFO_CARDS[selectedInfoId] : undefined;

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedMissionId && cardRefs.current[selectedMissionId]) {
      cardRefs.current[selectedMissionId]?.scrollIntoView({ behavior: "auto", block: "nearest" });
    }
  }, [selectedMissionId]);

  useEffect(() => {
    if ((selectedId || selectedInfoId) && scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [selectedId, selectedInfoId]);


  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-cyan-950/60 bg-[#070b14] font-mono text-[11px] text-slate-300">
      <div className="border-b border-cyan-950/60 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] tracking-[0.25em] text-slate-400">DATA LAYERS</span>
          <span className="text-[10px] tracking-widest text-slate-500">{LAYER_DEFS.length} AVAILABLE</span>
        </div>
      </div>

      <div className="border-b border-cyan-950/60 px-4 py-3">
        <div className="space-y-1.5">
          {LAYER_DEFS.map((l) => {
            const on = layers[l.key];
            return (
              <button
                key={l.key}
                onClick={() => toggleLayer(l.key)}
                className={`flex w-full items-center justify-between border px-2 py-1.5 text-left transition ${
                  on
                    ? "border-cyan-700/60 bg-cyan-950/30 text-cyan-100"
                    : "border-slate-800 bg-transparent text-slate-500 hover:border-slate-700"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color, boxShadow: on ? `0 0 8px ${l.color}` : "none" }} />
                  <span className="tracking-wider">{l.label}</span>
                </span>
                <span className="text-[9px] uppercase tracking-widest text-slate-600">{on ? "ON" : "OFF"}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {/* Selected info overlay (Van Allen, etc.) */}
        {selectedInfo && (
          <div className="border-b border-purple-900/60 bg-purple-950/10 px-4 py-3">
            <div className="mb-2 flex items-center justify-between text-[10px] tracking-[0.25em] text-purple-300">
              <span>{selectedInfo.category}</span>
              <button onClick={() => selectInfo(null)} className="text-slate-600 hover:text-slate-300">CLEAR ✕</button>
            </div>
            <h3 className="text-base font-semibold tracking-tight text-slate-100">{selectedInfo.title}</h3>
            <div className="mt-0.5 text-[10px] text-purple-200/70">{selectedInfo.subtitle}</div>
            <p className="mt-2 border-l-2 border-purple-500/60 bg-purple-950/30 px-3 py-2 text-[12px] leading-relaxed text-purple-50">
              {selectedInfo.description}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
              {selectedInfo.details.map(([k, v]) => (
                <div key={k} className="border-b border-slate-900/80 pb-1">
                  <dt className="text-[9px] uppercase tracking-widest text-slate-500">{k}</dt>
                  <dd className="text-[11px] text-slate-200">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* Selected event */}
        {selected && (
          <div className="border-b border-cyan-950/60 px-4 py-3">
            <div className="mb-2 flex items-center justify-between text-[10px] tracking-[0.25em] text-slate-500">
              <span>SELECTED EVENT</span>
              <button onClick={() => select(null)} className="text-slate-600 hover:text-slate-300">CLEAR ✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-[10px] tracking-[0.2em] text-slate-500">{selected.type.toUpperCase()}</div>
                <h3 className="mt-0.5 text-base font-semibold tracking-tight text-slate-100">{selected.title}</h3>
                <div className="mt-1 text-[10px] text-slate-500">{new Date(selected.time).toISOString().replace("T", " ").slice(0, 19)} UTC</div>
              </div>

              <div className="flex items-center gap-2 border border-slate-800 bg-black/40 px-2 py-1.5">
                <span className="text-[10px] tracking-widest text-slate-500">THREAT</span>
                <span
                  className="rounded-sm px-2 py-0.5 text-[10px] font-semibold tracking-widest"
                  style={{ background: THREAT_COLOR[selected.threat], color: "#0b0e16" }}
                >
                  {THREAT_LABEL[selected.threat].toUpperCase()}
                </span>
              </div>

              <p className="border-l-2 border-cyan-700/60 bg-cyan-950/20 px-3 py-2 text-[12px] leading-relaxed text-cyan-50">
                {selected.layman}
              </p>

              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {selected.details.map(([k, v]) => (
                  <div key={k} className="border-b border-slate-900/80 pb-1">
                    <dt className="text-[9px] uppercase tracking-widest text-slate-500">{k}</dt>
                    <dd className="text-[11px] text-slate-200">{v}</dd>
                  </div>
                ))}
              </dl>

              <details className="border border-slate-900 bg-black/40">
                <summary className="cursor-pointer px-2 py-1 text-[10px] tracking-widest text-slate-500 hover:text-slate-300">
                  RAW NASA PAYLOAD
                </summary>
                <pre className="max-h-64 overflow-auto px-2 py-2 text-[10px] leading-snug text-slate-400">
                  {JSON.stringify(selected.raw, null, 2)}
                </pre>
              </details>
            </div>
          </div>
        )}

        {/* Spacecraft assets */}
        <div className="px-4 py-3">
          <div className="mb-2 flex items-center justify-between text-[10px] tracking-[0.25em] text-slate-500">
            <span>SPACECRAFT ASSETS</span>
            <span className="text-slate-600">{MISSIONS.length}</span>
          </div>

          <div className="space-y-2">
            {MISSIONS.map((m) => {
              const active = selectedMissionId === m.id;
              return (
                <div
                  key={m.id}
                  ref={(el) => { cardRefs.current[m.id] = el; }}
                  className={`border transition ${
                    active
                      ? "border-cyan-600/70 bg-cyan-950/30"
                      : "border-slate-800/80 bg-black/30 hover:border-slate-700"
                  }`}
                >
                  <button
                    onClick={() => selectMission(active ? null : m.id)}
                    className="flex w-full items-center justify-between px-2.5 py-2 text-left"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-base leading-none">{m.flag}</span>
                      <span>
                        <span className="block text-[12px] font-semibold tracking-wider text-slate-100">{m.name}</span>
                        <span className="block text-[9px] tracking-widest text-slate-500">{TYPE_LABEL[m.type]} · {m.country}</span>
                      </span>
                    </span>
                    <span
                      className={`rounded-sm px-1.5 py-0.5 text-[8px] tracking-widest ${
                        m.status === "active"
                          ? "bg-emerald-950/60 text-emerald-300"
                          : "bg-amber-950/60 text-amber-300"
                      }`}
                    >
                      {m.status.toUpperCase()}
                    </span>
                  </button>

                  {active && (
                    <div className="space-y-2 border-t border-slate-800/80 px-2.5 py-2">
                      <div className="text-[11px] leading-snug text-slate-200">{m.fullName}</div>
                      <p className="text-[10px] leading-relaxed text-slate-400">{m.description}</p>
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                        <Spec k="Agency" v={m.agency} />
                        <Spec k="Launched" v={m.launched} />
                        <Spec k="Mass" v={m.mass} />
                        {m.crew && <Spec k="Crew" v={m.crew} />}
                        <Spec k="Orbit" v={m.orbit} wide />
                        <Spec k="Payload" v={m.payload} wide />
                        <Spec k="Mission" v={m.mission} wide />
                      </dl>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {selectedMission && (
            <button
              onClick={() => selectMission(null)}
              className="mt-3 w-full border border-slate-800 px-2 py-1 text-[10px] tracking-widest text-slate-500 hover:border-slate-700 hover:text-slate-300"
            >
              COLLAPSE ✕
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

function Spec({ k, v, wide }: { k: string; v: string; wide?: boolean }) {
  return (
    <div className={`border-b border-slate-900/80 pb-1 ${wide ? "col-span-2" : ""}`}>
      <dt className="text-[9px] uppercase tracking-widest text-slate-500">{k}</dt>
      <dd className="text-[11px] leading-snug text-slate-200">{v}</dd>
    </div>
  );
}
