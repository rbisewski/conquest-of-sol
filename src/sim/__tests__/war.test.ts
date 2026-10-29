import { describe, expect, it } from "vitest";
import { baseContent } from "../../content/index";
import {
  areAllies,
  areRivals,
  armyActivity,
  atWar,
  checkAirlift,
  checkMove,
  checkDiplomacy,
  checkPolicy,
  consolidationDaysLeft,
  distanceKm,
  enactPolicy,
  hashState,
  hitChance,
  nukeTargets,
  navalFreedom,
  nationArmies,
  raiseArmy,
  regionDef,
  seizeExecutive,
  startMove,
  trackExecutives,
  Simulation,
  type GameState,
} from "../index";

const content = baseContent;

/** Advances day by day, ending the player's council phases, until the condition holds. */
function runUntil(sim: Simulation, done: (state: GameState) => boolean, maxDays: number): number {
  for (let day = 0; day < maxDays; day++) {
    if (done(sim.state)) return day;
    if (sim.state.phase === "council") sim.apply({ type: "endCouncilPhase", factionId: "aegis" });
    sim.advance(1);
  }
  return maxDays;
}

/** Aegis (the player) holds every CP of Armenia, which gets three strong armies; Azerbaijan is its rival. */
function armeniaAtWar(): Simulation {
  const sim = Simulation.create(content, { seed: 11, difficulty: "normal", playerFactions: ["aegis"] });
  const s = sim.state;
  const arm = s.nations.find((n) => n.id === "arm")!;
  for (const cp of arm.controlPoints) cp.owner = "aegis";
  seizeExecutive(s, arm);
  Object.assign(arm, { militaryFounded: true, militaryTech: 6 });
  for (let i = 0; i < 3; i++) raiseArmy(s, content, "arm");
  const councilor = s.factions.find((f) => f.id === "aegis")!.councilors[0]!;
  const assigned = sim.apply({
    type: "assignMission",
    factionId: "aegis",
    councilorId: councilor.id,
    mission: { type: "setPolicy", nationId: "arm" },
  });
  expect(assigned).toEqual({ ok: true });
  // The clock stops once the mission succeeds, until the policy is picked.
  runUntil(sim, (state) => state.policyChoices.length > 0, 30);
  expect(sim.apply({ type: "choosePolicy", factionId: "aegis", nationId: "arm", policy: { kind: "declareWar", targetId: "aze" } })).toEqual({ ok: true });
  expect(atWar(sim.state, "arm", "aze")).toBe(true);
  return sim;
}

describe("armies", () => {
  it("start as units in their nations' regions, matching the nation data", () => {
    const sim = Simulation.create(content, { seed: 1, difficulty: "normal", playerFactions: [] });
    for (const def of content.nations) {
      const armies = nationArmies(sim.state, def.id);
      expect(armies).toHaveLength(def.armies);
      expect(armies.filter((a) => a.navy)).toHaveLength(Math.min(def.navies, def.armies));
      for (const a of armies) {
        expect(regionDef(content, a.homeRegionId).nationId).toBe(def.id);
        expect(a.regionId).toBe(a.homeRegionId);
      }
    }
  });

  it("measures distances between region centres", () => {
    const berlin = regionDef(content, "deu-1");
    const madrid = regionDef(content, "esp-1");
    // Real Berlin–Madrid is about 1,870 km; region centres sit a little off the cities.
    expect(distanceKm(berlin, madrid)).toBeGreaterThan(1500);
    expect(distanceKm(berlin, madrid)).toBeLessThan(2200);
    expect(distanceKm(madrid, berlin)).toBeCloseTo(distanceKm(berlin, madrid), 9);
    expect(distanceKm(berlin, berlin)).toBe(0);
  });

  it("move only into their own, allied or enemy nations", () => {
    const sim = Simulation.create(content, { seed: 1, difficulty: "normal", playerFactions: [] });
    const s = sim.state;
    const army = nationArmies(s, "usa")[0]!;
    const borderCanada = content.regions.find((r) => r.nationId === "usa" && r.neighbors.some((n) => n.startsWith("can-")))!;
    const borderMexico = content.regions.find((r) => r.nationId === "usa" && r.neighbors.some((n) => n.startsWith("mex-")))!;
    army.regionId = borderCanada.id;
    const canada = borderCanada.neighbors.find((n) => n.startsWith("can-"))!;
    expect(areAllies(s, "usa", "can")).toBe(true);
    const toCanada = checkMove(s, content, army, canada);
    expect(toCanada.ok && !toCanada.naval && toCanada.days > 0).toBe(true);
    army.regionId = borderMexico.id;
    const mexico = borderMexico.neighbors.find((n) => n.startsWith("mex-"))!;
    expect(checkMove(s, content, army, mexico)).toMatchObject({ ok: false });
  });

  it("fly home when airlifted, marked apart from sailing", () => {
    const sim = Simulation.create(content, { seed: 1, difficulty: "normal", playerFactions: [] });
    const s = sim.state;
    const army = nationArmies(s, "usa").find((a) => a.navy)!;
    army.regionId = content.regions.find((r) => r.nationId === "usa" && r.id !== army.homeRegionId)!.id;
    const check = checkAirlift(s, content, army);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    startMove(s, army, army.homeRegionId, check.days, check.naval, true);
    expect(army.move).toMatchObject({ toRegionId: army.homeRegionId, naval: true, airlift: true });
    expect(armyActivity(s, content, army)).toMatch(/^Flying to /);
    startMove(s, army, army.homeRegionId, check.days, true);
    expect(army.move!.airlift).toBeUndefined();
    expect(armyActivity(s, content, army)).toMatch(/^Sailing to /);
  });

  it("follow Terra Invicta's hit chances", () => {
    expect(hitChance(content, 3, 3)).toBeCloseTo(0.5, 10);
    expect(hitChance(content, 4, 3)).toBeCloseTo(0.659, 3);
    expect(hitChance(content, 2, 3)).toBeCloseTo(0.341, 3);
  });
});

describe("alliances", () => {
  it("can't be proposed to a nation whose breakaway (or parent) we are allied with", () => {
    const sim = Simulation.create(content, { seed: 1, difficulty: "normal", playerFactions: [] });
    const s = sim.state;
    const usa = s.nations.find((n) => n.id === "usa")!;
    for (const cp of usa.controlPoints) cp.owner = "aegis";
    s.factions.find((f) => f.id === "aegis")!.resources.influence = 100;
    expect(areAllies(s, "usa", "can")).toBe(true);
    expect(checkDiplomacy(s, content, "aegis", "proposeAlliance", "usa", "mex")).toEqual({ ok: true });
    s.breakaways["can"] = "mex";
    expect(checkDiplomacy(s, content, "aegis", "proposeAlliance", "usa", "mex")).toEqual({ ok: false, reason: "An alliance with Canada stands in the way (a breakaway and its parent)" });
  });
});

describe("war", () => {
  it("is declared by the Set National Policy mission, between rivals", () => {
    const sim = armeniaAtWar();
    const war = sim.state.wars[0]!;
    expect(war.attackers).toEqual(["arm"]);
    expect(war.defenders[0]).toBe("aze");
    expect(sim.state.log.some((e) => /declared war on Azerbaijan/.test(e.text))).toBe(true);
  });

  it("waits for the player's policy after Set National Policy, refunding it when none is set", () => {
    const sim = Simulation.create(content, { seed: 11, difficulty: "normal", playerFactions: ["aegis"] });
    const s = sim.state;
    for (const cp of s.nations.find((n) => n.id === "arm")!.controlPoints) cp.owner = "aegis";
    const faction = s.factions.find((f) => f.id === "aegis")!;
    expect(sim.apply({ type: "assignMission", factionId: "aegis", councilorId: faction.councilors[0]!.id, mission: { type: "setPolicy", nationId: "arm" } })).toEqual({ ok: true });
    runUntil(sim, (state) => state.policyChoices.length > 0, 30);
    const day = s.dayIndex;
    expect(sim.advance(5)).toBe(0);
    expect(s.dayIndex).toBe(day);
    const influence = faction.resources.influence;
    expect(sim.apply({ type: "choosePolicy", factionId: "aegis", nationId: "arm", policy: { kind: "declareWar", targetId: "fra" } }).ok).toBe(false);
    expect(sim.apply({ type: "choosePolicy", factionId: "aegis", nationId: "arm", policy: null })).toEqual({ ok: true });
    expect(faction.resources.influence).toBe(influence + content.rules.missions.costs.setPolicy!.fixed!);
    expect(s.policyChoices).toHaveLength(0);
    expect(sim.advance(1)).toBe(1);
  });

  it("needs executive control held for 90 days, or seized by force, for the bigger policies", () => {
    const sim = Simulation.create(content, { seed: 1, difficulty: "normal", playerFactions: [] });
    const s = sim.state;
    const fra = s.nations.find((n) => n.id === "fra")!;
    fra.controlPoints[0]!.owner = "aegis";
    trackExecutives(s);
    expect(checkPolicy(s, content, "aegis", "fra", { kind: "disarm" })).toEqual({ ok: false, reason: "Executive control of France isn't consolidated yet (90 more days)" });
    s.dayIndex += 89;
    expect(consolidationDaysLeft(s, content, fra)).toBe(1);
    s.dayIndex += 1;
    expect(checkPolicy(s, content, "aegis", "fra", { kind: "disarm" })).toEqual({ ok: true });
    // A new holder starts over, unless it took the nation by force.
    fra.controlPoints[0]!.owner = "lumen";
    trackExecutives(s);
    expect(checkPolicy(s, content, "lumen", "fra", { kind: "disarm" }).ok).toBe(false);
    seizeExecutive(s, fra);
    expect(checkPolicy(s, content, "lumen", "fra", { kind: "disarm" })).toEqual({ ok: true });
  });

  it("disbands only armies we command, with Disband Army", () => {
    const sim = armeniaAtWar();
    const s = sim.state;
    const ours = nationArmies(s, "arm")[0]!;
    const theirs = nationArmies(s, "aze")[0]!;
    expect(checkPolicy(s, content, "aegis", "arm", { kind: "disbandArmy", armyId: theirs.id }).ok).toBe(false);
    expect(checkPolicy(s, content, "aegis", "arm", { kind: "disbandArmy", armyId: ours.id })).toEqual({ ok: true });
    const before = nationArmies(s, "arm").length;
    expect(enactPolicy(s, content, "arm", { kind: "disbandArmy", armyId: ours.id })).toMatch(/disbanded/);
    expect(nationArmies(s, "arm")).toHaveLength(before - 1);
    expect(s.armies.includes(ours)).toBe(false);
  });

  it("takes apart up to five nuclear weapons, clearing the priority's progress at zero, with Disarm Warheads", () => {
    const sim = Simulation.create(content, { seed: 1, difficulty: "normal", playerFactions: [] });
    const s = sim.state;
    const fra = s.nations.find((n) => n.id === "fra")!;
    for (const cp of fra.controlPoints) cp.owner = "aegis";
    seizeExecutive(s, fra);
    fra.nukes = 7;
    fra.ipProgress["nuclear-weapons"] = 12;
    expect(checkPolicy(s, content, "aegis", "fra", { kind: "disarm" })).toEqual({ ok: true });
    enactPolicy(s, content, "fra", { kind: "disarm" });
    expect(fra.nukes).toBe(2);
    expect(fra.ipProgress["nuclear-weapons"]).toBe(12);
    expect(enactPolicy(s, content, "fra", { kind: "disarm" })).toMatch(/eliminated/);
    expect(fra.nukes).toBe(0);
    expect(fra.ipProgress["nuclear-weapons"]).toBeUndefined();
    expect(checkPolicy(s, content, "aegis", "fra", { kind: "disarm" }).ok).toBe(false);
  });

  it("blockades the side whose navies are outscored", () => {
    const sim = armeniaAtWar();
    const s = sim.state;
    expect(navalFreedom(s, "arm")).toBe(true);
    nationArmies(s, "aze")[0]!.navy = true;
    expect(navalFreedom(s, "arm")).toBe(false);
    expect(navalFreedom(s, "aze")).toBe(true);
  });

  it("ends with a regime change when the capital falls: the CPs go to the victor's faction", () => {
    const sim = armeniaAtWar();
    const s = sim.state;
    for (const cp of s.nations.find((n) => n.id === "aze")!.controlPoints) cp.owner = "lumen";
    for (const army of nationArmies(s, "arm")) expect(sim.apply({ type: "moveArmy", factionId: "aegis", armyId: army.id, regionId: "aze-1" })).toEqual({ ok: true });
    const days = runUntil(sim, (state) => state.wars.length === 0, 400);
    expect(days).toBeLessThan(400);
    const aze = s.nations.find((n) => n.id === "aze")!;
    expect(aze.controlPoints.every((cp) => cp.owner === "aegis")).toBe(true);
    expect(areAllies(s, "arm", "aze")).toBe(true);
    expect(areRivals(s, "arm", "aze")).toBe(false);
    expect(s.occupation["aze-1"]).toBeUndefined();
    expect(s.log.some((e) => /government of Azerbaijan has fallen/.test(e.text))).toBe(true);
  });

  it("ends in peace when the other side isn't winning, and the armies go home", () => {
    const sim = armeniaAtWar();
    const s = sim.state;
    const army = nationArmies(s, "arm")[0]!;
    army.regionId = "aze-1";
    const war = s.wars[0]!;
    const text = enactPolicy(s, content, "arm", { kind: "seekPeace", warId: war.id });
    expect(text).toMatch(/is over/);
    expect(s.wars).toHaveLength(0);
    expect(areRivals(s, "arm", "aze")).toBe(true);
    expect(army.regionId).toBe(army.homeRegionId);
  });

  it("stays deterministic while armies fight", () => {
    const run = () => {
      const sim = Simulation.create(content, { seed: 5, difficulty: "normal", playerFactions: [] });
      enactPolicy(sim.state, content, "ind", { kind: "declareWar", targetId: "pak" });
      sim.advance(200);
      return sim.state;
    };
    const a = run();
    expect(hashState(a)).toBe(hashState(run()));
    // The AI took the fight to the enemy: somebody moved, got hurt or took ground.
    const fought = a.armies.some((x) => x.health < 1 || x.regionId !== x.homeRegionId) || Object.keys(a.occupation).length > 0 || a.wars.length === 0;
    expect(fought).toBe(true);
  });
});

describe("nuclear strikes", () => {
  it("need a war, and reach the enemy's bordering regions", () => {
    const sim = Simulation.create(content, { seed: 11, difficulty: "normal", playerFactions: ["aegis"] });
    const arm = sim.state.nations.find((n) => n.id === "arm")!;
    for (const cp of arm.controlPoints) cp.owner = "aegis";
    seizeExecutive(sim.state, arm);
    arm.nukes = 2;
    expect(nukeTargets(sim.state, content, "arm")).toEqual([]);
    const aze = content.regions.find((r) => r.nationId === "aze")!;
    expect(sim.apply({ type: "nuclearStrike", factionId: "aegis", nationId: "arm", regionId: aze.id }).ok).toBe(false);
  });

  it("devastate the region, wreck the armies in it and darken the sky", () => {
    const sim = armeniaAtWar();
    const s = sim.state;
    const arm = s.nations.find((n) => n.id === "arm")!;
    arm.nukes = 3;
    const targets = nukeTargets(s, content, "arm");
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((id) => s.regionOwners[id] === "aze")).toBe(true);
    const regionId = targets[0]!;
    const aze = s.nations.find((n) => n.id === "aze")!;
    // An Azerbaijani army stands in the region.
    const army = raiseArmy(s, content, "aze");
    army.regionId = regionId;
    const before = { population: aze.population, gdp: aze.gdp, aerosols: s.climate.aerosols, usa: s.nations.find((n) => n.id === "usa")!.gdp };

    expect(sim.apply({ type: "nuclearStrike", factionId: "aegis", nationId: "arm", regionId })).toEqual({ ok: true });
    expect(arm.nukes).toBe(2);
    expect(aze.population).toBeLessThan(before.population);
    expect(aze.gdp).toBeLessThan(before.gdp);
    expect(s.nations.find((n) => n.id === "usa")!.gdp).toBeLessThan(before.usa);
    expect(s.armies).not.toContain(army);
    expect(s.climate.aerosols).toBeCloseTo(before.aerosols + content.rules.military.nukes.aerosols, 9);
    expect(s.strikes.at(-1)).toMatchObject({ launcherId: "arm", factionId: "aegis", regionId });
    expect(s.log.some((e) => /nuclear strike/.test(e.text))).toBe(true);

    // Only the faction holding the executive can fire.
    expect(sim.apply({ type: "nuclearStrike", factionId: "lumen", nationId: "arm", regionId }).ok).toBe(false);
  });
});
