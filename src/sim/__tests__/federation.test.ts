import { describe, expect, it } from "vitest";
import { baseContent } from "../../content/index";
import {
  addAlliance,
  answerDefection,
  applyDiplomacy,
  areAllies,
  atWar,
  checkDiplomacy,
  checkPolicy,
  deserialize,
  detPow,
  enactPolicy,
  expireCooldowns,
  federationEconomyBonus,
  federationOf,
  nationState,
  policyOptions,
  priorityAvailable,
  removeFromFederation,
  sameFederation,
  serialize,
  sharedOutputs,
  seizeExecutive,
  Simulation,
  type GameState,
} from "../index";

const content = baseContent;
const fresh = () => Simulation.create(content, { seed: 7, difficulty: "normal", playerFactions: ["aegis"] }).state;
const nation = (state: GameState, id: string) => nationState(state, id);

/** Aegis runs the nation outright: every CP, the executive included. */
function runBy(state: GameState, id: string, faction = "aegis"): void {
  for (const cp of nation(state, id).controlPoints) cp.owner = faction;
  // Held long enough to be consolidated.
  seizeExecutive(state, nation(state, id));
}

describe("starting federations", () => {
  it("puts the European Union and the Eurasian Union in place, their members allied", () => {
    const state = fresh();
    const eu = federationOf(state, "deu")!;
    expect(eu.name).toBe("European Union");
    expect(eu.leaderId).toBe("fra");
    expect(eu.members).toHaveLength(27);
    expect(federationOf(state, "blr")!.leaderId).toBe("rus");
    for (const a of eu.members) for (const b of eu.members) if (a !== b) expect(areAllies(state, a, b)).toBe(true);
  });

  it("keeps members from ending their alliance", () => {
    const state = fresh();
    runBy(state, "deu");
    state.factions.find((f) => f.id === "aegis")!.resources.influence = 100;
    expect(checkDiplomacy(state, content, "aegis", "endAlliance", "deu", "fra")).toEqual({ ok: false, reason: "Members of the European Union stay allied" });
  });
});

describe("federation effects", () => {
  it("pools Funding and Boost, sharing them by CP count cubed", () => {
    const state = fresh();
    const eu = federationOf(state, "fra")!;
    const members = eu.members.map((id) => nation(state, id));
    const total = members.reduce((sum, n) => sum + n.annualFunding, 0);
    const pooled = members.reduce((sum, n) => sum + sharedOutputs(state, content, n).annualFunding, 0);
    expect(pooled).toBeCloseTo(total, 6);
    const weights = members.reduce((sum, n) => sum + detPow(n.controlPoints.length, 3), 0);
    const deu = nation(state, "deu");
    expect(sharedOutputs(state, content, deu).annualFunding).toBeCloseTo((total * detPow(deu.controlPoints.length, 3)) / weights, 6);
    // Outside a federation, a nation keeps its own.
    const usa = nation(state, "usa");
    expect(sharedOutputs(state, content, usa).annualFunding).toBe(usa.annualFunding);
  });

  it("gives an Economy bonus of (other members' GDP)^0.25 / 2 percent", () => {
    const state = fresh();
    const others = federationOf(state, "deu")!.members.filter((id) => id !== "deu").reduce((sum, id) => sum + nation(state, id).gdp, 0);
    expect(federationEconomyBonus(state, content, nation(state, "deu"))).toBe(Math.round(detPow(others, 0.25) / 2) / 100);
    expect(federationEconomyBonus(state, content, nation(state, "usa"))).toBe(0);
  });

  it("lets members without a space program build Boost when another member has one", () => {
    const state = fresh();
    const lux = nation(state, "lux");
    lux.spaceProgram = false;
    expect(priorityAvailable(state, content, lux, "boost")).toBe(true);
    removeFromFederation(state, content, "lux");
    expect(priorityAvailable(state, content, lux, "boost")).toBe(false);
  });
});

describe("Federate policy", () => {
  it("founds a federation between allies with a claim, led by the one with more claims", () => {
    const state = fresh();
    runBy(state, "aus");
    runBy(state, "nzl");
    const policy = { kind: "federate", targetId: "nzl" } as const;
    expect(checkPolicy(state, content, "aegis", "aus", policy)).toEqual({ ok: false, reason: "They must be allies, off diplomatic cooldown" });
    addAlliance(state, "aus", "nzl");
    expect(policyOptions(state, content, "aus")).toContainEqual(policy);
    expect(checkPolicy(state, content, "aegis", "aus", policy)).toEqual({ ok: true });
    enactPolicy(state, content, "aus", policy);
    const f = federationOf(state, "nzl")!;
    expect(f.leaderId).toBe("aus");
    expect(f.name).toBe("Republic of the Southern Cross");
    // A year's cooldown stands before they could unify.
    expect(state.diplomacy.cooldowns["aus|nzl"]).toBe(state.dayIndex + content.rules.diplomacy.federation.joinCooldownDays);
  });

  it("needs a faction running the government of a nation brought in", () => {
    const state = fresh();
    runBy(state, "aus");
    addAlliance(state, "aus", "nzl");
    expect(checkPolicy(state, content, "aegis", "aus", { kind: "federate", targetId: "nzl" })).toEqual({ ok: false, reason: "No faction runs the government of New Zealand" });
  });

  it("joins an existing federation through its lead nation, allying with every member", () => {
    const state = fresh();
    runBy(state, "mda");
    addAlliance(state, "mda", "rou");
    expect(checkPolicy(state, content, "aegis", "mda", { kind: "federate", targetId: "rou" })).toEqual({ ok: false, reason: "Apply to France, which leads the European Union" });
    expect(checkPolicy(state, content, "aegis", "mda", { kind: "federate", targetId: "fra" })).toEqual({ ok: true });
    enactPolicy(state, content, "mda", { kind: "federate", targetId: "fra" });
    expect(sameFederation(state, "mda", "deu")).toBe(true);
    expect(areAllies(state, "mda", "deu")).toBe(true);
  });

  it("lets the lead nation invite a nation it is allied with and claims", () => {
    const state = fresh();
    runBy(state, "fra");
    runBy(state, "gbr");
    expect(checkPolicy(state, content, "aegis", "deu", { kind: "federate", targetId: "gbr" }).ok).toBe(false);
    expect(checkPolicy(state, content, "aegis", "fra", { kind: "federate", targetId: "gbr" })).toEqual({ ok: true });
    enactPolicy(state, content, "fra", { kind: "federate", targetId: "gbr" });
    expect(federationOf(state, "gbr")!.name).toBe("European Union");
  });

  it("refuses rivals of a member", () => {
    const state = fresh();
    runBy(state, "fra");
    runBy(state, "gbr");
    state.diplomacy.rivalries["gbr|pol"] = 0;
    expect(checkPolicy(state, content, "aegis", "fra", { kind: "federate", targetId: "gbr" })).toEqual({ ok: false, reason: "Poland and United Kingdom are rivals" });
  });
});

describe("Leave Federation policy", () => {
  it("lets a member leave a democratic federation, at a cost in GDP and a long cooldown", () => {
    const state = fresh();
    runBy(state, "deu");
    expect(checkPolicy(state, content, "aegis", "fra", { kind: "leaveFederation" }).ok).toBe(false);
    expect(checkPolicy(state, content, "aegis", "deu", { kind: "leaveFederation" })).toEqual({ ok: true });
    const gdp = nation(state, "deu").gdp;
    enactPolicy(state, content, "deu", { kind: "leaveFederation" });
    expect(federationOf(state, "deu")).toBeUndefined();
    expect(nation(state, "deu").gdp).toBeCloseTo(gdp * (1 - content.rules.diplomacy.federation.leaveGdpLoss), 6);
    expect(areAllies(state, "deu", "fra")).toBe(true);
    expect(state.diplomacy.cooldowns["deu|fra"]).toBe(state.dayIndex + content.rules.diplomacy.federation.leaveCooldownDays);
  });

  it("can be vetoed by an authoritarian lead nation", () => {
    const state = fresh();
    runBy(state, "blr");
    nation(state, "rus").democracy = 2;
    enactPolicy(state, content, "blr", { kind: "leaveFederation" });
    expect(sameFederation(state, "blr", "rus")).toBe(true);
    runBy(state, "rus");
    enactPolicy(state, content, "blr", { kind: "leaveFederation" });
    expect(federationOf(state, "blr")).toBeUndefined();
  });

  it("disbands a federation left with one member and replaces a lost leader", () => {
    const state = fresh();
    removeFromFederation(state, content, "rus");
    expect(federationOf(state, "blr")!.leaderId).not.toBe("rus");
    for (const id of ["arm", "blr", "kaz"]) removeFromFederation(state, content, id);
    expect(federationOf(state, "kgz")).toBeUndefined();
    expect(state.federations.map((f) => f.name)).toEqual(["European Union"]);
  });
});

describe("leaving through a coup", () => {
  // Russia leads the Eurasian Union; Belarus leaves it after a coup.
  function defect(state: GameState): void {
    nation(state, "rus").democracy = 2;
    removeFromFederation(state, content, "blr");
  }

  it("lets an AI-run authoritarian leader go to war at once, with no cohesion penalty", () => {
    const state = fresh();
    runBy(state, "rus", "lumen");
    defect(state);
    const cohesion = nation(state, "rus").cohesion;
    expect(answerDefection(state, content, "blr", "rus", "Eurasian Union")).toMatch(/declared war on Belarus/);
    expect(atWar(state, "rus", "blr")).toBe(true);
    expect(areAllies(state, "rus", "blr")).toBe(false);
    expect(areAllies(state, "kaz", "blr")).toBe(false);
    expect(nation(state, "rus").cohesion).toBeGreaterThanOrEqual(cohesion);
  });

  it("gives a player-run leader a free war declaration for a while", () => {
    const state = fresh();
    runBy(state, "rus");
    defect(state);
    expect(answerDefection(state, content, "blr", "rus", "Eurasian Union")).toMatch(/may declare war/);
    expect(atWar(state, "rus", "blr")).toBe(false);
    const aegis = state.factions.find((f) => f.id === "aegis")!;
    aegis.resources.influence = 0;
    expect(checkDiplomacy(state, content, "aegis", "punishDefection", "rus", "blr")).toEqual({ ok: true });
    expect(checkDiplomacy(state, content, "aegis", "punishDefection", "rus", "kaz").ok).toBe(false);
    applyDiplomacy(state, content, "aegis", "punishDefection", "rus", "blr");
    expect(atWar(state, "rus", "blr")).toBe(true);
    expect(aegis.resources.influence).toBe(0);
    expect(state.defections).toEqual({});
  });

  it("lets the chance lapse", () => {
    const state = fresh();
    runBy(state, "rus");
    defect(state);
    answerDefection(state, content, "blr", "rus", "Eurasian Union");
    state.dayIndex += content.rules.diplomacy.federation.defectionWarDays;
    expireCooldowns(state);
    expect(checkDiplomacy(state, content, "aegis", "punishDefection", "rus", "blr").ok).toBe(false);
  });

  it("gives democratic leaders, and a faction that runs both, no such option", () => {
    const state = fresh();
    runBy(state, "rus", "lumen");
    removeFromFederation(state, content, "blr");
    nation(state, "rus").democracy = 6;
    expect(answerDefection(state, content, "blr", "rus", "Eurasian Union")).toBeNull();
    nation(state, "rus").democracy = 2;
    runBy(state, "blr", "lumen");
    expect(answerDefection(state, content, "blr", "rus", "Eurasian Union")).toBeNull();
  });
});

describe("saves", () => {
  it("gives version 20 saves an empty list of federations", () => {
    const state = fresh();
    const old = JSON.parse(serialize(state));
    old.version = 20;
    delete old.state.federations;
    expect(deserialize(JSON.stringify(old), content).federations).toEqual([]);
  });
});
