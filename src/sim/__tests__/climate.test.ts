import { describe, expect, it } from "vitest";
import { baseContent } from "../../content/index";
import {
  aiClimateOption,
  annualGdpDamage,
  climateOptions,
  seizeExecutive,
  deserialize,
  environmentCleanup,
  pollutionFloor,
  runClimateMonth,
  serialize,
  Simulation,
  spoilsPollution,
  sustainability,
  temperatureAnomaly,
  vulnerabilities,
  type GameState,
} from "../index";

const content = baseContent;
const fresh = () => Simulation.create(content, { seed: 5, difficulty: "normal", playerFactions: [] }).state;
const nation = (state: GameState, id: string) => state.nations.find((n) => n.id === id)!;

describe("climate", () => {
  it("starts from Terra Invicta's 2030 atmosphere, with the ice already lost by then gone", () => {
    const s = fresh();
    expect(temperatureAnomaly(content, s.climate)).toBeCloseTo(1.541, 3);
    expect(s.climate.seaLevel).toBe(28);
    expect(s.climate.melted).toEqual(["Larsen A Ice Shelf", "Larsen B Ice Shelf", "Larsen C Ice Shelf", "Thwaites Ice Shelf"]);
  });

  it("follows Terra Invicta's GDP damage curve", () => {
    expect(annualGdpDamage(content, 0.25, 3)).toBe(0);
    // (0.14577% + 0.31839%) at one degree past the threshold, × 1.14^Inequality.
    expect(annualGdpDamage(content, 1.25, 0)).toBeCloseTo(0.0046416, 7);
    expect(annualGdpDamage(content, 1.25, 4)).toBeCloseTo(0.0046416 * 1.14 ** 4, 7);
    expect(annualGdpDamage(content, -1, 5)).toBeCloseTo(0.04032, 7);
    expect(annualGdpDamage(content, -8, 5)).toBeCloseTo(0.04032 * 8 + 0.04032, 7);
    expect(annualGdpDamage(content, 30, 9)).toBe(0.99);
  });

  it("spares nations in ecologically protected regions and doubles the harm in vulnerable ones", () => {
    const s = fresh();
    const v = vulnerabilities(s, content);
    expect(v.get("isl")!.economy).toBe(0);
    expect(v.get("isl")!.people).toBe(0.5);
    const vulnerable = content.nations.find((n) => (v.get(n.id)?.economy ?? 0) > 1.99);
    expect(vulnerable).toBeDefined();
  });

  it("emits, warms, raises the sea and costs GDP each month", () => {
    const s = fresh();
    const co2 = s.climate.co2;
    const gdp = nation(s, "ind").gdp;
    runClimateMonth(s, content);
    expect(s.climate.co2).toBeGreaterThan(co2);
    expect(s.climate.seaLevel).toBeGreaterThan(28);
    expect(nation(s, "ind").gdp).toBeLessThan(gdp);
    expect(s.climate.history).toHaveLength(1);
  });

  it("melts ice once the anomaly reaches it, and the sea never falls back", () => {
    const s = fresh();
    s.climate.co2 = 560;
    runClimateMonth(s, content);
    expect(s.climate.melted).toContain("Greenland Ice Sheet");
    expect(s.climate.seaLevel).toBeGreaterThan(28 + 20 + 120);
    expect(s.log.some((e) => e.kind === "climate" && /Greenland/.test(e.text))).toBe(true);
    const sea = s.climate.seaLevel;
    Object.assign(s.climate, { co2: 300, ch4: 1, n2o: 0.2 });
    runClimateMonth(s, content);
    expect(s.climate.seaLevel).toBe(sea);
  });

  it("pollutes with Spoils and cleans up with Environment, down to the techs' floor", () => {
    const s = fresh();
    const ind = nation(s, "ind");
    const before = { pollution: ind.pollution, co2: s.climate.co2, n2o: s.climate.n2o };
    spoilsPollution(s, content, ind, vulnerabilities(s, content, "ind").get("ind"));
    expect(ind.pollution).toBeGreaterThan(before.pollution);
    expect(s.climate.co2).toBeGreaterThan(before.co2);
    expect(s.climate.n2o).toBeGreaterThan(before.n2o);

    const deu = nation(s, "deu");
    expect(deu.pollution).toBe(pollutionFloor(s, content));
    environmentCleanup(s, content, deu);
    expect(deu.pollution).toBe(0.3325);
    s.research.completed.push("CleanEnergy");
    for (let i = 0; i < 2000; i++) environmentCleanup(s, content, deu);
    expect(deu.pollution).toBeCloseTo(0.2325, 9);
    expect(sustainability(deu)).toBeCloseTo(1 / 0.2325, 6);

    // At 10 Sustainability Environment takes greenhouse gases out of the air.
    deu.pollution = 0;
    expect(sustainability(deu)).toBe(10);
    const co2 = s.climate.co2;
    environmentCleanup(s, content, deu);
    expect(s.climate.co2).toBeLessThan(co2);
  });

  it("gives older saves the starting climate", () => {
    const s = fresh();
    const old = JSON.parse(serialize(s));
    old.version = 24;
    delete old.state.climate;
    for (const n of old.state.nations) delete n.pollution;
    const loaded = deserialize(JSON.stringify(old), content);
    expect(loaded.climate.co2).toBe(443);
    expect(nation(loaded, "usa").pollution).toBe(content.climate.pollution.usa);
  });

  it("gives version 25 saves no pending climate events or strikes", () => {
    const old = JSON.parse(serialize(fresh()));
    old.version = 25;
    delete old.state.climateChoices;
    delete old.state.strikes;
    delete old.state.climate.regionEvents;
    const loaded = deserialize(JSON.stringify(old), content);
    expect(loaded.climateChoices).toEqual([]);
    expect(loaded.strikes).toEqual([]);
    expect(loaded.climate.regionEvents).toEqual({});
  });
});

describe("climate events with a choice", () => {
  /** A game where Aegis (a player) runs India, and Environmental Degradation is certain to strike. */
  function playerIndia() {
    const sim = Simulation.create(content, { seed: 5, difficulty: "normal", playerFactions: ["aegis"] });
    const s = sim.state;
    const ind = nation(s, "ind");
    for (const cp of ind.controlPoints) cp.owner = "aegis";
    seizeExecutive(s, ind);
    // Only India's regions can be struck, and the odds are certain.
    const d = content.rules.climate.choices.degradation;
    const rules = structuredClone(content.rules);
    rules.climate.choices.degradation = { ...d, chancePerMonth: 1 };
    rules.climate.choices.wetBulb = { ...rules.climate.choices.wetBulb, chancePerMonth: 0 };
    const c = { ...content, rules };
    for (const region of content.regions) if (s.regionOwners[region.id] !== "ind") s.climate.regionEvents[`degradation:${region.id}`] = 0;
    return { sim, s, c };
  }

  it("puts Environmental Degradation to the player running the nation, and stops the clock until answered", () => {
    const { sim, s, c } = playerIndia();
    runClimateMonth(s, c);
    expect(s.climateChoices).toHaveLength(1);
    const choice = s.climateChoices[0]!;
    expect(choice).toMatchObject({ event: "degradation", factionId: "aegis", nationId: "ind" });
    expect(s.regionOwners[choice.regionId!]).toBe("ind");

    // The clock waits for the answer.
    if (s.phase === "council") sim.apply({ type: "endCouncilPhase", factionId: "aegis" });
    const day = s.dayIndex;
    sim.advance(3);
    expect(s.dayIndex).toBe(day);

    // Recruiting is for extremists, looting for the profit-minded.
    const options = climateOptions(s, c, "aegis", choice);
    expect(options.map((o) => o.option)).toEqual(["ignore", "subsidize", "recruit", "loot"]);
    expect(options.find((o) => o.option === "recruit")!.check.ok).toBe(false);
    expect(options.find((o) => o.option === "loot")!.check.ok).toBe(false);
    expect(sim.apply({ type: "chooseClimateOption", factionId: "aegis", choiceId: choice.id, option: "loot" }).ok).toBe(false);

    const ind = nation(s, "ind");
    const before = { gdp: ind.gdp, unrest: ind.unrest, opinion: ind.publicOpinion.aegis ?? 0 };
    expect(sim.apply({ type: "chooseClimateOption", factionId: "aegis", choiceId: choice.id, option: "ignore" })).toEqual({ ok: true });
    expect(s.climateChoices).toHaveLength(0);
    expect(ind.gdp).toBeLessThan(before.gdp);
    expect(ind.unrest).toBeGreaterThan(before.unrest);
    expect(ind.publicOpinion.aegis ?? 0).toBeLessThanOrEqual(before.opinion);
    sim.advance(1);
    expect(s.dayIndex).toBe(day + 1);
  });

  it("charges for subsidies by the region's people and softens the blow", () => {
    const { sim, s, c } = playerIndia();
    runClimateMonth(s, c);
    const choice = s.climateChoices[0]!;
    const subsidize = climateOptions(s, c, "aegis", choice).find((o) => o.option === "subsidize")!;
    expect(subsidize.cost.money).toBeGreaterThan(10);
    const aegis = s.factions.find((f) => f.id === "aegis")!;
    aegis.resources.money = subsidize.cost.money! - 1;
    expect(sim.apply({ type: "chooseClimateOption", factionId: "aegis", choiceId: choice.id, option: "subsidize" }).ok).toBe(false);
    aegis.resources.money = subsidize.cost.money!;
    expect(sim.apply({ type: "chooseClimateOption", factionId: "aegis", choiceId: choice.id, option: "subsidize" })).toEqual({ ok: true });
    expect(aegis.resources.money).toBe(0);
  });

  it("lets AI factions answer at once: extremists recruit, the profit-minded loot", () => {
    const s = fresh();
    const choice = { event: "degradation" as const, regionId: "ind-1" };
    expect(aiClimateOption(s, content, "iron-dawn", choice)).toBe("recruit");
    expect(aiClimateOption(s, content, "meridian", choice)).toBe("loot");
    s.factions.find((f) => f.id === "lumen")!.resources.money = 0;
    expect(aiClimateOption(s, content, "lumen", choice)).toBe("ignore");
    // With nobody to ask, the events still strike and leave nothing pending.
    for (let i = 0; i < 24; i++) runClimateMonth(s, content);
    expect(s.climateChoices).toHaveLength(0);
    expect(Object.keys(s.climate.regionEvents).some((k) => k.startsWith("degradation:"))).toBe(true);
  });

  it("strikes every nation with crop failures in a deep freeze", () => {
    const sim = Simulation.create(content, { seed: 5, difficulty: "normal", playerFactions: ["aegis"] });
    const s = sim.state;
    s.climate.aerosols = 0.3;
    const usa = nation(s, "usa");
    const before = { gdp: usa.gdp, cohesion: usa.cohesion, population: usa.population };
    runClimateMonth(s, content);
    expect(temperatureAnomaly(content, s.climate)).toBeLessThan(-4);
    expect(usa.gdp).toBeLessThan(before.gdp * 0.6);
    expect(usa.cohesion).toBe(Math.max(0, before.cohesion - 6));
    expect(usa.population).toBeLessThan(before.population);
    expect(s.climateChoices.filter((ch) => ch.event === "cropFailures")).toHaveLength(1);
    // Not again for ten years.
    s.climateChoices = [];
    runClimateMonth(s, content);
    expect(s.climateChoices.filter((ch) => ch.event === "cropFailures")).toHaveLength(0);
  });
});
