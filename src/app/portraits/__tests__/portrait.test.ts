import { describe, expect, it } from "vitest";
import { featuresFromSeed, FEMALE_HAIR, MALE_HAIR, Mat, paint, PORTRAIT_HEIGHT, PORTRAIT_WIDTH, renderPortrait } from "../portrait";

describe("portraits", () => {
  it("are deterministic for a seed", () => {
    expect(featuresFromSeed(42, "female", "scientist")).toEqual(featuresFromSeed(42, "female", "scientist"));
    expect(renderPortrait(42, "male", "officer", "#3a78d0")).toEqual(renderPortrait(42, "male", "officer", "#3a78d0"));
  });

  it("use hair styles for the right gender and vary across seeds", () => {
    const female = Array.from({ length: 300 }, (_, i) => featuresFromSeed(i * 7919, "female", "spy"));
    const male = Array.from({ length: 300 }, (_, i) => featuresFromSeed(i * 7919, "male", "spy"));
    expect(new Set(female.map((f) => f.hair))).toEqual(new Set(FEMALE_HAIR));
    expect(new Set(male.map((f) => f.hair))).toEqual(new Set(MALE_HAIR));
    expect(new Set(female.map((f) => f.skin)).size).toBe(7);
    expect(new Set(female.map((f) => f.hairColor)).size).toBeGreaterThanOrEqual(10);
    expect(new Set(male.map((f) => f.eyeColor)).size).toBeGreaterThanOrEqual(6);
    expect(male.some((f) => f.facialHair !== "none")).toBe(true);
    expect(female.every((f) => f.facialHair === "none")).toBe(true);
  });

  it("dress councilors by profession", () => {
    expect(featuresFromSeed(1, "female", "scientist").clothing).toBe("labcoat");
    expect(featuresFromSeed(1, "male", "officer").clothing).toBe("uniform");
    expect(featuresFromSeed(1, "male", "astronaut").clothing).toBe("flightsuit");
    expect(featuresFromSeed(1, "male", "commando").clothing).toBe("fatigues");
    const gear = new Set(Array.from({ length: 60 }, (_, i) => featuresFromSeed(i * 31, "male", "hacker").headgear));
    expect(gear.has("headphones") && gear.has("beanie") && gear.has("none")).toBe(true);
  });

  it("outline every sprite", () => {
    for (let seed = 0; seed < 40; seed++) {
      const c = paint(featuresFromSeed(seed * 104729, seed % 2 ? "male" : "female", ["diplomat", "commando", "hacker", "astronaut"][seed % 4]!));
      expect(c.mat).toHaveLength(PORTRAIT_WIDTH * PORTRAIT_HEIGHT);
      // No figure pixel touches empty space except through an outline pixel.
      for (let y = 0; y < PORTRAIT_HEIGHT; y++) {
        for (let x = 0; x < PORTRAIT_WIDTH; x++) {
          if (c.mat[y * PORTRAIT_WIDTH + x] !== Mat.None) continue;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= PORTRAIT_WIDTH || ny >= PORTRAIT_HEIGHT) continue;
            const n = c.mat[ny * PORTRAIT_WIDTH + nx];
            expect(n === Mat.None || n === Mat.Outline).toBe(true);
          }
        }
      }
    }
  });
});
