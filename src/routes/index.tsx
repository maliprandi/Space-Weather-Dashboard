import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { SpaceCanvas } from "@/components/SpaceCanvas";
import { RightRail } from "@/components/RightRail";
import { Timeline } from "@/components/Timeline";
import { TopBar } from "@/components/TopBar";
import { useDash } from "@/state/dashboard";
import { fetchDonki, fetchFireballs, fetchNeos, normalizeDonki, normalizeFireballs, normalizeNeos, rangeLastNDays } from "@/lib/nasa";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { setEvents, setLoading, setError, setWindow } = useDash();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const { start, end } = rangeLastNDays(30);
        const startMs = Date.parse(start + "T00:00:00Z");
        const endMs = Date.parse(end + "T23:59:59Z");
        setWindow(startMs, endMs);
        useDash.getState().setCursor(endMs);

        const [donki, neos] = await Promise.all([
          fetchDonki(start, end).catch((e) => { console.error(e); return { FLR: [], CME: [], GST: [] }; }),
          fetchNeos(start, end).catch((e) => { console.error(e); return { near_earth_objects: {} }; }),
        ]);
        if (cancelled) return;
        const evs = [...normalizeDonki(donki as any), ...normalizeNeos(neos as any)].sort((a, b) => a.time - b.time);
        setEvents(evs);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load NASA data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [setEvents, setLoading, setError, setWindow]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
      e.preventDefault();
      const s = useDash.getState();
      s.setPlaying(!s.playing);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);


  return (
    <div className="dark flex h-screen w-screen flex-col overflow-hidden bg-[#05070d] text-slate-100">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          <SpaceCanvas />
        </main>
        <RightRail />
      </div>
      <Timeline />
    </div>
  );
}
