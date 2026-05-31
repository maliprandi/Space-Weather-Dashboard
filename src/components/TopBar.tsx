import { useEffect, useState } from "react";
import { useDash } from "@/state/dashboard";
import { TYPE_COLOR } from "@/lib/eventColors";

export function TopBar() {
  const { events, loading, error, playing } = useDash();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const counts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-cyan-950/60 bg-[#070b14] px-5 font-mono text-[11px] tracking-widest text-slate-300">
      <div className="flex items-center gap-4">
        <div className="text-[18px] font-semibold tracking-[0.2em] text-slate-100">
          SPACE WEATHER DASHBOARD
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-sm border px-3 py-1 text-[11px] font-semibold tracking-widest ${
              playing
                ? "border-emerald-600/60 bg-emerald-950/40 text-emerald-300"
                : "border-slate-700/60 bg-slate-900/40 text-slate-500"
            }`}
          >
            ● SIM
          </span>
          {loading && <span className="text-amber-300">LOADING...</span>}
          {error && <span className="text-red-400">ERR · {error}</span>}
        </div>
      </div>

      <div className="flex items-center gap-5 text-[10px]">
        <Counter label="FLR" value={counts.flare ?? 0} color={TYPE_COLOR.flare} />
        <Counter label="CME" value={counts.cme ?? 0} color={TYPE_COLOR.cme} />
        <Counter label="GST" value={counts.gst ?? 0} color={TYPE_COLOR.gst} />
        <Counter label="NEO" value={counts.neo ?? 0} color={TYPE_COLOR.neo} />
        <Counter label="FIR" value={counts.fireball ?? 0} color={TYPE_COLOR.fireball} />
        <div className="border-l border-slate-800 pl-5">
          <div className="text-slate-500">UTC</div>
          <div className="text-slate-100">{now.toISOString().replace("T", " ").slice(0, 19)}</div>
        </div>
      </div>

    </header>
  );
}

function Counter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-100">{value}</span>
    </div>
  );
}
