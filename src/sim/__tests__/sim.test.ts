import { describe, expect, it } from "vitest";
import { baseContent } from "../../content/index";
import {
  assessMission,
  controlPointCount,
  dateOfDay,
  dayOfDate,
  formatTimeOfDay,
  gdpPerCapita,
  deserialize,
  hashState,
  MINUTES_PER_DAY,
  serialize,
  Simulation,
  STATE_VERSION,
  UNDECIDED,
  validateContent,
  type Content,
} from "../index";

const content = baseContent;

describe("calendar", () => {
  it("round-trips days and dates across leap years", () => {
    for (let day = 0; day < 365 * 80; day += 37) {
      expect(dayOfDate(2030, dateOfDay(2030, day))).toBe(day);
    }
    expect(dateOfDay(2030, 0)).toEqual({ year: 2030, month: 1, day: 1 });
    expect(dateOfDay(2032, 59)).toEqual({ year: 2032, month: 2, day: 29 });
  });

  it("formats the time of day", () => {
    expect(formatTimeOfDay(0)).toBe("00:00:00");
    expect(formatTimeOfDay(0.5)).toBe("12:00:00");
    expect(formatTimeOfDay(1 / 48)).toBe("00:30:00");
    expect(formatTimeOfDay(0.99999999)).toBe("23:59:59");
  });
});

describe("content", () => {
  it("validates the base content", () => {
    expect(() => validateContent(content)).not.toThrow();
  });

  it("rejects a duplicate nation id", () => {
    const broken: Content = { ...content, nations: [...content.nations, content.nations[0]!] };
    expect(() => validateContent(broken)).toThrow(/duplicate nation/);
  });
});

describe("new game", () => {
  const sim = Simulation.create(content, { seed: 7, difficulty: "normal", playerFactions: ["aegis"] });

  it("opens with a council phase that waits for the player", () => {
    expect(sim.state.phase).toBe("council");
    expect(sim.advance(10)).toBe(0);
  });

  it("gives every faction a full council", () => {
    for (const f of sim.state.factions) expect(f.councilors).toHaveLength(content.rules.councilSize);
  });

  it("gives each nation 1–6 CPs with the executive first, and breakaways none", () => {
    for (const n of sim.state.nations) {
      if (n.capitalId === null) {
        expect(n.controlPoints).toHaveLength(0);
        continue;
      }
      expect(n.controlPoints.length).toBeGreaterThanOrEqual(1);
      expect(n.controlPoints.length).toBeLessThanOrEqual(6);
      expect(n.controlPoints[0]!.executive).toBe(true);
      expect(n.controlPoints.slice(1).every((cp) => !cp.executive)).toBe(true);
    }
  });

  it("starts public opinion summing to 1", () => {
    for (const n of sim.state.nations) {
      const total = Object.values(n.publicOpinion).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 10);
      expect(n.publicOpinion[UNDECIDED]).toBeCloseTo(content.rules.publicOpinion.undecided, 10);
    }
  });

  it("scales CP count with GDP", () => {
    // Terra Invicta's thresholds: 1 CP below $15.4B, 2 to $263B, 3 to $1701B, 4 to $6869B, 5 to $20944B.
    expect(controlPointCount(content, 10).value).toBe(1);
    expect(controlPointCount(content, 100).value).toBe(2);
    expect(controlPointCount(content, 600).value).toBe(3);
    expect(controlPointCount(content, 3000).value).toBe(4);
    expect(controlPointCount(content, 10000).value).toBe(5);
    expect(controlPointCount(content, 30000).value).toBe(6);
  });
});

describe("council phase", () => {
  it("resolves the player's mission at a scheduled time during the run phase", () => {
    const sim = Simulation.create(content, { seed: 3, difficulty: "normal", playerFactions: ["lumen"] });
    const councilor = sim.state.factions.find((f) => f.id === "lumen")!.councilors[0]!;
    councilor.professionId = "politician";
    expect(sim.apply({ type: "assignMission", factionId: "lumen", councilorId: councilor.id, mission: { type: "controlNation", nationId: "nga" } })).toEqual({ ok: true });
    expect(sim.apply({ type: "endCouncilPhase", factionId: "lumen" })).toEqual({ ok: true });
    expect(sim.state.phase).toBe("running");
    // Nothing resolves at once: the mission waits for its time.
    const scheduled = sim.state.scheduledMissions.find((s) => s.councilorId === councilor.id)!;
    expect(scheduled.at).toBeGreaterThan(0);
    expect(scheduled.at).toBeLessThan(15 * MINUTES_PER_DAY);
    expect(scheduled.at % MINUTES_PER_DAY).not.toBe(0);
    expect(councilor.mission).not.toBeNull();
    const times = sim.state.scheduledMissions.map((s) => s.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));

    expect(councilor.locationId).toBe(councilor.nationId);
    sim.advanceMinutes(scheduled.at - 1);
    expect(councilor.mission).not.toBeNull();
    sim.advanceMinutes(1);
    expect(councilor.mission).toBeNull();
    // The councilor travelled to the mission and stays there.
    expect(councilor.locationId).toBe("nga");
    const entry = sim.state.log.find((e) => e.factionId === "lumen" && e.nationId === "nga")!;
    expect(entry.dayIndex * MINUTES_PER_DAY + entry.minuteOfDay).toBe(scheduled.at);
  });

  it("finishes every mission before the next council phase", () => {
    const sim = Simulation.create(content, { seed: 3, difficulty: "normal", playerFactions: [] });
    expect(sim.state.scheduledMissions.length).toBeGreaterThan(0);
    sim.advance(15);
    expect(sim.state.dayIndex).toBe(15);
    expect(sim.state.factions.flatMap((f) => f.councilors).filter((c) => c.mission && !sim.state.scheduledMissions.some((s) => s.councilorId === c.id))).toEqual([]);
  });

  it("reaches the same state however time is sliced", () => {
    const a = Simulation.create(content, { seed: 8, difficulty: "normal", playerFactions: [] });
    const b = Simulation.create(content, { seed: 8, difficulty: "normal", playerFactions: [] });
    a.advance(40);
    for (let i = 0; i < 40 * 24; i++) b.advanceMinutes(60);
    expect(hashState(b.state)).toBe(hashState(a.state));
  });

  it("rejects missions outside a council phase", () => {
    const sim = Simulation.create(content, { seed: 3, difficulty: "normal", playerFactions: ["lumen"] });
    sim.apply({ type: "endCouncilPhase", factionId: "lumen" });
    const councilor = sim.state.factions.find((f) => f.id === "lumen")!.councilors[0]!;
    const result = sim.apply({ type: "assignMission", factionId: "lumen", councilorId: councilor.id, mission: { type: "controlNation", nationId: "usa" } });
    expect(result.ok).toBe(false);
  });

  it("pauses again on the 16th", () => {
    const sim = Simulation.create(content, { seed: 3, difficulty: "normal", playerFactions: ["lumen"] });
    sim.apply({ type: "endCouncilPhase", factionId: "lumen" });
    expect(sim.advance(100)).toBe(15);
    expect(dateOfDay(2030, sim.state.dayIndex)).toEqual({ year: 2030, month: 1, day: 16 });
    expect(sim.state.phase).toBe("council");
  });

  it("explains Control Nation odds term by term", () => {
    const sim = Simulation.create(content, { seed: 3, difficulty: "normal", playerFactions: [] });
    const faction = sim.state.factions[0]!;
    const councilor = faction.councilors[0]!;
    councilor.professionId = "politician";
    const a = assessMission(sim.state, content, faction.id, councilor, { type: "controlNation", nationId: "nga" });
    expect(a.ok && a.contested).toBe(true);
    if (!a.ok || !a.contested) return;
    const attackSum = a.odds.attack.terms.reduce((sum, t) => sum + t.value, 0);
    expect(attackSum).toBeCloseTo(a.odds.attack.value, 10);
    expect(a.odds.chance).toBeGreaterThan(0);
    expect(a.odds.chance).toBeLessThan(1);
  });
});

// Each of these simulates years of an all-AI campaign, so they get more than the default 5 s.
describe("determinism", { timeout: 30_000 }, () => {
  const run = (seed: number, years: number) => {
    const sim = Simulation.create(content, { seed, difficulty: "normal", playerFactions: [] });
    sim.advance(Math.round(years * 365.25));
    return sim;
  };

  it("gives the same state for the same seed", () => {
    expect(hashState(run(42, 3).state)).toBe(hashState(run(42, 3).state));
  });

  it("gives different states for different seeds", () => {
    expect(hashState(run(1, 1).state)).not.toBe(hashState(run(2, 1).state));
  });

  it("continues identically after a save and load", () => {
    const straight = run(9, 2);
    straight.advance(400);

    const saved = run(9, 2);
    const restored = new Simulation(content, deserialize(serialize(saved.state), content));
    restored.advance(400);

    expect(hashState(restored.state)).toBe(hashState(straight.state));
  });

  it("lets AI factions take control points over time", () => {
    const sim = run(5, 2);
    const held = sim.state.nations.flatMap((n) => n.controlPoints).filter((cp) => cp.owner !== null).length;
    expect(held).toBeGreaterThan(0);
  });
});

describe("saves", () => {
  it("refuses files from a newer version", () => {
    const sim = Simulation.create(content, { seed: 1, difficulty: "normal", playerFactions: [] });
    const text = serialize(sim.state).replace(`"version":${STATE_VERSION},`, '"version":999,');
    expect(() => deserialize(text, content)).toThrow(/newer/);
  });
});

describe("nation stats", () => {
  it("reports GDP per capita in thousands of USD", () => {
    const sim = Simulation.create(content, { seed: 1, difficulty: "normal", playerFactions: [] });
    const usa = sim.state.nations.find((n) => n.id === "usa")!;
    expect(gdpPerCapita(usa)).toBeCloseTo(usa.gdp / usa.population, 10);
    expect(gdpPerCapita(usa)).toBeGreaterThan(80);
    expect(gdpPerCapita(usa)).toBeLessThan(150);
  });
});
