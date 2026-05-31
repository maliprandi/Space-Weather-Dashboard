import {
  cmeThreat,
  fireballThreat,
  flareThreat,
  gstThreat,
  neoThreat,
  laymanCme,
  laymanFireball,
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

// ---------- CNEOS Fireball Data API (JPL) ----------
// Public, CORS-enabled. Docs: https://ssd-api.jpl.nasa.gov/doc/fireball.html
// Columns: date, energy (kt approx radiated, 10^10 J units), impact-e (kt total),
// lat, lat-dir, lon, lon-dir, alt (km), vel (km/s).
export interface FireballApiResponse {
  signature: { source: string; version: string };
  count: string;
  fields: string[];
  data: (string | null)[][];
}

export async function fetchFireballs(start: string, end: string): Promise<FireballApiResponse> {
  const url = `https://ssd-api.jpl.nasa.gov/fireball.api?date-min=${start}&date-max=${end}&req-loc=true`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fireball ${r.status}: ${await r.text()}`);
  return (await r.json()) as FireballApiResponse;
}

function signedLatLon(value: string | null, dir: string | null): number | undefined {
  if (value == null || dir == null) return undefined;
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return undefined;
  return dir === "S" || dir === "W" ? -n : n;
}

export function normalizeFireballs(fb: FireballApiResponse): DashEvent[] {
  const out: DashEvent[] = [];
  if (!fb?.fields || !fb?.data) return out;
  const idx = (k: string) => fb.fields.indexOf(k);
  const iDate = idx("date");
  const iEnergy = idx("energy");
  const iImpact = idx("impact-e");
  const iLat = idx("lat"), iLatDir = idx("lat-dir");
  const iLon = idx("lon"), iLonDir = idx("lon-dir");
  const iAlt = idx("alt");
  const iVel = idx("vel");

  for (const row of fb.data) {
    const dateStr = row[iDate];
    if (!dateStr) continue;
    // API returns "YYYY-MM-DD HH:MM:SS" UTC
    const t = Date.parse(dateStr.replace(" ", "T") + "Z");
    if (!t) continue;
    const energy = iEnergy >= 0 && row[iEnergy] != null ? parseFloat(row[iEnergy]!) : NaN;
    const impactE = iImpact >= 0 && row[iImpact] != null ? parseFloat(row[iImpact]!) : NaN;
    const lat = iLat >= 0 ? signedLatLon(row[iLat], row[iLatDir]) : undefined;
    const lon = iLon >= 0 ? signedLatLon(row[iLon], row[iLonDir]) : undefined;
    const alt = iAlt >= 0 && row[iAlt] != null ? parseFloat(row[iAlt]!) : NaN;
    const vel = iVel >= 0 && row[iVel] != null ? parseFloat(row[iVel]!) : NaN;
    const e = Number.isFinite(impactE) ? impactE : Number.isFinite(energy) ? energy : 0;
    const loc = lat != null && lon != null
      ? `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`
      : null;

    // Stable angle from lon for placement around Earth (or hash fallback).
    let angleDeg: number;
    if (lon != null) {
      angleDeg = ((lon + 360) % 360);
    } else {
      let h = 0;
      const s = dateStr;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      angleDeg = ((h % 360) + 360) % 360;
    }

    out.push({
      id: `fb-${t}-${lat ?? "x"}-${lon ?? "x"}`,
      type: "fireball",
      time: t,
      title: `Fireball · ${e >= 1 ? e.toFixed(1) : e.toFixed(2)} kt`,
      layman: laymanFireball(e, loc),
      threat: fireballThreat(e),
      details: [
        ["Date (UTC)", dateStr],
        ["Impact energy", Number.isFinite(impactE) ? `${impactE.toFixed(3)} kt TNT` : "—"],
        ["Radiated energy", Number.isFinite(energy) ? `${energy.toFixed(3)} × 10¹⁰ J` : "—"],
        ["Location", loc ?? "—"],
        ["Altitude", Number.isFinite(alt) ? `${alt.toFixed(1)} km` : "—"],
        ["Velocity", Number.isFinite(vel) ? `${vel.toFixed(2)} km/s` : "—"],
      ],
      raw: row,
      angleDeg,
      energyKt: Number.isFinite(energy) ? energy : undefined,
      impactEnergyKt: Number.isFinite(impactE) ? impactE : undefined,
      lat,
      lon,
      altKm: Number.isFinite(alt) ? alt : undefined,
      speed: Number.isFinite(vel) ? vel : undefined,
      locationLabel: loc,
    });
  }
  return out;
}

