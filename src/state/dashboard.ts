import { create } from "zustand";
import type { DashEvent, EventType } from "@/lib/nasa";

export type LayerKey = EventType | "missions" | "orbits" | "vanAllen";

interface DashState {
  events: DashEvent[];
  setEvents: (e: DashEvent[]) => void;

  cursorTime: number; // ms epoch
  setCursor: (t: number) => void;

  windowStart: number;
  windowEnd: number;
  setWindow: (s: number, e: number) => void;

  playing: boolean;
  setPlaying: (p: boolean) => void;
  speed: number; // ms of sim per ms of real
  setSpeed: (s: number) => void;

  layers: Record<LayerKey, boolean>;
  toggleLayer: (k: LayerKey) => void;

  selectedId: string | null;
  select: (id: string | null) => void;

  selectedMissionId: string | null;
  selectMission: (id: string | null) => void;

  selectedInfoId: string | null;
  selectInfo: (id: string | null) => void;


  loading: boolean;
  setLoading: (l: boolean) => void;
  error: string | null;
  setError: (e: string | null) => void;
}

const now = Date.now();
const monthAgo = now - 30 * 24 * 3600_000;

export const useDash = create<DashState>((set) => ({
  events: [],
  setEvents: (events) => set({ events }),

  cursorTime: now,
  setCursor: (cursorTime) => set({ cursorTime }),

  windowStart: monthAgo,
  windowEnd: now,
  setWindow: (windowStart, windowEnd) => set({ windowStart, windowEnd }),

  playing: false,
  setPlaying: (playing) => set({ playing }),
  speed: 6 * 3600_000, // 6h sim per 1s real (will multiply by 16ms tick)
  setSpeed: (speed) => set({ speed }),

  layers: { flare: true, cme: true, gst: true, neo: true, fireball: true, missions: true, orbits: true, vanAllen: false },
  toggleLayer: (k) =>
    set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),

  selectedId: null,
  select: (selectedId) => set({ selectedId, selectedMissionId: null, selectedInfoId: null }),

  selectedMissionId: null,
  selectMission: (selectedMissionId) => set({ selectedMissionId, selectedId: null, selectedInfoId: null }),

  selectedInfoId: null,
  selectInfo: (selectedInfoId) => set({ selectedInfoId, selectedId: null, selectedMissionId: null }),


  loading: false,
  setLoading: (loading) => set({ loading }),
  error: null,
  setError: (error) => set({ error }),
}));
