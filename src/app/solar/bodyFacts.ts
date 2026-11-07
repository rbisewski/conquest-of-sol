// Facts about a solar-system body for the Celestial Body panel: its class, surface gravity,
// orbit figures and distance from the Earth. Display only (Math trigonometry is fine here); the
// launch window, which the simulation also uses, is in src/sim/transfers.ts.

import type { Content, SpaceBodyDef } from "../../sim/content";
import { orbitalPeriod, solarPositions, type Vec3 } from "../../sim/orbits";

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
    case "asteroidalMoon":
      return "Asteroidal Moon";
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

/** The moons orbiting this body, planetary and asteroidal, innermost first. */
export function moonsOf(content: Content, id: string): SpaceBodyDef[] {
  return content.solarSystem.filter((b) => b.parent === id && b.orbit).sort((a, b) => a.orbit!.a - b.orbit!.a);
}
