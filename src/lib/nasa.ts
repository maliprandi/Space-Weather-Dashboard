import {
  cmeThreat,
  flareThreat,
  gstThreat,
  neoThreat,
  laymanCme,
  laymanFlare,
  laymanGst,
  laymanNeo,
  type ThreatLevel,
} from "./threat";

export type EventType = "flare" | "cme" | "gst" | "neo" | "fireball";

export interface DashEvent {
  id: string;
  type: EventType;
  time: number; // ms epoch
  endTime?: number; // ms epoch
  title: string;
  layman: string;
  threat: ThreatLevel;
  details: Array<[string, string]>;
  raw: unknown;
  // viz hints
  angleDeg?: number; // direction of travel from origin
  speed?: number; // km/s for cme
  earthDirected?: boolean;
  missLD?: number; // neo: miss distance in lunar distances
  diameter?: number; // neo: avg diameter in meters
  // fireball
  energyKt?: number; // total radiated energy, kilotons TNT
  impactEnergyKt?: number; // total impact energy
  lat?: number; // signed latitude (N+/S-)
  lon?: number; // signed longitude (E+/W-)
  altKm?: number; // altitude of peak brightness
  locationLabel?: string | null; // e.g. "Boston, MA region"
}

const LD_KM = 384_400;

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function rangeLastNDays(n: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - n);
  return { start: isoDay(start), end: isoDay(end) };
}

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

async function callFn<T>(name: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const url = `${FUNCTIONS_URL}/${name}${qs ? `?${qs}` : ""}`;
  const r = await fetch(url, {
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
    },
  });
  if (!r.ok) throw new Error(`${name} ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}

export async function fetchDonki(start: string, end: string) {
  return callFn<Record<"FLR" | "CME" | "GST", any[]>>("nasa-donki", { startDate: start, endDate: end });
}
export async function fetchNeos(start: string, end: string) {
  return callFn<{ near_earth_objects: Record<string, any[]> }>("nasa-neows", { startDate: start, endDate: end });
}
export async function fetchEpic() {
  return callFn<{ latest: any; imageUrl: string | null }>("nasa-epic", {});
}

function angleFromSunToEarth(longitudeDeg: number | null | undefined): number {
  // Sun is left, Earth is right => 0° = pointing right toward Earth.
  // Use heliographic longitude as a small angular offset; positive west.
  if (longitudeDeg == null) return 0;
  return Math.max(-80, Math.min(80, longitudeDeg));
}

export function normalizeDonki(donki: Record<"FLR" | "CME" | "GST", any[]>): DashEvent[] {
  const out: DashEvent[] = [];
  for (const f of donki.FLR ?? []) {
    const cls = f.classType ?? "";
    const t = Date.parse(f.beginTime ?? f.peakTime ?? f.endTime);
    if (!t) continue;
    out.push({
      id: `flr-${f.flrID ?? t}`,
      type: "flare",
      time: t,
      endTime: f.endTime ? Date.parse(f.endTime) : undefined,
      title: `Solar Flare ${cls}`,
      layman: laymanFlare(cls),
      threat: flareThreat(cls),
      details: [
        ["Class", cls],
        ["Source region", f.sourceLocation ?? "—"],
        ["Active region", f.activeRegionNum ? String(f.activeRegionNum) : "—"],
        ["Peak time", f.peakTime ?? "—"],
      ],
      raw: f,
    });
  }
  for (const c of donki.CME ?? []) {
    const t = Date.parse(c.startTime);
    if (!t) continue;
    const analysis = (c.cmeAnalyses ?? [])[0];
    const speed = analysis?.speed ?? null;
    const lon = analysis?.longitude;
    const lat = analysis?.latitude;
    const earthDirected = (c.linkedEvents ?? []).some((e: any) => /Earth/i.test(JSON.stringify(e))) ||
      (lon != null && Math.abs(lon) < 30 && lat != null && Math.abs(lat) < 30);
    out.push({
      id: `cme-${c.activityID ?? t}`,
      type: "cme",
      time: t,
      title: speed ? `CME · ${Math.round(speed)} km/s` : "Coronal Mass Ejection",
      layman: laymanCme(speed, earthDirected),
      threat: cmeThreat(speed, earthDirected),
      details: [
        ["Speed", speed ? `${Math.round(speed)} km/s` : "—"],
        ["Type", analysis?.type ?? "—"],
        ["Half angle", analysis?.halfAngle != null ? `${analysis.halfAngle}°` : "—"],
        ["Longitude", lon != null ? `${lon}°` : "—"],
        ["Latitude", lat != null ? `${lat}°` : "—"],
        ["Earth directed", earthDirected ? "Yes" : "No"],
        ["Source", c.sourceLocation ?? "—"],
      ],
      raw: c,
      angleDeg: angleFromSunToEarth(lon),
      speed: speed ?? undefined,
      earthDirected,
    });
  }
  for (const g of donki.GST ?? []) {
    const t = Date.parse(g.startTime);
    if (!t) continue;
    const kp = Math.max(0, ...((g.allKpIndex ?? []).map((k: any) => k.kpIndex ?? 0)));
    out.push({
      id: `gst-${g.gstID ?? t}`,
      type: "gst",
      time: t,
      title: `Geomagnetic Storm · Kp ${kp}`,
      layman: laymanGst(kp),
      threat: gstThreat(kp),
      details: [
        ["Max Kp", String(kp)],
        ["Start", g.startTime],
        ["Observations", String((g.allKpIndex ?? []).length)],
      ],
      raw: g,
    });
  }
  return out;
}

export function normalizeNeos(neo: { near_earth_objects: Record<string, any[]> }): DashEvent[] {
  const out: DashEvent[] = [];
  for (const [_day, list] of Object.entries(neo.near_earth_objects ?? {})) {
    for (const n of list) {
      const ca = n.close_approach_data?.[0];
      if (!ca) continue;
      const t = Date.parse(ca.close_approach_date_full ?? ca.close_approach_date);
      if (!t) continue;
      const dmin = n.estimated_diameter?.meters?.estimated_diameter_min ?? 0;
      const dmax = n.estimated_diameter?.meters?.estimated_diameter_max ?? 0;
      const diameter = (dmin + dmax) / 2;
      const missKm = parseFloat(ca.miss_distance?.kilometers ?? "0");
      const missLD = missKm / LD_KM;
      const velocity = parseFloat(ca.relative_velocity?.kilometers_per_second ?? "0");
      const hazardous = !!n.is_potentially_hazardous_asteroid;
      // Stable hash → spread NEOs evenly around Earth (0–360°)
      let h = 0;
      const s = String(n.id ?? n.name ?? "");
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      const angleDeg = (((h % 360) + 360) % 360);
      out.push({
        id: `neo-${n.id}-${t}`,
        type: "neo",
        time: t,
        title: n.name,
        layman: laymanNeo(n.name, diameter, missLD, hazardous),
        threat: neoThreat(diameter, missLD, hazardous),
        details: [
          ["Diameter", `${Math.round(dmin)}–${Math.round(dmax)} m`],
          ["Miss distance", `${missLD.toFixed(2)} LD (${Math.round(missKm).toLocaleString()} km)`],
          ["Velocity", `${velocity.toFixed(2)} km/s`],
          ["Hazardous", hazardous ? "Yes" : "No"],
          ["Magnitude", String(n.absolute_magnitude_h ?? "—")],
        ],
        raw: n,
        angleDeg,
        missLD,
        diameter,
      });
    }
  }
  return out;
}
