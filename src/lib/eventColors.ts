import type { EventType } from "@/lib/nasa";

// Canonical per-type colors used across legend, top bar counters,
// canvas nodes, arrows, and timeline markers.
export const TYPE_COLOR: Record<EventType, string> = {
  flare: "#f97316", // orange
  cme: "#eab308",   // yellow
  gst: "#a78bfa",   // purple
  neo: "#22c55e",   // green
  fireball: "#ec4899", // pink/magenta — atmospheric impact
};
