import { describe, expect, it } from "vitest";
import { baseContent } from "../../content/index";
import { detCos, detSin } from "../detmath";
import { orbitalPeriod, orbitPath, solarPositions, spaceBody, yearsSinceJ2000 } from "../index";

const content = baseContent;
const dist = (p: { x: number; y: number; z: number }, q = { x: 0, y: 0, z: 0 }) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);

describe("deterministic trigonometry", () => {
  it("matches Math.sin and Math.cos", () => {
    for (let x = -50; x <= 50; x += 0.37) {
      expect(detSin(x)).toBeCloseTo(Math.sin(x), 13);
      expect(detCos(x)).toBeCloseTo(Math.cos(x), 13);
    }
  });
});

describe("orbits", () => {
  it("counts Julian years from J2000", () => {
    expect(yearsSinceJ2000(2000, 0, 0.5)).toBe(0);
    expect(yearsSinceJ2000(2030, 0, 0)).toBeCloseTo(30, 1);
  });

  it("puts the Earth where it was at J2000", () => {
    // JPL Horizons, heliocentric ecliptic J2000: (−0.177, 0.967, 0).
    const earth = solarPositions(content, 0).get("Earth")!;
    expect(earth.x).toBeCloseTo(-0.177, 1);
    expect(earth.y).toBeCloseTo(0.967, 1);
    expect(Math.abs(earth.z)).toBeLessThan(0.001);
  });

  it("gives the real periods", () => {
    const sun = spaceBody(content, "Sol").massKg;
    const earth = spaceBody(content, "Earth");
    const luna = spaceBody(content, "Luna");
    expect(orbitalPeriod(earth.orbit!, sun, earth.massKg)).toBeCloseTo(1, 2);
    expect(orbitalPeriod(luna.orbit!, earth.massKg, luna.massKg) * 365.25).toBeCloseTo(27.3, 0);
    const jupiter = spaceBody(content, "Jupiter");
    expect(orbitalPeriod(jupiter.orbit!, sun, jupiter.massKg)).toBeCloseTo(11.86, 1);
  });

  it("keeps every body on its orbit as time passes", () => {
    for (const years of [30, 30.5, 47.2]) {
      const at = solarPositions(content, years);
      for (const b of content.solarSystem) {
        const p = at.get(b.id)!;
        expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
        if (!b.orbit) continue;
        // Between periapsis and apoapsis of its parent.
        const r = dist(p, at.get(b.parent!)!);
        expect(r).toBeGreaterThanOrEqual(b.orbit.a * (1 - b.orbit.e) * 0.999999);
        expect(r).toBeLessThanOrEqual(b.orbit.a * (1 + b.orbit.e) * 1.000001);
      }
    }
    expect(dist(solarPositions(content, 30).get("Luna")!, solarPositions(content, 30).get("Earth")!) * 149597870.7).toBeGreaterThan(356000);
  });

  it("traces the ellipse", () => {
    const mars = spaceBody(content, "Mars").orbit!;
    const path = orbitPath(mars, 64);
    expect(Math.min(...path.map((p) => dist(p)))).toBeCloseTo(mars.a * (1 - mars.e), 6);
    expect(Math.max(...path.map((p) => dist(p)))).toBeCloseTo(mars.a * (1 + mars.e), 6);
  });
});
