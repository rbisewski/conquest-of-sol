// Facts about a solar-system body for the Celestial Body panel: its class, surface gravity,
// orbit figures, distance from the Earth and the next launch window from the Earth. Display
// only (Math trigonometry is fine here); the launch window is the classic Hohmann estimate
// for circular, coplanar orbits, so it is approximate for eccentric or inclined ones.

import type { Content, SpaceBodyDef } from "../../sim/content";
import { meanMotion, orbitalPeriod, solarPositions, type Vec3 } from "../../sim/orbits";

const G = 6.674e-11;
const AU_KM = 149597870.7;
const STANDARD_GRAVITY = 9.80665;

const GAS_GIANTS = new Set(["Jupiter", "Saturn"]);
const ICE_GIANTS = new Set(["Uranus", "Neptune"]);

/** Terra Invicta's heading for the panel: "Terrestrial Planet", "Gas Giant", "Planetary Moon"… */
export function bodyClass(body: SpaceBodyDef): string {
  switch (body.type) {
    case "star":
      return "Star";
    case "planet":
      return GAS_GIANTS.has(body.id) ? "Gas Giant" : ICE_GIANTS.has(body.id) ? "Ice Giant" : "Terrestrial Planet";
    case "moon":
      return "Planetary Moon";
    case "dwarf":
      return "Dwarf Planet";
    case "asteroid":
      return "Asteroid";
    case "comet":
      return "Comet";
  }
}

/** Surface gravity in g, or null when the mass isn't known. */
export function surfaceGravity(body: SpaceBodyDef): number | null {
  if (!body.massKg || !body.radiusKm) return null;
  const r = body.radiusKm * 1000;
  return (G * body.massKg) / (r * r) / STANDARD_GRAVITY;
}

const byId = (content: Content, id: string) => content.solarSystem.find((b) => b.id === id)!;

/** Escape velocity from the surface in km/s, or null when the mass isn't known. */
export function escapeVelocity(body: SpaceBodyDef): number | null {
  if (!body.massKg || !body.radiusKm) return null;
  return Math.sqrt((2 * G * body.massKg) / (body.radiusKm * 1000)) / 1000;
}

/** Orbital period in days, and mean orbital speed in km/s. */
export function orbitFigures(content: Content, body: SpaceBodyDef): { periodDays: number; speedKms: number } | null {
  if (!body.orbit || !body.parent) return null;
  const parent = byId(content, body.parent);
  const years = orbitalPeriod(body.orbit, parent.massKg, body.massKg);
  const circumferenceKm = 2 * Math.PI * body.orbit.a * AU_KM;
  return { periodDays: years * 365.25, speedKms: circumferenceKm / (years * 365.25 * 86400) };
}

const dist = (p: Vec3, q: Vec3) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);

/** How far the body is from the Earth now, in AU. */
export function distanceFromEarth(content: Content, id: string, years: number): number {
  const at = solarPositions(content, years);
  return dist(at.get(id)!, at.get("Earth")!);
}

/**
 * The next Hohmann launch window from the Earth to a body (to its planet, for a moon of
 * another planet): years from now until the window opens, and the transfer's length in years.
 * Null for the Sun, the Earth and the Moon.
 */
export function launchWindow(content: Content, id: string, years: number): { inYears: number; transferYears: number } | null {
  let target = byId(content, id);
  while (target.parent && target.parent !== "Sol" && target.parent !== "Earth") target = byId(content, target.parent);
  if (target.parent !== "Sol" || target.id === "Earth" || !target.orbit) return null;
  const sun = byId(content, "Sol");
  const earth = byId(content, "Earth");
  const a1 = earth.orbit!.a;
  const a2 = target.orbit.a;
  const half = ((a1 + a2) / 2) * AU_KM * 1000;
  const transferYears = (Math.PI * Math.sqrt((half * half * half) / (G * sun.massKg))) / 31557600;
  const n1 = meanMotion(earth.orbit!, sun.massKg, earth.massKg);
  const n2 = meanMotion(target.orbit, sun.massKg, target.massKg);
  // The target must lead the Earth by this much at launch, so that it arrives as we do.
  const needed = Math.PI - n2 * transferYears;
  const at = solarPositions(content, years);
  const e = at.get("Earth")!;
  const t = at.get(target.id)!;
  const lead = Math.atan2(t.y, t.x) - Math.atan2(e.y, e.x);
  const rate = n2 - n1;
  const synodic = (2 * Math.PI) / Math.abs(rate);
  const wait = (needed - lead) / rate;
  return { inYears: ((wait % synodic) + synodic) % synodic, transferYears };
}

/** The bodies orbiting this one directly, among those drawn as discs (moons of a planet). */
export function moonsOf(content: Content, id: string): SpaceBodyDef[] {
  return content.solarSystem.filter((b) => b.parent === id && b.type === "moon");
}
