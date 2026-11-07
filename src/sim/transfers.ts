// Transfers from the Earth (SPEC 2.10.1; docs/formulas.md, "Space"): the Hohmann estimate behind
// launch windows, how long probes and boost deliveries take, and the Δv from low Earth orbit to
// every orbit and hab site, by patched conics on circular, coplanar orbits. Positions and angles
// use the deterministic math of detmath.ts, so the simulation can schedule arrivals by them.

import type { Content, HabOrbitDef, SpaceBodyDef } from "./content";
import { detAtan2, detPow } from "./detmath";
import { FormulaBuilder, type Breakdown } from "./formula";
import { meanMotion, orbitPosition, spaceBody } from "./orbits";

const G = 6.674e-11;
const AU_M = 149597870700;
const YEAR_S = 31557600;
const PI = 3.141592653589793;
const TWO_PI = 6.283185307179586;
/** An orbit the game gives no height (a small body's parking orbit, some low orbits) is taken this many radii from the body's centre (**inferred**). */
const UNSET_ORBIT_RADII = 1.1;

export interface Transfer {
  /** The Hohmann transfer's length, Julian years. */
  transferYears: number;
  /**
   * For a transfer round the Sun: years from now until the next launch window opens, and the
   * time from one window to the next (the synodic period). Null within the Earth's own system,
   * where a transfer can leave at any time.
   */
  window: { inYears: number; synodicYears: number } | null;
}

/** Where something is sent from the Earth: one of the orbits, or a hab site on a body's surface. */
export type Destination = { kind: "orbit"; id: string } | { kind: "site"; id: string };

/** The body round the Sun whose orbit a transfer from the Earth must reach: the body's planet, or the body itself. */
function heliocentric(content: Content, id: string): SpaceBodyDef {
  let body = spaceBody(content, id);
  while (body.parent && body.parent !== "Sol") body = spaceBody(content, body.parent);
  return body;
}

/** Half the period of an ellipse of semi-major axis a (m) round a mass, in Julian years. */
function halfPeriodYears(a: number, massKg: number): number {
  return (PI * Math.sqrt((a * a * a) / (G * massKg))) / YEAR_S;
}

/** The radius (m) of low Earth orbit, where boost from the Earth's surface delivers: the Earth's first low orbit. */
function leoRadius(content: Content): number {
  const leo = content.orbits.find((o) => o.earthLeo && o.altitudeKm !== undefined)!;
  return (spaceBody(content, "Earth").radiusKm + leo.altitudeKm!) * 1000;
}

/** An orbit's distance from its body's centre, m. */
export function orbitRadius(content: Content, orbit: HabOrbitDef): number {
  const radiusKm = spaceBody(content, orbit.body).radiusKm;
  if (orbit.altitudeKm !== undefined) return (radiusKm + orbit.altitudeKm) * 1000;
  if (orbit.semiMajorAxisKm !== undefined) return orbit.semiMajorAxisKm * 1000;
  return radiusKm * UNSET_ORBIT_RADII * 1000;
}

/** A body's lowest orbit (not round a Lagrange point), m from its centre: where landers set out from. */
function lowOrbitRadius(content: Content, bodyId: string): number {
  const own = content.orbits.filter((o) => o.body === bodyId && !o.lagrange).map((o) => orbitRadius(content, o));
  return own.length > 0 ? Math.min(...own) : spaceBody(content, bodyId).radiusKm * UNSET_ORBIT_RADII * 1000;
}

/** The burn (m/s) between a circular orbit of radius r round a mass and a hyperbola leaving or arriving at vInf. */
function hyperbolicBurn(mu: number, r: number, vInf: number): number {
  return Math.sqrt(vInf * vInf + (2 * mu) / r) - Math.sqrt(mu / r);
}

/**
 * The Hohmann transfer from the Earth to a body (to its planet, for a moon of another planet;
 * from low Earth orbit, for the Moon), and when its next launch window opens, at a time in Julian
 * years since J2000. Null for the Sun and the Earth.
 */
export function transferFromEarth(content: Content, id: string, years: number): Transfer | null {
  const target = heliocentric(content, id);
  if (target.type === "star") return null;
  const earth = spaceBody(content, "Earth");
  if (target.id === "Earth") {
    if (id === "Earth") return null;
    // Within the Earth's system: from low Earth orbit out to the moon's own orbit.
    let moon = spaceBody(content, id);
    while (moon.parent !== "Earth") moon = spaceBody(content, moon.parent!);
    return { transferYears: halfPeriodYears((leoRadius(content) + moon.orbit!.a * AU_M) / 2, earth.massKg), window: null };
  }
  const sun = spaceBody(content, "Sol");
  const a1 = earth.orbit!.a;
  const a2 = target.orbit!.a;
  const transferYears = halfPeriodYears(((a1 + a2) / 2) * AU_M, sun.massKg);
  const n1 = meanMotion(earth.orbit!, sun.massKg, earth.massKg);
  const n2 = meanMotion(target.orbit!, sun.massKg, target.massKg);
  // The target must lead the Earth by this much at launch, so that it arrives as we do.
  const needed = PI - n2 * transferYears;
  // Both go round the Sun, so their positions round it are all that's needed.
  const e = orbitPosition(earth.orbit!, sun.massKg, earth.massKg, years);
  const t = orbitPosition(target.orbit!, sun.massKg, target.massKg, years);
  const lead = detAtan2(t.y, t.x) - detAtan2(e.y, e.x);
  const rate = n2 - n1;
  const synodicYears = TWO_PI / Math.abs(rate);
  const wait = (needed - lead) / rate;
  return { transferYears, window: { inYears: wait - synodicYears * Math.floor(wait / synodicYears), synodicYears } };
}

/**
 * The transfer to a destination: none within low Earth orbit, where boost delivers; a Hohmann
 * transfer within the Earth's system to its other orbits (to the Sun–Earth Lagrange points, out to
 * where L1 and L2 lie); otherwise the transfer to its body.
 */
export function transferTo(content: Content, destination: Destination, years: number): Transfer {
  const orbit = destination.kind === "orbit" ? content.orbits.find((o) => o.id === destination.id)! : null;
  if (orbit?.earthLeo) return { transferYears: 0, window: null };
  const bodyId = orbit?.body ?? content.habSites.find((s) => s.id === destination.id)!.body;
  if (bodyId !== "Earth") return transferFromEarth(content, bodyId, years)!;
  const earth = spaceBody(content, "Earth");
  // The Sun–Earth L1 and L2 points lie at the Earth's Hill radius; the five are treated alike (**inferred**).
  const r = orbit!.lagrange ? earth.orbit!.a * AU_M * detPow(earth.massKg / (3 * spaceBody(content, "Sol").massKg), 1 / 3) : orbitRadius(content, orbit!);
  return { transferYears: halfPeriodYears((leoRadius(content) + r) / 2, earth.massKg), window: null };
}

/**
 * The Δv (km/s) from low Earth orbit to a destination, burn by burn: leaving low Earth orbit on a
 * Hohmann transfer to the destination's body (or, for a moon, its planet), braking into the orbit
 * on arrival, or matching the body's path for one of its Lagrange points, and landing for a site.
 * Within low Earth orbit it is nothing: boost delivers there.
 */
export function deltaV(content: Content, destination: Destination): Breakdown {
  const f = new FormulaBuilder();
  const orbit = destination.kind === "orbit" ? content.orbits.find((o) => o.id === destination.id)! : null;
  if (orbit?.earthLeo) return f.add("Low Earth orbit, where boost delivers", 0).build();
  const body = spaceBody(content, orbit?.body ?? content.habSites.find((s) => s.id === destination.id)!.body);
  const earth = spaceBody(content, "Earth");
  const muEarth = G * earth.massKg;
  const r0 = leoRadius(content);
  const km = (mps: number) => mps / 1000;

  if (body.id === "Earth") {
    if (orbit!.lagrange) return f.add("Escape the Earth", km(hyperbolicBurn(muEarth, r0, 0))).build();
    const r = orbitRadius(content, orbit!);
    const a = (r0 + r) / 2;
    const out = Math.abs(Math.sqrt(muEarth * (2 / r0 - 1 / a)) - Math.sqrt(muEarth / r0));
    const circularise = Math.abs(Math.sqrt(muEarth / r) - Math.sqrt(muEarth * (2 / r - 1 / a)));
    return f.add(`Leave low Earth orbit for ${orbit!.name}`, km(out)).add(`Circularise in ${orbit!.name}`, km(circularise)).build();
  }

  // Arrive at the body's distance from what it orbits, at this speed relative to it (m/s).
  const primary = body.parent === "Sol" ? body : spaceBody(content, body.parent!);
  let vRelative: number;
  if (primary.id === "Earth") {
    // The Moon: a Hohmann transfer within the Earth's system out to its orbit.
    const a = body.orbit!.a * AU_M;
    const half = (r0 + a) / 2;
    f.add(`Leave low Earth orbit for ${body.name}`, km(Math.sqrt(muEarth * (2 / r0 - 1 / half)) - Math.sqrt(muEarth / r0)));
    vRelative = Math.abs(Math.sqrt(muEarth / a) - Math.sqrt(muEarth * (2 / a - 1 / half)));
  } else {
    const muSun = G * spaceBody(content, "Sol").massKg;
    const r1 = earth.orbit!.a * AU_M;
    const r2 = primary.orbit!.a * AU_M;
    const departure = Math.abs(Math.sqrt(muSun / r1) * (Math.sqrt((2 * r2) / (r1 + r2)) - 1));
    const arrival = Math.abs(Math.sqrt(muSun / r2) * (1 - Math.sqrt((2 * r1) / (r1 + r2))));
    f.add(`Leave low Earth orbit for ${primary.name}`, km(hyperbolicBurn(muEarth, r0, departure)));
    if (primary.id === body.id) vRelative = arrival;
    else {
      // A moon of another planet: fall in to its orbit, where it meets the moon at their speeds' difference.
      const muPlanet = G * primary.massKg;
      const a = body.orbit!.a * AU_M;
      vRelative = Math.abs(Math.sqrt(arrival * arrival + (2 * muPlanet) / a) - Math.sqrt(muPlanet / a));
    }
  }

  if (orbit?.lagrange) return f.add(`Match ${body.name}'s path at L${orbit.lagrange}`, km(vRelative)).build();
  const muBody = G * body.massKg;
  const r = orbit ? orbitRadius(content, orbit) : lowOrbitRadius(content, body.id);
  f.add(`Brake into ${orbit ? orbit.name : `low orbit round ${body.name}`}`, km(hyperbolicBurn(muBody, r, vRelative)));
  if (orbit) return f.build();
  // Landing: down a Hohmann ellipse from the low orbit to the surface, then killing the speed left.
  const surface = body.radiusKm * 1000;
  const half = (r + surface) / 2;
  const deorbit = Math.sqrt(muBody / r) - Math.sqrt(muBody * (2 / r - 1 / half));
  const touchdown = Math.sqrt(muBody * (2 / surface - 1 / half));
  return f.add(`Land on ${body.name}`, km(deorbit + touchdown)).build();
}

/**
 * How much longer than its Hohmann transfer a launch today takes (**inferred**: Terra Invicta
 * only says off-window launches pay "a penalty to the duration"): up to rules.space.offWindowPenalty
 * more just after a window closes, falling evenly to nothing as the next one opens; `scale`
 * shrinks the penalty (Solar Steamers).
 */
export function offWindowFactor(content: Content, transfer: Transfer, scale = 1): number {
  if (!transfer.window) return 1;
  return 1 + content.rules.space.offWindowPenalty * scale * (transfer.window.inYears / transfer.window.synodicYears);
}
