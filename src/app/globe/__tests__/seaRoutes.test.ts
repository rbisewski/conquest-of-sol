import { describe, expect, it } from "vitest";
import { buildSeaMap, seaRoute } from "../seaRoutes";

/** A 360 × 180 id map (one texel per degree), land wherever isLand says. */
function idMap(isLand: (lat: number, lon: number) => boolean) {
  const width = 360;
  const height = 180;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) if (isLand(89.5 - y, x - 179.5)) data[(y * width + x) * 4] = 1;
  }
  return { width, height, data };
}

describe("sea routes", () => {
  it("sail around land, landing on either side", () => {
    // Two continents either side of a sea, joined in the north by a wall the ships must go around.
    const map = buildSeaMap(idMap((lat, lon) => Math.abs(lon) > 40 || (Math.abs(lon) < 2 && lat > -30)), 1);
    const route = seaRoute(map, { lat: 20, lon: -45 }, { lat: 20, lon: 45 })!;
    expect(route).not.toBeNull();
    expect(route.points[0]).toEqual({ lat: 20, lon: -45 });
    expect(route.points.at(-1)).toEqual({ lat: 20, lon: 45 });
    const water = route.points.slice(route.embark, route.disembark + 1);
    expect(water.every((p) => Math.abs(p.lon) <= 40)).toBe(true);
    expect(Math.min(...water.map((p) => p.lat))).toBeLessThan(-30);
  });

  it("aren't found between seas that don't meet", () => {
    const map = buildSeaMap(idMap((_, lon) => Math.abs(lon) < 60 || Math.abs(lon) > 120), 1);
    expect(seaRoute(map, { lat: 0, lon: -62 }, { lat: 0, lon: 62 })).toBeNull();
  });
});
