import { describe, expect, it } from "vitest";
import { baseContent } from "../../content/index";
import {
  applyCommand,
  constructionFactor,
  delivery,
  deserialize,
  foundingCore,
  habModuleDef,
  habTier,
  missionControlUsed,
  serialize,
  Simulation,
  type Destination,
  type GameState,
  type HabState,
  type Payment,
} from "../index";

const content = baseContent;

/** An all-AI game (nothing waits on a player) where Aegis can found a base on the Moon. */
function game(): { sim: Simulation; state: GameState } {
  const sim = Simulation.create(content, { seed: 13, difficulty: "normal", playerFactions: [] });
  const state = sim.state;
  state.research.completed.push("MissiontotheMoon", "MissiontoMars");
  const aegis = state.factions.find((f) => f.id === "aegis")!;
  for (const p of ["Project_OutpostCore", "Project_PlatformCore", "Project_Solid-FuelSpaceRockets", "Project_SolarCollector", "Project_SettlementCore", "Project_SolarArray", "Project_AdministrationNode", "Project_ConstructionModule", "Project_Nanofactory", "Project_TouristBerth", "Project_ClimateLab"]) aegis.research.completed[p] = 1;
  state.research.version += 1;
  aegis.prospected.push("Luna");
  aegis.resources.boost = 500;
  return { sim, state };
}
const aegis = (state: GameState) => state.factions.find((f) => f.id === "aegis")!;
const site = (id: string): Destination => ({ kind: "site", id });
const orbit = (id: string): Destination => ({ kind: "orbit", id });
const found = (state: GameState, destination: Destination) => applyCommand(state, content, { type: "foundHab", factionId: "aegis", destination });
const build = (state: GameState, hab: HabState, slot: number, moduleId: string, payWith: Payment = "resources") =>
  applyCommand(state, content, { type: "buildModule", factionId: "aegis", habId: hab.id, slot, moduleId, payWith });
/** Runs the clock to a day. */
function runTo(sim: Simulation, day: number): void {
  while (sim.state.dayIndex < day) sim.advance(day - sim.state.dayIndex);
}
/** Founds a base at Shackleton Crater and runs until its core is built. */
function lunarBase(): { sim: Simulation; state: GameState; hab: HabState } {
  const { sim, state } = game();
  expect(found(state, site("LunaSite8"))).toEqual({ ok: true });
  const hab = state.habs.at(-1)!;
  runTo(sim, hab.modules[0]!.doneDay);
  return { sim, state, hab };
}

describe("starting habs", () => {
  it("give Lumen the ISS and the Ark Tiangong, built and using mission control", () => {
    const { state } = game();
    const iss = state.habs.find((h) => h.name === "International Space Station")!;
    expect(iss).toMatchObject({ factionId: "lumen", orbitId: "LowEarthOrbit4", siteId: null });
    expect(iss.modules.map((m) => m?.moduleId ?? null)).toEqual(["PlatformCore", null, "SolarCollector", "SpaceScienceLab", "SolarCollector"]);
    expect(state.habs.find((h) => h.name === "Tiangong")!.factionId).toBe("ark");
    expect(missionControlUsed(state, content, "lumen")).toBe(2);
    expect(missionControlUsed(state, content, "aegis")).toBe(0);
  });
});

describe("founding a hab", () => {
  it("sends the core for its boost, to be built where it lands", () => {
    const { state } = game();
    const destination = site("LunaSite8");
    const cost = delivery(state, content, "aegis", destination, foundingCore(content, destination));
    expect(found(state, destination)).toEqual({ ok: true });
    const hab = state.habs.at(-1)!;
    expect(hab).toMatchObject({ factionId: "aegis", siteId: "LunaSite8", name: "Shackleton Crater Base" });
    expect(aegis(state).resources.boost).toBeCloseTo(500 - cost.boost!.value, 6);
    expect(hab.modules).toHaveLength(1 + content.rules.space.slotsByTier[0]);
    expect(hab.modules[0]).toMatchObject({ moduleId: "OutpostCore", arrivesDay: cost.arrivesDay, doneDay: cost.arrivesDay + habModuleDef(content, "OutpostCore").buildDays });
    expect(missionControlUsed(state, content, "aegis")).toBe(2);
  });

  it("takes one base a site, and only as many stations as the orbit holds", () => {
    const { state } = game();
    expect(found(state, site("LunaSite8")).ok).toBe(true);
    expect(found(state, site("LunaSite8"))).toEqual({ ok: false, reason: "Shackleton Crater already holds Shackleton Crater Base" });
    expect(found(state, orbit("LowEarthOrbit4"))).toEqual({ ok: false, reason: "ISS Orbit holds no more stations" });
    expect(found(state, orbit("LowEarthOrbit1")).ok).toBe(true);
    expect(found(state, orbit("LowEarthOrbit1")).ok).toBe(true);
    expect(state.habs.at(-1)!.name).toBe("Low Earth Orbit 1 Station 2");
  });
});

describe("building modules", () => {
  it("waits for the core, then builds a module for its space resources", () => {
    const { sim, state } = game();
    found(state, site("LunaSite8"));
    const hab = state.habs.at(-1)!;
    expect(build(state, hab, 1, "SolarCollector")).toEqual({ ok: false, reason: "Shackleton Crater Base's core is still being built" });
    runTo(sim, hab.modules[0]!.doneDay);
    aegis(state).resources.metals = 0;
    expect(build(state, hab, 1, "SolarCollector").ok).toBe(false);
    aegis(state).resources.volatiles = 10;
    aegis(state).resources.metals = 10;
    aegis(state).resources.nobleMetals = 10;
    expect(build(state, hab, 1, "SolarCollector")).toEqual({ ok: true });
    const cost = habModuleDef(content, "SolarCollector").buildCost;
    expect(aegis(state).resources.metals).toBeCloseTo(10 - cost.metals!, 6);
    const slot = hab.modules[1]!;
    expect(slot.doneDay - state.dayIndex).toBe(habModuleDef(content, "SolarCollector").buildDays);
    runTo(sim, slot.doneDay);
    expect(state.log.at(-1)!.text).toBe("Shackleton Crater Base: Solar Collector built.");
  });

  it("can send the materials up with boost instead, arriving after the transfer", () => {
    const { state, hab } = lunarBase();
    const boost = aegis(state).resources.boost;
    expect(build(state, hab, 1, "SolarCollector", "boost")).toEqual({ ok: true });
    const slot = hab.modules[1]!;
    expect(slot.arrivesDay - state.dayIndex).toBe(5);
    expect(aegis(state).resources.boost).toBeLessThan(boost);
  });

  it("keeps modules to the hab's tier, kind, place and one of a kind", () => {
    const { state, hab } = lunarBase();
    Object.assign(aegis(state).resources, { water: 100, volatiles: 100, metals: 100, nobleMetals: 100 });
    expect(build(state, hab, 1, "SolarArray")).toEqual({ ok: false, reason: "Solar Array needs a tier 2 core" });
    expect(build(state, hab, 1, "ClimateLab")).toEqual({ ok: false, reason: "Climate Lab goes only on stations" });
    expect(build(state, hab, 1, "TouristBerth")).toEqual({ ok: false, reason: "Tourist Berth goes only on stations" });
    expect(build(state, hab, 0, "SolarCollector")).toEqual({ ok: false, reason: "Only a core goes in the core's place" });
    expect(build(state, hab, 1, "SettlementCore")).toEqual({ ok: false, reason: "A core goes in the core's place" });
    expect(build(state, hab, 1, "AdministrationNode").ok).toBe(true);
    expect(build(state, hab, 2, "AdministrationNode")).toEqual({ ok: false, reason: "Only one Administration Node per hab" });
    expect(build(state, hab, 1, "SolarCollector")).toEqual({ ok: false, reason: "That slot holds Administration Node" });
    // A station in the irradiated Medium Earth Orbit can't take a tourist berth, nor one in lunar orbit a climate lab.
    found(state, orbit("MediumEarthOrbit"));
    const station = state.habs.at(-1)!;
    station.modules[0]!.doneDay = state.dayIndex;
    expect(build(state, station, 1, "TouristBerth")).toEqual({ ok: false, reason: "Tourist Berth can't be built where there is radiation" });
    expect(build(state, station, 1, "ClimateLab")).toEqual({ ok: false, reason: "Climate Lab goes only in low Earth orbit" });
  });

  it("upgrades a core for two thirds of its cost and time, opening more slots when done", () => {
    const { sim, state, hab } = lunarBase();
    Object.assign(aegis(state).resources, { water: 100, volatiles: 100, metals: 100, nobleMetals: 100 });
    const settlement = habModuleDef(content, "SettlementCore");
    const metals = aegis(state).resources.metals;
    expect(build(state, hab, 0, "SettlementCore")).toEqual({ ok: true });
    expect(metals - aegis(state).resources.metals).toBeCloseTo((settlement.buildCost.metals! * 2) / 3, 6);
    const upgrade = hab.modules[0]!.upgrade!;
    expect(upgrade.doneDay - state.dayIndex).toBe(Math.ceil((settlement.buildDays * 2) / 3));
    // The outpost keeps working meanwhile.
    expect(habTier(content, hab)).toBe(1);
    runTo(sim, upgrade.doneDay);
    expect(habTier(content, hab)).toBe(2);
    expect(hab.modules).toHaveLength(1 + content.rules.space.slotsByTier[1]);
    expect(missionControlUsed(state, content, "aegis")).toBe(3);
  });

  it("builds faster with construction modules, each with less effect than the last", () => {
    const { state, hab } = lunarBase();
    expect(constructionFactor(state, content, hab)).toBe(1);
    hab.modules[1] = { moduleId: "ConstructionModule", arrivesDay: 0, doneDay: 0, upgrade: null };
    expect(constructionFactor(state, content, hab)).toBeCloseTo(0.9, 9);
    hab.modules[2] = { moduleId: "Nanofactory", arrivesDay: 0, doneDay: 0, upgrade: null };
    // The fastest first: 0.75, then 0.9's tenth over 2².
    expect(constructionFactor(state, content, hab)).toBeCloseTo(0.75 * (1 - 0.1 / 4), 9);
  });
});

describe("saves", () => {
  it("give version 30 saves the starting habs a new game has", () => {
    const sim = Simulation.create(content, { seed: 13, difficulty: "normal", playerFactions: [] });
    const old = JSON.parse(serialize(sim.state));
    old.version = 30;
    delete old.state.habs;
    const loaded = deserialize(JSON.stringify(old), content);
    expect(loaded.habs.map((h) => [h.name, h.factionId, h.orbitId])).toEqual(sim.state.habs.map((h) => [h.name, h.factionId, h.orbitId]));
  });
});
