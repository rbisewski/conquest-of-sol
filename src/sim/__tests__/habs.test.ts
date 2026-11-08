import { describe, expect, it } from "vitest";
import { baseContent } from "../../content/index";
import {
  applyCommand,
  constructionFactor,
  delivery,
  deserialize,
  foundingCore,
  habLedger,
  habModuleDef,
  habOperation,
  habTier,
  MINING_SLOT,
  mineNetwork,
  missionControlUsed,
  runHabEconomy,
  serialize,
  Simulation,
  type Destination,
  type GameState,
  type HabModuleState,
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
  for (const p of ["Project_OutpostCore", "Project_PlatformCore", "Project_Solid-FuelSpaceRockets", "Project_SolarCollector", "Project_SettlementCore", "Project_SolarArray", "Project_AdministrationNode", "Project_ConstructionModule", "Project_Nanofactory", "Project_TouristBerth", "Project_ClimateLab", "Project_OutpostMiningComplex", "Project_HydroponicsBay"]) aegis.research.completed[p] = 1;
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
/** A built module, switched on. */
const built = (moduleId: string): HabModuleState => ({ moduleId, arrivesDay: 0, doneDay: 0, upgrade: null, off: false });
/** Gives Aegis all the mission control it could want until the next day's tick. */
const plentyOfMissionControl = (state: GameState) => (aegis(state).resources.missionControl = 50);
/** A base with an outpost mine and a fusion pile to run it, working from day 0. */
function minedBase(state: GameState, siteId: string): HabState {
  const hab: HabState = { id: `hab-${siteId}`, factionId: "aegis", name: siteId, siteId, orbitId: null, foundedDay: 0, unsupplied: false, modules: [built("OutpostCore"), built("OutpostMiningComplex"), built("FusionPile"), null, null] };
  state.habs.push(hab);
  return hab;
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
    plentyOfMissionControl(state);
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
    expect(build(state, hab, 2, "SolarCollector")).toEqual({ ok: false, reason: "Shackleton Crater Base's core is still being built" });
    runTo(sim, hab.modules[0]!.doneDay);
    aegis(state).resources.metals = 0;
    expect(build(state, hab, 2, "SolarCollector").ok).toBe(false);
    aegis(state).resources.volatiles = 10;
    aegis(state).resources.metals = 10;
    aegis(state).resources.nobleMetals = 10;
    expect(build(state, hab, 2, "SolarCollector")).toEqual({ ok: true });
    const cost = habModuleDef(content, "SolarCollector").buildCost;
    expect(aegis(state).resources.metals).toBeCloseTo(10 - cost.metals!, 6);
    const slot = hab.modules[2]!;
    expect(slot.doneDay - state.dayIndex).toBe(habModuleDef(content, "SolarCollector").buildDays);
    runTo(sim, slot.doneDay);
    expect(state.log.at(-1)!.text).toBe("Shackleton Crater Base: Solar Collector built.");
  });

  it("can send the materials up with boost instead, arriving after the transfer", () => {
    const { state, hab } = lunarBase();
    const boost = aegis(state).resources.boost;
    expect(build(state, hab, 2, "SolarCollector", "boost")).toEqual({ ok: true });
    const slot = hab.modules[2]!;
    expect(slot.arrivesDay - state.dayIndex).toBe(5);
    expect(aegis(state).resources.boost).toBeLessThan(boost);
  });

  it("keeps modules to the hab's tier, kind, place and one of a kind", () => {
    const { state, hab } = lunarBase();
    Object.assign(aegis(state).resources, { water: 100, volatiles: 100, metals: 100, nobleMetals: 100 });
    expect(build(state, hab, 2, "SolarArray")).toEqual({ ok: false, reason: "Solar Array needs a tier 2 core" });
    expect(build(state, hab, 2, "ClimateLab")).toEqual({ ok: false, reason: "Climate Lab goes only on stations" });
    expect(build(state, hab, 2, "TouristBerth")).toEqual({ ok: false, reason: "Tourist Berth goes only on stations" });
    expect(build(state, hab, 0, "SolarCollector")).toEqual({ ok: false, reason: "Only a core goes in the core's place" });
    expect(build(state, hab, 2, "SettlementCore")).toEqual({ ok: false, reason: "A core goes in the core's place" });
    expect(build(state, hab, 2, "AdministrationNode").ok).toBe(true);
    expect(build(state, hab, 3, "AdministrationNode")).toEqual({ ok: false, reason: "Only one Administration Node per hab" });
    expect(build(state, hab, 2, "SolarCollector")).toEqual({ ok: false, reason: "That slot holds Administration Node" });
    // A station in the irradiated Medium Earth Orbit can't take a tourist berth, nor one in lunar orbit a climate lab.
    plentyOfMissionControl(state);
    found(state, orbit("MediumEarthOrbit"));
    const station = state.habs.at(-1)!;
    station.modules[0]!.doneDay = state.dayIndex;
    expect(build(state, station, 1, "TouristBerth")).toEqual({ ok: false, reason: "Tourist Berth can't be built where there is radiation" });
    expect(build(state, station, 1, "ClimateLab")).toEqual({ ok: false, reason: "Climate Lab goes only in low Earth orbit" });
  });

  it("upgrades a core for two thirds of its cost and time, opening more slots when done", () => {
    const { sim, state, hab } = lunarBase();
    Object.assign(aegis(state).resources, { water: 100, volatiles: 100, metals: 100, nobleMetals: 100 });
    plentyOfMissionControl(state);
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

  it("builds faster with working construction modules, each with less effect than the last", () => {
    const { state, hab } = lunarBase();
    expect(constructionFactor(state, content, hab)).toBe(1);
    hab.modules[2] = built("ConstructionModule");
    // Without power it does nothing.
    expect(constructionFactor(state, content, hab)).toBe(1);
    hab.modules[4] = built("HeavyFusionPile");
    expect(constructionFactor(state, content, hab)).toBeCloseTo(0.9, 9);
    hab.modules[3] = built("Nanofactory");
    // The fastest first: 0.75, then 0.9's tenth over 2².
    expect(constructionFactor(state, content, hab)).toBeCloseTo(0.75 * (1 - 0.1 / 4), 9);
  });
});

describe("power", () => {
  it("goes to modules that take power first, then slot by slot; switched-off modules take none", () => {
    const { state, hab } = lunarBase();
    // A Luna solar collector makes 10 (half of 20: the surface has night).
    hab.modules[2] = built("SolarCollector");
    hab.modules[3] = built("ConstructionModule");
    hab.modules[4] = built("HydroponicsBay");
    const op = habOperation(state, content, hab);
    expect(op.status).toEqual(["working", null, "working", "unpowered", "working"]);
    expect([op.made, op.used, op.wanted]).toEqual([10, 10, 20]);
    const power = (slot: number, on: boolean) => applyCommand(state, content, { type: "setModulePower", factionId: "aegis", habId: hab.id, slot, on });
    expect(power(4, false)).toEqual({ ok: false, reason: "Hydroponics Bay can't be switched off" });
    expect(power(2, false)).toEqual({ ok: false, reason: "Solar Collector makes power" });
    expect(power(3, false)).toEqual({ ok: true });
    expect(habOperation(state, content, hab).status).toEqual(["working", null, "working", "off", "working"]);
  });
});

describe("mining", () => {
  it("puts mines only in a base's mining slot, at a cost scaled by the body's mining modifier", () => {
    const { state, hab } = lunarBase();
    Object.assign(aegis(state).resources, { water: 100, volatiles: 100, metals: 100, nobleMetals: 100 });
    expect(build(state, hab, 2, "OutpostMiningComplex")).toEqual({ ok: false, reason: "Outpost Mining Complex goes in a base's mining slot" });
    expect(build(state, hab, MINING_SLOT, "SolarCollector")).toEqual({ ok: false, reason: "Only a mine goes in the mining slot" });
    const metals = aegis(state).resources.metals;
    expect(build(state, hab, MINING_SLOT, "OutpostMiningComplex")).toEqual({ ok: true });
    expect(metals - aegis(state).resources.metals).toBeCloseTo(habModuleDef(content, "OutpostMiningComplex").buildCost.metals! * 0.5071, 6);
  });

  it("yields its site's resources a month, raised by the faction's mining projects", () => {
    const { state } = game();
    const hab = minedBase(state, "LunaSite8");
    const site = state.siteYields["LunaSite8"]!;
    expect(habLedger(state, content, hab).income.metals).toBeCloseTo(site.metals, 9);
    aegis(state).research.completed["Project_AdvancedProspectingSurveys"] = 1;
    aegis(state).research.completed["Project_DeepSpaceMetallurgy"] = 1;
    state.research.version += 1;
    expect(habLedger(state, content, hab).income.metals).toBeCloseTo(site.metals * 1.1 * 1.15, 9);
    // Without power the mine yields nothing.
    hab.modules[2] = null;
    expect(habLedger(state, content, hab).income.metals).toBeUndefined();
  });

  it("costs mission control for working mines beyond the faction's limit: max(1, ⌊excess² / 2⌋)", () => {
    const { state } = game();
    // The Moon and Mars missions let each faction work 3 + 6 mines for nothing.
    const sites = content.habSites.slice(0, 12);
    const costs = sites.map((s) => {
      minedBase(state, s.id);
      return mineNetwork(state, content, "aegis").cost;
    });
    expect(costs).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 4]);
    expect(missionControlUsed(state, content, "aegis")).toBe(12 * 2 + 4);
    // A mine switched off doesn't count.
    state.habs.at(-1)!.modules[MINING_SLOT]!.off = true;
    expect(mineNetwork(state, content, "aegis")).toEqual({ active: 11, free: 9, cost: 2, next: 2 });
  });
});

describe("upkeep", () => {
  it("pays its modules' upkeep and its crew's life support; the ISS's water and volatiles cost Lumen its own boost", () => {
    const { state } = game();
    const iss = state.habs.find((h) => h.name === "International Space Station")!;
    // Platform core 3, two solar collectors 1 each, science lab 3: eight crew.
    const ledger = habLedger(state, content, iss);
    expect(ledger.upkeep.water).toBeCloseTo((8 * 0.35) / 12, 9);
    expect(ledger.upkeep.money).toBeCloseTo(2 + 1 + 1 + 2 + (8 * 0.1) / 12, 9);
    // Terra Invicta gives Lumen 5.6 boost a year for it: exactly the water and volatiles, a unit of boost for a unit of each.
    expect(((ledger.upkeep.water! + ledger.upkeep.volatiles!) * 12)).toBeCloseTo(5.6, 9);
  });

  it("lets boost stand in for missing space resources, and marks a hab unsupplied when that runs out too", () => {
    const { state, hab } = lunarBase();
    Object.assign(aegis(state).resources, { water: 0, volatiles: 0, boost: 10 });
    runHabEconomy(state, content, 1 / 30);
    // Five crew: 0.35 water and 0.35 volatiles each a year.
    expect(10 - aegis(state).resources.boost).toBeCloseTo((5 * 0.7) / 12 / 30, 9);
    expect(hab.unsupplied).toBe(false);
    aegis(state).resources.boost = 0;
    runHabEconomy(state, content, 1 / 30);
    expect(hab.unsupplied).toBe(true);
  });

  it("lets farms feed their crew", () => {
    const { state, hab } = lunarBase();
    hab.modules[2] = built("SolarCollector");
    expect(habLedger(state, content, hab).upkeep.water).toBeCloseTo((5 + 1) * 0.35 / 12, 9);
    hab.modules[3] = built("HydroponicsBay");
    expect(habLedger(state, content, hab).upkeep.water).toBeUndefined();
  });
});

describe("mission control", () => {
  it("stops founding and building while we'd have too little", () => {
    const { state, hab } = lunarBase();
    Object.assign(aegis(state).resources, { water: 100, volatiles: 100, metals: 100, nobleMetals: 100, missionControl: 2 });
    expect(found(state, orbit("LowEarthOrbit1"))).toEqual({ ok: false, reason: "Needs 2 mission control: we use 2 of our 2" });
    expect(build(state, hab, 0, "SettlementCore")).toEqual({ ok: false, reason: "Needs 1 mission control: we use 2 of our 2" });
    aegis(state).resources.missionControl = 1;
    expect(build(state, hab, 2, "SolarCollector")).toEqual({ ok: false, reason: "We use 2 mission control of our 1" });
  });

  it("breaks modules (never the core) while we use more than we have", () => {
    const { sim, state } = game();
    // Twelve bases use 24 mission control: far more than Aegis has, so a malfunction a month at each.
    const habs = content.habSites.slice(0, 12).map((s) => minedBase(state, s.id));
    runTo(sim, 90);
    expect(habs.every((h) => h.modules[0]!.moduleId === "OutpostCore")).toBe(true);
    expect(habs.filter((h) => h.modules.slice(1).every((m) => m === null)).length).toBeGreaterThan(6);
    expect(state.log.some((e) => / a malfunction destroyed its .*, as we use more mission control than we have\.$/.test(e.text))).toBe(true);
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

  it("switch every module of a version 31 save on, and every hab supplied", () => {
    const sim = Simulation.create(content, { seed: 13, difficulty: "normal", playerFactions: [] });
    const old = JSON.parse(serialize(sim.state));
    old.version = 31;
    for (const h of old.state.habs) {
      delete h.unsupplied;
      for (const m of h.modules) if (m) delete m.off;
    }
    const loaded = deserialize(JSON.stringify(old), content);
    expect(loaded.habs.every((h) => h.unsupplied === false && h.modules.every((m) => m === null || m.off === false))).toBe(true);
  });
});
