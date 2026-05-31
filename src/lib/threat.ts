export type ThreatLevel = "none" | "low" | "moderate" | "high" | "severe";

export const THREAT_COLOR: Record<ThreatLevel, string> = {
  none: "#3b82f6",
  low: "#22c55e",
  moderate: "#eab308",
  high: "#f97316",
  severe: "#ef4444",
};

export const THREAT_LABEL: Record<ThreatLevel, string> = {
  none: "Nominal",
  low: "Low",
  moderate: "Moderate",
  high: "High",
  severe: "Severe",
};

export function flareThreat(cls: string): ThreatLevel {
  const c = (cls || "").toUpperCase();
  if (c.startsWith("X")) {
    const n = parseFloat(c.slice(1)) || 1;
    return n >= 5 ? "severe" : "high";
  }
  if (c.startsWith("M")) return "moderate";
  if (c.startsWith("C")) return "low";
  return "none";
}

export function cmeThreat(speedKms: number | null, earthDirected: boolean): ThreatLevel {
  if (!speedKms) return earthDirected ? "low" : "none";
  if (speedKms >= 2000 && earthDirected) return "severe";
  if (speedKms >= 1500) return earthDirected ? "high" : "moderate";
  if (speedKms >= 800) return earthDirected ? "moderate" : "low";
  return earthDirected ? "low" : "none";
}

export function gstThreat(kp: number): ThreatLevel {
  if (kp >= 8) return "severe";
  if (kp >= 7) return "high";
  if (kp >= 6) return "moderate";
  if (kp >= 5) return "low";
  return "none";
}

export function neoThreat(diameterM: number, missLD: number, hazardous: boolean): ThreatLevel {
  let lvl: ThreatLevel = "none";
  if (diameterM >= 140 && missLD < 1) lvl = "high";
  else if (diameterM >= 50 && missLD < 5) lvl = "moderate";
  else if (missLD < 20) lvl = "low";
  if (hazardous && lvl === "none") lvl = "low";
  if (hazardous && lvl === "low") lvl = "moderate";
  return lvl;
}

// Energy in kilotons of TNT equivalent. Chelyabinsk ≈ 440 kt, Tunguska ≈ 10–15 Mt.
export function fireballThreat(energyKt: number): ThreatLevel {
  if (energyKt >= 100) return "severe";
  if (energyKt >= 10) return "high";
  if (energyKt >= 1) return "moderate";
  if (energyKt >= 0.1) return "low";
  return "none";
}

export function laymanFireball(energyKt: number, location: string | null): string {
  const where = location ? ` over ${location}` : "";
  if (energyKt >= 100)
    return `A massive bolide${where} released ${energyKt.toFixed(1)} kt of energy — comparable to a nuclear weapon, capable of shattering windows and causing injuries on the ground.`;
  if (energyKt >= 10)
    return `A large fireball${where} released ${energyKt.toFixed(1)} kt of energy. Likely seen for hundreds of km and heard as a sonic boom.`;
  if (energyKt >= 1)
    return `A bright fireball${where} released ${energyKt.toFixed(2)} kt of energy — brighter than the full moon and visible across a wide region.`;
  if (energyKt >= 0.1)
    return `A modest fireball${where} released ${energyKt.toFixed(2)} kt of energy. Bright enough to be seen by casual observers under clear skies.`;
  return `A small bolide${where} detected by US Government sensors. Minor flash with no surface effects.`;
}

export function laymanFlare(cls: string): string {
  const c = (cls || "").toUpperCase();
  if (c.startsWith("X"))
    return "A major solar flare. Expect possible radio blackouts on Earth's sunlit side and risks to satellites and astronauts.";
  if (c.startsWith("M"))
    return "A medium solar flare. Brief radio blackouts in polar regions are possible.";
  if (c.startsWith("C"))
    return "A small solar flare. Few noticeable effects on Earth.";
  return "A minor solar flare with negligible effects on Earth.";
}

export function laymanCme(speed: number | null, earth: boolean): string {
  const dir = earth ? "It is heading toward Earth" : "It is not aimed at Earth";
  if (!speed) return `A burst of plasma launched from the Sun. ${dir}.`;
  if (speed >= 2000)
    return `An extremely fast coronal mass ejection (${Math.round(speed)} km/s). ${dir}; could trigger a strong geomagnetic storm.`;
  if (speed >= 1000)
    return `A fast coronal mass ejection (${Math.round(speed)} km/s). ${dir}; may cause auroras and minor satellite disruption.`;
  return `A coronal mass ejection moving at ${Math.round(speed)} km/s. ${dir}.`;
}

export function laymanGst(kp: number): string {
  if (kp >= 8) return "A severe geomagnetic storm. Power grid and satellite disruptions possible; auroras visible at low latitudes.";
  if (kp >= 7) return "A strong geomagnetic storm. Auroras visible far from the poles; minor satellite issues likely.";
  if (kp >= 6) return "A moderate geomagnetic storm. Auroras at higher latitudes; weak power grid effects.";
  if (kp >= 5) return "A minor geomagnetic storm. Auroras possible at high latitudes.";
  return "Mild geomagnetic activity with little practical impact.";
}

export function laymanNeo(name: string, diameter: number, missLD: number, hazardous: boolean): string {
  const sz = diameter >= 140 ? "a regional-impact-class" : diameter >= 30 ? "a city-block-sized" : "a small";
  const haz = hazardous ? " It is classified as potentially hazardous, but no impact is predicted." : " No impact is predicted.";
  return `${name} is ${sz} asteroid passing at ${missLD.toFixed(2)} lunar distances from Earth.${haz}`;
}
