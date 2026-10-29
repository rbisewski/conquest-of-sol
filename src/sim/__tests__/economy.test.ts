import { describe, expect, it } from "vitest";
import { baseContent } from "../../content/index";
import {
  deserialize,
  detPow,
  economyGdppcGain,
  equipNavy,
  investNation,
  monthlyInvestment,
  populationScale,
  priorityAvailable,
  priorityFlows,
  raiseArmy,
  runDailyTick,
  serialize,
  Simulation,
  type GameState,
  type NationState,
} from "../index";

const content = baseContent;

function setup(nationId: string, weights: Record<string, number>): { state: GameState; nation: NationState } {
  const sim = Simulation.create(content, { seed: 4, difficulty: "normal", playerFactions: ["aegis"] });
  const state = sim.state;
  const nation = state.nations.find((n) => n.id === nationId)!;
  for (const cp of nation.controlPoints) cp.owner = "aegis";
  // Councilors' trait incomes would blur the payouts these tests check.
  for (const f of state.factions) for (const c of f.councilors) c.traits = [];
  // A lone nation: federation pooling and bonuses are tested in federation.test.ts.
  state.federations = [];
  state.factions.find((f) => f.id === "aegis")!.priorityWeights[nationId] = weights;
  return { state, nation };
}

describe("investment points", () => {
  it("is GDP^0.35 less 1% per 0.1 unrest above 2 and army upkeep", () => {
    const { state, nation } = setup("deu", {});
    const armies = (n: number, navies: number) => {
      state.armies = state.armies.filter((a) => a.nationId !== nation.id);
      for (let i = 0; i < n; i++) raiseArmy(state, content, nation.id);
      for (let i = 0; i < navies; i++) equipNavy(state, content, nation.id);
    };
    Object.assign(nation, { gdp: 1000, unrest: 0 });
    armies(0, 0);
    expect(monthlyInvestment(state, content, nation).value).toBeCloseTo(detPow(1000, 0.35), 10);
    nation.unrest = 5;
    expect(monthlyInvestment(state, content, nation).value).toBeCloseTo(detPow(1000, 0.35) * 0.7, 10);
    nation.unrest = 10;
    expect(monthlyInvestment(state, content, nation).value).toBeCloseTo(detPow(1000, 0.35) * 0.2, 10);
    nation.unrest = 0;
    armies(2, 1);
    expect(monthlyInvestment(state, content, nation).value).toBeCloseTo(detPow(1000, 0.35) - 1.5, 10);
    // An army away from its headquarters costs the deployed upkeep instead.
    const army = state.armies.find((a) => a.nationId === nation.id)!;
    army.regionId = baseContent.regions.find((r) => r.nationId === nation.id && r.id !== army.homeRegionId)!.id;
    expect(monthlyInvestment(state, content, nation).value).toBeCloseTo(detPow(1000, 0.35) - 2, 10);
  });

  it("never goes below zero", () => {
    const { state, nation } = setup("deu", {});
    nation.gdp = 1;
    for (let i = 0; i < 10; i++) raiseArmy(state, content, nation.id);
    expect(monthlyInvestment(state, content, nation).value).toBe(0);
  });
});

describe("population scaling", () => {
  it("is 1 at 50 million and slower for bigger nations", () => {
    const { nation } = setup("deu", {});
    nation.population = 50;
    expect(populationScale(content, nation)).toBeCloseTo(1, 10);
    nation.population = 400;
    expect(populationScale(content, nation)).toBeCloseTo(detPow(1 / 8, 0.35), 10);
  });
});

describe("priority flows", () => {
  it("applies the wiki's diversity bonus example (3 Economy, 1 Welfare, 1 Spoils)", () => {
    const { state, nation } = setup("deu", { economy: 3, welfare: 1, spoils: 1 });
    const ip = monthlyInvestment(state, content, nation).value;
    const flows = priorityFlows(state, content, nation);
    expect(flows["economy"]).toBeCloseTo(ip * (3 / 5) * 1.04, 10);
    expect(flows["welfare"]).toBeCloseTo(ip * (1 / 5) * 1.3, 10);
    expect(flows["spoils"]).toBeCloseTo(ip * (1 / 5) * 1.34, 10);
  });

  it("ignores pips in priorities the nation can't use", () => {
    const { state, nation } = setup("deu", { economy: 1, "found-space-program": 1 });
    nation.spaceProgram = true;
    const flows = priorityFlows(state, content, nation);
    expect(flows["found-space-program"]).toBeUndefined();
    expect(flows["economy"]).toBeCloseTo(monthlyInvestment(state, content, nation).value, 10);
  });
});

describe("priority effects", () => {
  it("raises GDP per capita by (3 + 0.5 × Government + Education) × population scale per Economy completion", () => {
    const { state, nation } = setup("deu", { economy: 1 });
    const gain = economyGdppcGain(state, content, nation);
    const expected = (3 + 0.5 * nation.democracy + nation.education) * populationScale(content, nation);
    expect(gain).toBeCloseTo(expected, 10);
    const ip = monthlyInvestment(state, content, nation).value;
    const gdpBefore = nation.gdp;
    investNation(state, content, nation);
    const completions = Math.floor(ip);
    expect(nation.gdp - gdpBefore).toBeCloseTo((completions * gain * nation.population) / 1000, 6);
    expect(nation.ipProgress["economy"]).toBeCloseTo(ip - completions, 10);
  });

  it("founds a space program once, then unlocks Boost", () => {
    const { state, nation } = setup("deu", { "found-space-program": 1 });
    expect(nation.spaceProgram).toBe(false);
    expect(priorityAvailable(state, content, nation, "boost")).toBe(false);
    nation.ipProgress["found-space-program"] = 49.9;
    investNation(state, content, nation);
    expect(nation.spaceProgram).toBe(true);
    expect(nation.annualBoost).toBeCloseTo(content.rules.priorityEffects.foundSpaceProgram.annualBoost, 10);
    expect(priorityAvailable(state, content, nation, "found-space-program")).toBe(false);
    expect(priorityAvailable(state, content, nation, "boost")).toBe(true);
  });

  it("builds a launch complex when a space program is founded", () => {
    const { state, nation } = setup("deu", { "found-space-program": 1 });
    expect(nation.launchSites).toEqual([]);
    nation.ipProgress["found-space-program"] = 49.9;
    investNation(state, content, nation);
    expect(nation.launchSites).toHaveLength(1);
    const region = content.regions.find((r) => r.id === nation.launchSites[0]!.regionId)!;
    expect(region.nationId).toBe("deu");
    expect(nation.launchSites[0]!.name).toBe(`${region.name} Launch Complex`);
  });

  it("uses a real launch site for the new complex when the nation has one", () => {
    const { state, nation } = setup("mex", { "found-space-program": 1 });
    nation.ipProgress["found-space-program"] = 49.9;
    investNation(state, content, nation);
    expect(nation.launchSites.map((s) => s.name)).toEqual(["Starbase"]);
  });

  it("switches from Develop Atomic Bomb to Nuclear Weapons", () => {
    const { state, nation } = setup("deu", { "atomic-bomb": 1 });
    nation.ipProgress["atomic-bomb"] = 79.9;
    investNation(state, content, nation);
    expect(nation.nukes).toBe(1);
    expect(priorityAvailable(state, content, nation, "atomic-bomb")).toBe(false);
    expect(priorityAvailable(state, content, nation, "nuclear-weapons")).toBe(true);
  });

  it("pays Funding to CP holders and caps it at 5 × GDP", () => {
    const { state, nation } = setup("deu", { funding: 1 });
    const faction = state.factions.find((f) => f.id === "aegis")!;
    const before = nation.annualFunding;
    const money = faction.resources.money;
    // Day 0 is in January: a day is 1/31 of the month.
    nation.ipProgress["funding"] = 0.99;
    runDailyTick(state, content);
    expect(nation.annualFunding).toBeGreaterThan(before);
    expect(faction.resources.money - money).toBeCloseTo(nation.annualFunding / 12 / 31, 6);
    nation.annualFunding = nation.gdp * 5;
    investNation(state, content, nation);
    expect(nation.annualFunding).toBeCloseTo(nation.gdp * 5, 6);
  });

  it("pays Spoils money as 5 × monthly IP + 2.5 × (10 − Government) per completion", () => {
    const { state, nation } = setup("deu", { spoils: 1 });
    const faction = state.factions.find((f) => f.id === "aegis")!;
    nation.ipProgress["spoils"] = 0;
    const ip = monthlyInvestment(state, content, nation).value;
    const money = faction.resources.money;
    investNation(state, content, nation);
    // Each completion lowers Government a little, so the payout drifts up slightly.
    const perCompletion = 5 * ip + 2.5 * (10 - nation.democracy);
    expect((faction.resources.money - money) / Math.floor(ip)).toBeCloseTo(perCompletion, 0);
  });
});

