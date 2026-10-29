import { describe, expect, it } from "vitest";
import { baseContent } from "../../content/index";
import {
  areAllies,
  areRivals,
  atWar,
  checkAnnex,
  checkBreakaways,
  checkPolicy,
  checkSecessions,
  conquer,
  createFederation,
  deserialize,
  enactPolicy,
  hasClaim,
  hostileClaim,
  hostileShare,
  integrate,
  isExtant,
  nationNeighbors,
  nationRegions,
  nationState,
  policyOptions,
  raiseArmy,
  regionOwner,
  removeFromFederation,
  runMilitaryTick,
  serialize,
  seizeExecutive,
  Simulation,
  startAnnex,
  transferRegion,
  unrestTarget,
  type GameState,
} from "../index";

const content = baseContent;
const fresh = () => Simulation.create(content, { seed: 5, difficulty: "normal", playerFactions: ["aegis"] }).state;
const nation = (state: GameState, id: string) => nationState(state, id);

/** Aegis runs the nation outright: every CP, the executive included. */
function runBy(state: GameState, id: string, faction = "aegis"): void {
  for (const cp of nation(state, id).controlPoints) cp.owner = faction;
  // Held long enough to be consolidated.
  seizeExecutive(state, nation(state, id));
}

function war(state: GameState, attacker: string, defender: string): void {
  state.wars.push({ id: `w-${attacker}-${defender}`, attackers: [attacker], defenders: [defender], startDay: 0 });
}

describe("regions changing hands", () => {
  it("moves the region's share of population, GDP and Funding, and redraws neighbours", () => {
    const state = fresh();
    const rus = nation(state, "rus");
    const ukr = nation(state, "ukr");
    const before = { rus: { ...rus }, ukr: { ...ukr } };
    const share = transferRegion(state, content, "rus-5", "ukr");
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(1);
    expect(regionOwner(state, "rus-5")).toBe("ukr");
    expect(rus.population).toBeCloseTo(before.rus.population * (1 - share), 6);
    expect(ukr.population).toBeCloseTo(before.ukr.population + before.rus.population * share, 6);
    expect(ukr.gdp + rus.gdp).toBeCloseTo(before.ukr.gdp + before.rus.gdp, 6);
    expect(ukr.annualFunding + rus.annualFunding).toBeCloseTo(before.ukr.annualFunding + before.rus.annualFunding, 6);
    expect(nationRegions(state, content, "ukr").map((r) => r.id)).toContain("rus-5");
    // Dagestan borders Azerbaijan, so Ukraine now does too.
    expect(nationNeighbors(state, content, "ukr")).toContain("aze");
  });

  it("moves the capital to the largest region left, and a nation with no regions ceases to exist", () => {
    const state = fresh();
    transferRegion(state, content, "deu-1", "pol");
    const deu = nation(state, "deu");
    expect(deu.capitalId).not.toBe("deu-1");
    expect(deu.capitalId).not.toBeNull();
    for (const r of [...nationRegions(state, content, "deu")]) transferRegion(state, content, r.id, "pol");
    expect(isExtant(deu)).toBe(false);
    expect(deu.controlPoints).toHaveLength(0);
    expect(deu.population).toBe(0);
    expect(state.armies.some((a) => a.nationId === "deu")).toBe(false);
    expect(state.diplomacy.alliances.some((k) => k.split("|").includes("deu"))).toBe(false);
  });
});

describe("Demand Territory", () => {
  it("takes a peacefully claimed region from a nation at peace, then puts the pair on cooldown", () => {
    const state = fresh();
    runBy(state, "fra");
    nation(state, "fra").democracy = nation(state, "deu").democracy;
    const policy = { kind: "demandTerritory", regionId: "deu-2" } as const;
    expect(policyOptions(state, content, "fra")).toContainEqual(policy);
    expect(checkPolicy(state, content, "aegis", "fra", policy)).toEqual({ ok: true });
    enactPolicy(state, content, "fra", policy);
    expect(regionOwner(state, "deu-2")).toBe("fra");
    expect(checkPolicy(state, content, "aegis", "fra", { kind: "demandTerritory", regionId: "deu-3" })).toEqual({ ok: false, reason: "Diplomatic cooldown" });
  });

  it("can't take a capital, a hostile claim, or from a nation at war", () => {
    const state = fresh();
    runBy(state, "fra");
    nation(state, "fra").democracy = nation(state, "deu").democracy;
    expect(checkPolicy(state, content, "aegis", "fra", { kind: "demandTerritory", regionId: "deu-1" }).ok).toBe(false);
    nation(state, "deu").democracy = nation(state, "fra").democracy + 2;
    expect(hostileClaim(state, content, "fra", "deu-2")).toBe(true);
    expect(checkPolicy(state, content, "aegis", "fra", { kind: "demandTerritory", regionId: "deu-2" }).ok).toBe(false);
    nation(state, "deu").democracy = nation(state, "fra").democracy;
    war(state, "deu", "pol");
    expect(checkPolicy(state, content, "aegis", "fra", { kind: "demandTerritory", regionId: "deu-2" })).toEqual({ ok: false, reason: "Germany is at war" });
  });
});

describe("Peaceful Unification", () => {
  it("absorbs a nation the faction runs outright, with its regions, armies and claims", () => {
    const state = fresh();
    runBy(state, "rou");
    expect(checkPolicy(state, content, "aegis", "rou", { kind: "unify", targetId: "mda" }).ok).toBe(false);
    runBy(state, "mda");
    nation(state, "rou").democracy = nation(state, "mda").democracy;
    expect(checkPolicy(state, content, "aegis", "rou", { kind: "unify", targetId: "mda" })).toEqual({ ok: false, reason: "Romania and Moldova must be in the same federation" });
    removeFromFederation(state, content, "rou");
    createFederation(state, content, ["rou", "mda"]);
    const armies = state.armies.filter((a) => a.nationId === "mda").length;
    const people = nation(state, "rou").population + nation(state, "mda").population;
    expect(checkPolicy(state, content, "aegis", "rou", { kind: "unify", targetId: "mda" })).toEqual({ ok: true });
    enactPolicy(state, content, "rou", { kind: "unify", targetId: "mda" });
    expect(isExtant(nation(state, "mda"))).toBe(false);
    expect(regionOwner(state, "mda-1")).toBe("rou");
    expect(nation(state, "rou").population).toBeCloseTo(people, 6);
    expect(state.armies.filter((a) => a.nationId === "rou").length).toBeGreaterThanOrEqual(armies);
    // Moldova's claim on its own region now belongs to Romania too.
    expect(state.gainedClaims.some((c) => c.nation === "rou" && c.region === "mda-1") || hasClaim(state, content, "rou", "mda-1")).toBe(true);
  });
});

describe("War Conquest", () => {
  it("gives the victors the regions they claim; a nation left with none is absorbed", () => {
    const state = fresh();
    war(state, "srb", "xkx");
    state.occupation["xkx-1"] = { srb: 1 };
    conquer(state, content, nation(state, "xkx"));
    expect(regionOwner(state, "xkx-1")).toBe("srb");
    expect(isExtant(nation(state, "xkx"))).toBe(false);
    expect(atWar(state, "srb", "xkx")).toBe(false);
    // Serbia's claim on Kosovo is hostile: the region stays hostile, adding unrest.
    expect(hostileClaim(state, content, "srb", "xkx-1")).toBe(true);
    expect(hostileShare(state, content, nation(state, "srb"))).toBeGreaterThan(0);
    expect(unrestTarget(state, content, nation(state, "srb")).terms.some((t) => t.label === "Hostile regions")).toBe(true);
  });

  it("leaves the unclaimed regions under a new government", () => {
    const state = fresh();
    state.gainedClaims.push({ nation: "pol", region: "deu-2" });
    war(state, "pol", "deu");
    state.occupation["deu-1"] = { pol: 1 };
    runBy(state, "pol", "iron-dawn");
    conquer(state, content, nation(state, "deu"));
    expect(regionOwner(state, "deu-2")).toBe("pol");
    expect(regionOwner(state, "deu-1")).toBe("deu");
    expect(nation(state, "deu").controlPoints.every((cp) => cp.owner === "iron-dawn")).toBe(true);
    expect(areAllies(state, "pol", "deu")).toBe(true);
  });
});

describe("Annex Region", () => {
  /** Poland at war with Germany, with a fresh army in a Nordrhein-Westfalen it fully occupies. */
  function polandInGermany(claim: boolean) {
    const state = fresh();
    if (claim) state.gainedClaims.push({ nation: "pol", region: "deu-2" });
    state.armies = state.armies.filter((a) => a.nationId !== "deu");
    war(state, "pol", "deu");
    nation(state, "pol").militaryFounded = true;
    const army = raiseArmy(state, content, "pol");
    army.regionId = "deu-2";
    state.occupation["deu-2"] = { pol: 1 };
    return { state, army };
  }

  it("needs a claim, full occupation and a healthy army, and takes the region when done", () => {
    const { state, army } = polandInGermany(true);
    army.health = 0.5;
    expect(checkAnnex(state, content, army).ok).toBe(false);
    army.health = 1;
    const check = checkAnnex(state, content, army);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.days).toBeGreaterThan(0);
    startAnnex(state, army, check.days);
    state.dayIndex = army.annex!.doneDay;
    runMilitaryTick(state, content);
    expect(regionOwner(state, "deu-2")).toBe("pol");
  });

  it("is refused without a claim, and in the enemy capital", () => {
    const { state, army } = polandInGermany(false);
    expect(checkAnnex(state, content, army)).toEqual({ ok: false, reason: "Poland has no claim on Nordrhein-Westfalen" });
    army.regionId = "deu-1";
    state.occupation["deu-1"] = { pol: 1 };
    expect(checkAnnex(state, content, army).ok).toBe(false);
  });

  it("restores a nation that no longer exists, as an ally at war on our side", () => {
    const state = fresh();
    transferRegion(state, content, "mda-1", "rou");
    expect(isExtant(nation(state, "mda"))).toBe(false);
    war(state, "ukr", "rou");
    nation(state, "ukr").militaryFounded = true;
    state.armies = state.armies.filter((a) => a.nationId !== "rou");
    const army = raiseArmy(state, content, "ukr");
    army.regionId = "mda-1";
    state.occupation["mda-1"] = { ukr: 1 };
    const check = checkAnnex(state, content, army);
    expect(check).toMatchObject({ ok: true, restores: "mda" });
    startAnnex(state, army, 1);
    state.dayIndex = army.annex!.doneDay;
    runMilitaryTick(state, content);
    expect(regionOwner(state, "mda-1")).toBe("mda");
    expect(areAllies(state, "mda", "ukr")).toBe(true);
    expect(state.breakaways["mda"]).toBe("rou");
    expect(atWar(state, "mda", "rou")).toBe(true);
  });
});

describe("independence and secession", () => {
  it("grants independence to a nation that no longer exists, in its home capital", () => {
    const state = fresh();
    transferRegion(state, content, "mda-1", "rou");
    runBy(state, "rou");
    const policy = { kind: "grantIndependence", targetId: "mda" } as const;
    expect(policyOptions(state, content, "rou")).toContainEqual(policy);
    expect(checkPolicy(state, content, "aegis", "rou", policy)).toEqual({ ok: true });
    enactPolicy(state, content, "rou", policy);
    expect(regionOwner(state, "mda-1")).toBe("mda");
    expect(nation(state, "mda").capitalId).toBe("mda-1");
    expect(areAllies(state, "mda", "rou")).toBe(true);
  });

  it("lets a breakaway declare independence, and its parent go to war over it", () => {
    const state = fresh();
    state.breakaways["mda"] = "rou";
    runBy(state, "mda");
    expect(checkPolicy(state, content, "aegis", "mda", { kind: "declareIndependence" })).toEqual({ ok: true });
    enactPolicy(state, content, "mda", { kind: "declareIndependence" });
    expect(state.breakaways["mda"]).toBeUndefined();
    expect(atWar(state, "rou", "mda")).toBe(true);
  });

  it("lets a fallen nation break away from an unstable holder", () => {
    const state = fresh();
    transferRegion(state, content, "mda-1", "rou");
    Object.assign(nation(state, "rou"), { cohesion: 0, unrest: 10, democracy: 0 });
    for (let day = 0; day < 20000 && !isExtant(nation(state, "mda")); day++) {
      Object.assign(nation(state, "rou"), { cohesion: 0, unrest: 10 });
      checkBreakaways(state, content);
    }
    expect(regionOwner(state, "mda-1")).toBe("mda");
    expect(state.breakaways["mda"]).toBe("rou");
    expect(areRivals(state, "mda", "rou")).toBe(true);
  });

  it("lets regions of an unstable nation secede to a neighbour that peacefully claims them", () => {
    const state = fresh();
    state.diplomacy.alliances = state.diplomacy.alliances.filter((k) => !(k.includes("fra") && k.includes("deu")));
    nation(state, "fra").democracy = 10;
    for (let day = 0; day < 20000 && regionOwner(state, "deu-2") === "deu"; day++) {
      Object.assign(nation(state, "deu"), { cohesion: 0, unrest: 10, democracy: 0 });
      state.dayIndex = day * 4;
      checkSecessions(state, content);
    }
    expect(regionOwner(state, "deu-2")).not.toBe("deu");
  });

  it("reconciles a hostile region after enough Government and Unity completions", () => {
    const state = fresh();
    transferRegion(state, content, "xkx-1", "srb");
    state.claimStatus["srb|xkx-1"] = "hostile";
    const srb = nation(state, "srb");
    srb.integration = content.rules.claims.integration - 1;
    expect(integrate(state, content, srb)).toBe("Lipljan");
    expect(hostileClaim(state, content, "srb", "xkx-1")).toBe(false);
    expect(srb.integration).toBe(0);
  });
});

describe("saves", () => {
  it("refuses saves made before the breakaway nations changed the map", () => {
    const old = JSON.parse(serialize(fresh()));
    old.version = 19;
    expect(() => deserialize(JSON.stringify(old), content)).toThrow(/map/);
  });
});
