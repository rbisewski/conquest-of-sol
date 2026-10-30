import { describe, expect, it } from "vitest";
import { baseContent } from "../../content/index";
import {
  applyCommand,
  assessMission,
  availableMissions,
  effectiveAttributes,
  spendBonus,
  controlNationTarget,
  detExp,
  detLn,
  detPow,
  closeCouncilPhase,
  deserialize,
  serialize,
  startCouncilPhase,
  resolveAllScheduledMissions,
  rollChance,
  rollOutcome,
  monthlyInvestment,
  Simulation,
  startTurnIntel,
  type Councilor,
  type GameState,
  type Mission,
  payForMissions,
  regionOwner,
  transferRegion,
} from "../index";

const content = baseContent;
const rules = content.rules.missions;

/** A game whose first Aegis councilor is a trait-free Politician, who can run every mission tested here. */
function freshGame(): Simulation {
  const sim = Simulation.create(content, { seed: 11, difficulty: "normal", playerFactions: ["aegis"] });
  const councilor = sim.state.factions.find((f) => f.id === "aegis")!.councilors[0]!;
  councilor.professionId = "politician";
  councilor.traits = [];
  return sim;
}

/** Gives a faction the listed CPs in a nation, clearing everything else there. */
function setOwners(state: GameState, nationId: string, owners: (string | null)[]): void {
  const nation = state.nations.find((n) => n.id === nationId)!;
  nation.controlPoints.forEach((cp, i) => {
    cp.owner = owners[i] ?? null;
    cp.disabledUntil = 0;
    cp.defendedUntil = 0;
  });
}

/**
 * Assigns a mission to the player's first councilor and resolves the phase with the roll
 * forced to give the wanted result (half the success chance is a plain success).
 */
function runMission(sim: Simulation, mission: Mission, result: "success" | "critical" = "success"): void {
  const faction = sim.state.factions.find((f) => f.id === "aegis")!;
  const councilor = faction.councilors[0]!;
  for (const f of sim.state.factions) for (const c of f.councilors) c.mission = null;
  expect(applyCommand(sim.state, content, { type: "assignMission", factionId: "aegis", councilorId: councilor.id, mission })).toEqual({ ok: true });
  const a = assessMission(sim.state, content, "aegis", councilor, mission);
  const chance = a.ok && a.contested ? a.odds.chance : 1;
  for (const f of sim.state.factions) f.councilDone = true;
  closeCouncilPhase(sim.state, content);
  const real = sim.state.rng;
  sim.state.rng = stubRng(chance * (result === "critical" ? 0.05 : 0.5));
  resolveAllScheduledMissions(sim.state, content);
  sim.state.rng = real;
}

/** An RNG state whose next nextFloat() is `value` (sfc32 output = a + b + d with d counter). */
function stubRng(value: number): [number, number, number, number] {
  const target = Math.floor(value * 4294967296) >>> 0;
  return [target, 0, 0, 0];
}

describe("deterministic math", () => {
  it("matches Math within floating-point noise", () => {
    for (const x of [0.001, 0.5, 1, 2, 10, 12345.678]) expect(detLn(x)).toBeCloseTo(Math.log(x), 12);
    for (const y of [-20, -1, 0, 0.5, 3, 30]) expect(detExp(y) / Math.exp(y)).toBeCloseTo(1, 12);
    expect(detPow(39904, 0.18)).toBeCloseTo(Math.pow(39904, 0.18), 10);
    expect(detPow(27, 1 / 3)).toBeCloseTo(3, 12);
  });
});

describe("roll", () => {
  it("follows Terra Invicta's table", () => {
    expect(rollChance(rules, 0)).toBeCloseTo(0.5, 10);
    expect(rollChance(rules, 3)).toBeCloseTo(0.767, 3);
    expect(rollChance(rules, -5)).toBeCloseTo(0.14, 2);
    expect(rollChance(rules, 10)).toBeCloseTo(0.961, 3);
  });

  it("marks the best and worst tenth as critical", () => {
    expect(rollOutcome(rules, 0.8, 0.05)).toBe("criticalSuccess");
    expect(rollOutcome(rules, 0.8, 0.5)).toBe("success");
    expect(rollOutcome(rules, 0.8, 0.9)).toBe("failure");
    expect(rollOutcome(rules, 0.8, 0.99)).toBe("criticalFailure");
  });
});

describe("Control Nation", () => {
  it("takes the free CP furthest from the executive, and the executive only last", () => {
    const sim = freshGame();
    const usa = sim.state.nations.find((n) => n.id === "usa")!;
    setOwners(sim.state, "usa", []);
    expect(controlNationTarget(usa, "aegis")).toBe(usa.controlPoints.length - 1);
    setOwners(sim.state, "usa", [null, "lumen", "lumen", "lumen", "lumen", "lumen"]);
    expect(controlNationTarget(usa, "aegis")).toBeNull();
    setOwners(sim.state, "usa", [null, "aegis", "lumen", "lumen", "lumen", "lumen"]);
    expect(controlNationTarget(usa, "aegis")).toBe(0);
  });

  it("grants the CP on success", () => {
    const sim = freshGame();
    setOwners(sim.state, "nga", []);
    runMission(sim, { type: "controlNation", nationId: "nga" });
    const nga = sim.state.nations.find((n) => n.id === "nga")!;
    const a = nga.controlPoints.filter((cp) => cp.owner === "aegis").length;
    expect(a).toBe(1);
  });
});

describe("Crackdown and Purge", () => {
  it("crackdown disables the CP, strips its defense and weakens a later purge", () => {
    const sim = freshGame();
    setOwners(sim.state, "nga", [null, "choir", "choir"]);
    const nga = sim.state.nations.find((n) => n.id === "nga")!;
    nga.controlPoints[2]!.defendedUntil = 9999;
    const councilor = sim.state.factions.find((f) => f.id === "aegis")!.councilors[0]!;
    const before = assessMission(sim.state, content, "aegis", councilor, { type: "purge", nationId: "nga", cpIndex: 2 });

    runMission(sim, { type: "crackdown", nationId: "nga", cpIndex: 2 });
    expect(nga.controlPoints[2]!.disabledUntil).toBeGreaterThan(sim.state.dayIndex);
    expect(nga.controlPoints[2]!.defendedUntil).toBe(0);

    const after = assessMission(sim.state, content, "aegis", councilor, { type: "purge", nationId: "nga", cpIndex: 2 });
    expect(before.ok && before.contested && after.ok && after.contested).toBe(true);
    if (before.ok && before.contested && after.ok && after.contested) expect(after.odds.chance).toBeGreaterThan(before.odds.chance);
  });

  it("purge takes the CP from its owner", () => {
    const sim = freshGame();
    setOwners(sim.state, "nga", [null, "choir", "choir"]);
    runMission(sim, { type: "purge", nationId: "nga", cpIndex: 1 });
    const nga = sim.state.nations.find((n) => n.id === "nga")!;
    expect(nga.controlPoints[1]!.owner).toBe("aegis");
  });

  it("takes the Executive only for a faction already holding a CP there", () => {
    const sim = freshGame();
    const councilor = us(sim).councilors[0]!;
    const purgeExec = (nationId: string) => assessMission(sim.state, content, "aegis", councilor, { type: "purge", nationId, cpIndex: 0 });
    setOwners(sim.state, "nga", ["choir", "choir", "choir"]);
    expect(purgeExec("nga")).toEqual({ ok: false, reason: "We need a control point here before we can take the Executive" });
    setOwners(sim.state, "nga", ["choir", "choir", "aegis"]);
    expect(purgeExec("nga").ok).toBe(true);
    // A nation with a single CP has no other CP to hold first.
    const single = sim.state.nations.find((n) => n.controlPoints.length === 1)!;
    setOwners(sim.state, single.id, ["choir"]);
    expect(purgeExec(single.id).ok).toBe(true);
  });

  it("cannot target our own or an empty CP", () => {
    const sim = freshGame();
    setOwners(sim.state, "nga", [null, "aegis"]);
    const councilor = sim.state.factions.find((f) => f.id === "aegis")!.councilors[0]!;
    expect(assessMission(sim.state, content, "aegis", councilor, { type: "purge", nationId: "nga", cpIndex: 1 }).ok).toBe(false);
    expect(assessMission(sim.state, content, "aegis", councilor, { type: "crackdown", nationId: "nga", cpIndex: 0 }).ok).toBe(false);
  });
});

describe("Defend Interests", () => {
  it("costs influence and defends every working CP we hold there", () => {
    const sim = freshGame();
    setOwners(sim.state, "nga", [null, "aegis", "aegis"]);
    const faction = sim.state.factions.find((f) => f.id === "aegis")!;
    const influence = faction.resources.influence;
    runMission(sim, { type: "defendInterests", nationId: "nga" });
    const nga = sim.state.nations.find((n) => n.id === "nga")!;
    const days = rules.defendInterests.daysPerCp * 2 + rules.defendInterests.baseDays;
    expect(nga.controlPoints[1]!.defendedUntil - sim.state.dayIndex).toBe(days / 2);
    expect(nga.controlPoints[2]!.defendedUntil - sim.state.dayIndex).toBe(days / 2);
    expect(faction.resources.influence).toBe(influence - 16);
  });

  it("adds +10 defense against crackdowns", () => {
    const sim = freshGame();
    setOwners(sim.state, "nga", [null, "choir", "choir"]);
    const nga = sim.state.nations.find((n) => n.id === "nga")!;
    const councilor = sim.state.factions.find((f) => f.id === "aegis")!.councilors[0]!;
    const plain = assessMission(sim.state, content, "aegis", councilor, { type: "crackdown", nationId: "nga", cpIndex: 1 });
    nga.controlPoints[1]!.defendedUntil = sim.state.dayIndex + 100;
    const guarded = assessMission(sim.state, content, "aegis", councilor, { type: "crackdown", nationId: "nga", cpIndex: 1 });
    if (plain.ok && plain.contested && guarded.ok && guarded.contested) {
      expect(guarded.odds.defense.value - plain.odds.defense.value).toBeCloseTo(rules.defendBonus, 10);
    } else throw new Error("expected contested missions");
  });
});

describe("Coup d'État", () => {
  it("empties rival CPs and leaves the plotters with the CP furthest from the executive", () => {
    const sim = freshGame();
    const usa = sim.state.nations.find((n) => n.id === "usa")!;
    const n = usa.controlPoints.length;
    setOwners(sim.state, "usa", Array(n).fill("lumen"));
    runMission(sim, { type: "coup", nationId: "usa" });
    expect(usa.controlPoints[n - 1]!.owner).toBe("aegis");
    expect(usa.controlPoints.slice(0, n - 1).every((cp) => cp.owner === null)).toBe(true);
  });

  it("gives two CPs on a critical success", () => {
    const sim = freshGame();
    const usa = sim.state.nations.find((n) => n.id === "usa")!;
    const n = usa.controlPoints.length;
    setOwners(sim.state, "usa", Array(n).fill("lumen"));
    runMission(sim, { type: "coup", nationId: "usa" }, "critical");
    expect(usa.controlPoints.filter((cp) => cp.owner === "aegis").length).toBe(2);
  });

  it("is not available to the faction holding the executive", () => {
    const sim = freshGame();
    setOwners(sim.state, "nga", ["aegis"]);
    const councilor = sim.state.factions.find((f) => f.id === "aegis")!.councilors[0]!;
    expect(assessMission(sim.state, content, "aegis", councilor, { type: "coup", nationId: "nga" }).ok).toBe(false);
  });

  it("gets easier with unrest", () => {
    const sim = freshGame();
    const nga = sim.state.nations.find((n) => n.id === "nga")!;
    const councilor = sim.state.factions.find((f) => f.id === "aegis")!.councilors[0]!;
    nga.unrest = 1;
    const calm = assessMission(sim.state, content, "aegis", councilor, { type: "coup", nationId: "nga" });
    nga.unrest = 9;
    const restless = assessMission(sim.state, content, "aegis", councilor, { type: "coup", nationId: "nga" });
    if (calm.ok && calm.contested && restless.ok && restless.contested) expect(restless.odds.chance).toBeGreaterThan(calm.odds.chance);
    else throw new Error("expected contested missions");
  });
});

describe("Public Campaign", () => {
  it("raises our public opinion by Persuasion × 0.4% on success", () => {
    const sim = freshGame();
    const councilor = sim.state.factions.find((f) => f.id === "aegis")!.councilors[0]!;
    councilor.attributes.persuasion = 10;
    const nation = sim.state.nations.find((n) => n.id === "nga")!;
    const before = nation.publicOpinion["aegis"]!;
    const mission: Mission = { type: "publicCampaign", nationId: "nga" };
    runMission(sim, mission);
    expect(nation.publicOpinion["aegis"]! - before).toBeCloseTo(10 * content.rules.propaganda.opinionPerStrength, 6);
  });

  it("is harder in more populous nations", () => {
    const sim = freshGame();
    const councilor = sim.state.factions.find((f) => f.id === "aegis")!.councilors[0]!;
    const small = assessMission(sim.state, content, "aegis", councilor, { type: "publicCampaign", nationId: "dnk" });
    const large = assessMission(sim.state, content, "aegis", councilor, { type: "publicCampaign", nationId: "chn" });
    if (small.ok && small.contested && large.ok && large.contested) expect(large.odds.chance).toBeLessThan(small.odds.chance);
    else throw new Error("expected contested missions");
  });

  it("makes Control Nation more likely to succeed", () => {
    const sim = freshGame();
    const councilor = sim.state.factions.find((f) => f.id === "aegis")!.councilors[0]!;
    const mission: Mission = { type: "controlNation", nationId: "nga" };
    const before = assessMission(sim.state, content, "aegis", councilor, mission);
    runMission(sim, { type: "publicCampaign", nationId: "nga" });
    const after = assessMission(sim.state, content, "aegis", councilor, mission);
    if (before.ok && before.contested && after.ok && after.contested) expect(after.odds.chance).toBeGreaterThan(before.odds.chance);
    else throw new Error("expected contested missions");
  });
});

/** The first councilor of another faction, moved to Nigeria, with no traits. */
function enemyIn(sim: Simulation, nationId = "nga"): Councilor {
  const enemy = sim.state.factions.find((f) => f.id === "iron-dawn")!.councilors[0]!;
  enemy.locationId = nationId;
  enemy.traits = [];
  return enemy;
}

function us(sim: Simulation) {
  return sim.state.factions.find((f) => f.id === "aegis")!;
}

describe("Investigate Councilor", () => {
  it("needs the target located, then raises our intel by 25% + 0.5% × Investigation", () => {
    const sim = freshGame();
    us(sim).councilors[0]!.professionId = "inspector";
    const enemy = enemyIn(sim);
    const mission: Mission = { type: "investigateCouncilor", nationId: "nga", targetId: enemy.id };
    expect(assessMission(sim.state, content, "aegis", us(sim).councilors[0]!, mission).ok).toBe(false);
    us(sim).intel[enemy.id] = 0.1;
    const inv = us(sim).councilors[0]!.attributes.investigation;
    runMission(sim, mission);
    expect(us(sim).intel[enemy.id]).toBeCloseTo(0.1 + 0.25 + 0.005 * inv, 6);
  });
});

describe("Assassinate", () => {
  it("needs 25% intel and kills the target on success", () => {
    const sim = freshGame();
    us(sim).councilors[0]!.professionId = "commando";
    const enemy = enemyIn(sim);
    const mission: Mission = { type: "assassinate", nationId: "nga", targetId: enemy.id };
    us(sim).intel[enemy.id] = 0.1;
    expect(assessMission(sim.state, content, "aegis", us(sim).councilors[0]!, mission).ok).toBe(false);
    us(sim).intel[enemy.id] = 0.25;
    runMission(sim, mission);
    expect(sim.state.factions.some((f) => f.councilors.includes(enemy))).toBe(false);
  });

  it("is harder against a protected target", () => {
    const sim = freshGame();
    const assassin = us(sim).councilors[0]!;
    assassin.professionId = "commando";
    const enemy = enemyIn(sim);
    us(sim).intel[enemy.id] = 0.25;
    const mission: Mission = { type: "assassinate", nationId: "nga", targetId: enemy.id };
    const before = assessMission(sim.state, content, "aegis", assassin, mission);
    const guard = sim.state.factions.find((f) => f.id === "iron-dawn")!.councilors[1]!;
    sim.state.protections[enemy.id] = [guard.id];
    const after = assessMission(sim.state, content, "aegis", assassin, mission);
    if (before.ok && before.contested && after.ok && after.contested) expect(after.odds.chance).toBeLessThan(before.odds.chance);
    else throw new Error("expected contested missions");
  });
});

describe("Protect Target", () => {
  it("guards one of our councilors until the next council phase", () => {
    const sim = freshGame();
    const [guard, ward] = us(sim).councilors;
    guard!.professionId = "officer";
    runMission(sim, { type: "protectTarget", nationId: ward!.locationId, targetId: ward!.id });
    expect(sim.state.protections[ward!.id]).toEqual([guard!.id]);
    expect(guard!.locationId).toBe(ward!.locationId);
  });

  it("can't target the protector themselves", () => {
    const sim = freshGame();
    const guard = us(sim).councilors[0]!;
    guard.professionId = "officer";
    const a = assessMission(sim.state, content, us(sim).id, guard, { type: "protectTarget", nationId: guard.locationId, targetId: guard.id });
    expect(a.ok).toBe(false);
  });
});

describe("Inspire", () => {
  function inspireGame() {
    const sim = freshGame();
    const [speaker, ward] = us(sim).councilors;
    speaker!.professionId = "activist";
    ward!.attributes.loyalty = 10;
    ward!.apparentLoyalty = 10;
    return { sim, speaker: speaker!, ward: ward! };
  }

  it("is Persuasion and influence spent against a difficulty of 8", () => {
    const { sim, speaker, ward } = inspireGame();
    const a = assessMission(sim.state, content, "aegis", speaker, { type: "inspire", nationId: ward.locationId, targetId: ward.id, spend: 4 });
    expect(a.ok && a.contested).toBe(true);
    if (!a.ok || !a.contested) return;
    expect(a.odds.attack.value).toBeCloseTo(effectiveAttributes(content, speaker).persuasion + spendBonus(content, 4), 9);
    expect(a.odds.defense.value).toBe(8);
  });

  it("raises the target's Loyalty by 1–3 and Apparent Loyalty by 2 on a success", () => {
    const { sim, ward } = inspireGame();
    runMission(sim, { type: "inspire", nationId: ward.locationId, targetId: ward.id });
    expect(ward.attributes.loyalty).toBeGreaterThanOrEqual(11);
    expect(ward.attributes.loyalty).toBeLessThanOrEqual(13);
    expect(ward.apparentLoyalty).toBe(12);
  });

  it("raises them by 2–4 and 3 on a critical success", () => {
    const { sim, ward } = inspireGame();
    runMission(sim, { type: "inspire", nationId: ward.locationId, targetId: ward.id }, "critical");
    expect(ward.attributes.loyalty).toBeGreaterThanOrEqual(12);
    expect(ward.attributes.loyalty).toBeLessThanOrEqual(14);
    expect(ward.apparentLoyalty).toBe(13);
  });

  it("only targets another of our free councilors", () => {
    const { sim, speaker, ward } = inspireGame();
    const check = (targetId: string, nationId: string) => assessMission(sim.state, content, "aegis", speaker, { type: "inspire", nationId, targetId }).ok;
    expect(check(speaker.id, speaker.locationId)).toBe(false);
    const enemy = sim.state.factions.find((f) => f.id !== "aegis")!.councilors[0]!;
    expect(check(enemy.id, enemy.locationId)).toBe(false);
    ward.detainedPhases = 1;
    expect(check(ward.id, ward.locationId)).toBe(false);
  });

  it("comes from professions, traits and orgs, and is blocked by some traits", () => {
    const { speaker } = inspireGame();
    expect(availableMissions(content, speaker).has("inspire")).toBe(true);
    speaker.traits = ["paranoid"];
    expect(availableMissions(content, speaker).has("inspire")).toBe(false);
    speaker.professionId = "politician";
    speaker.traits = ["national-hero"];
    expect(availableMissions(content, speaker).has("inspire")).toBe(true);
    speaker.traits = ["government"];
    speaker.orgs = ["unesco"];
    speaker.attributes.administration = 25;
    expect(availableMissions(content, speaker).has("inspire")).toBe(true);
  });
});

describe("Stabilize Nation", () => {
  it("lowers unrest on success", () => {
    const sim = freshGame();
    us(sim).councilors[0]!.professionId = "officer";
    const nation = sim.state.nations.find((n) => n.id === "nga")!;
    nation.unrest = 6;
    runMission(sim, { type: "stabilizeNation", nationId: "nga" });
    expect(nation.unrest).toBeCloseTo(5, 6);
  });
});

describe("spending resources on missions", () => {
  const assign = (sim: Simulation, mission: Mission, councilorIndex = 0) =>
    applyCommand(sim.state, content, { type: "assignMission", factionId: "aegis", councilorId: us(sim).councilors[councilorIndex]!.id, mission });

  it("adds log2(1 + spent) to the attack", () => {
    const sim = freshGame();
    const councilor = us(sim).councilors[0]!;
    const plain = assessMission(sim.state, content, "aegis", councilor, { type: "controlNation", nationId: "nga" });
    const boosted = assessMission(sim.state, content, "aegis", councilor, { type: "controlNation", nationId: "nga", spend: 16 });
    if (!(plain.ok && plain.contested && boosted.ok && boosted.contested)) throw new Error("expected contested missions");
    expect(boosted.odds.attack.value - plain.odds.attack.value).toBeCloseTo(Math.log2(17), 6);
    expect(boosted.odds.chance).toBeGreaterThan(plain.odds.chance);
    expect(boosted.odds.attack.terms.at(-1)!.label).toBe("Resources spent (16 influence)");
  });

  it("only takes the slider's steps, on missions that allow spending", () => {
    const sim = freshGame();
    us(sim).resources.influence = 100;
    expect(assign(sim, { type: "controlNation", nationId: "nga", spend: 3 }).ok).toBe(false);
    expect(assign(sim, { type: "advise", nationId: "nga", spend: 4 }).ok).toBe(false);
    expect(assign(sim, { type: "controlNation", nationId: "nga", spend: 64 }).ok).toBe(true);
  });

  it("can't commit more than the faction has across its councilors", () => {
    const sim = freshGame();
    us(sim).councilors[1]!.professionId = "politician";
    us(sim).resources.influence = 20;
    expect(assign(sim, { type: "controlNation", nationId: "nga", spend: 16 }, 0).ok).toBe(true);
    expect(assign(sim, { type: "controlNation", nationId: "nga", spend: 8 }, 1)).toEqual({ ok: false, reason: "Needs 8 influence" });
    expect(assign(sim, { type: "controlNation", nationId: "nga", spend: 4 }, 1).ok).toBe(true);
    // Re-assigning a councilor doesn't count their old mission against them.
    expect(assign(sim, { type: "controlNation", nationId: "nga", spend: 16 }, 0).ok).toBe(true);
  });

  it("pays when the council phase closes, whatever the outcome", () => {
    const sim = freshGame();
    us(sim).resources.money = 10;
    runMission(sim, { type: "publicCampaign", nationId: "nga", spend: 8 });
    expect(us(sim).resources.money).toBe(2);
  });

  it("lowers a spend the faction can no longer afford when the phase closes", () => {
    const sim = freshGame();
    for (const f of sim.state.factions) for (const c of f.councilors) c.mission = null;
    us(sim).resources.influence = 40;
    expect(assign(sim, { type: "controlNation", nationId: "nga", spend: 32 }).ok).toBe(true);
    us(sim).resources.influence = 20;
    payForMissions(sim.state, content, us(sim));
    expect(us(sim).councilors[0]!.mission?.spend).toBe(16);
    expect(us(sim).resources.influence).toBe(4);
  });
});

describe("Advise", () => {
  it("costs 8 influence and raises the nation's IP by Administration %", () => {
    const sim = freshGame();
    const advisor = us(sim).councilors[0]!;
    const nation = sim.state.nations.find((n) => n.id === "nga")!;
    const ip = monthlyInvestment(sim.state, content, nation).value;
    us(sim).resources.influence = 50;
    runMission(sim, { type: "advise", nationId: "nga" });
    expect(us(sim).resources.influence).toBe(42);
    expect(monthlyInvestment(sim.state, content, nation).value).toBeCloseTo(ip * (1 + advisor.attributes.administration / 100), 6);
  });
});

describe("intel", () => {
  it("fades each council phase unless we aimed a mission at the councilor", () => {
    const sim = freshGame();
    const enemy = enemyIn(sim);
    const other = sim.state.factions.find((f) => f.id === "iron-dawn")!.councilors[1]!;
    us(sim).intel[enemy.id] = 0.3;
    us(sim).intel[other.id] = 0.02;
    sim.state.recentTargets = { aegis: [enemy.id] };
    startTurnIntel(sim.state, content);
    expect(us(sim).intel[enemy.id]).toBe(0.3);
    expect(us(sim).intel[other.id]).toBeUndefined();
    startTurnIntel(sim.state, content);
    expect(us(sim).intel[enemy.id]).toBeCloseTo(0.3 - content.rules.missions.intelDecay, 6);
  });
});

describe("Surveil Location and Go To Ground", () => {
  const lagos = content.regions.find((r) => r.nationId === "nga")!.id;

  it("are open to every profession", () => {
    const sim = freshGame();
    const c = us(sim).councilors[0]!;
    for (const p of content.professions) {
      c.professionId = p.id;
      expect(assessMission(sim.state, content, "aegis", c, { type: "surveilLocation", nationId: "nga", regionId: lagos }).ok).toBe(true);
      expect(assessMission(sim.state, content, "aegis", c, { type: "goToGround", nationId: "nga", regionId: lagos }).ok).toBe(true);
    }
  });

  it("need a region of the nation", () => {
    const sim = freshGame();
    const c = us(sim).councilors[0]!;
    const elsewhere = content.regions.find((r) => r.nationId === "gha")!.id;
    expect(assessMission(sim.state, content, "aegis", c, { type: "surveilLocation", nationId: "nga", regionId: elsewhere }).ok).toBe(false);
  });

  it("Surveil Location marks the region as watched until the next council phase", () => {
    const sim = freshGame();
    runMission(sim, { type: "surveilLocation", nationId: "nga", regionId: lagos });
    expect(sim.state.surveillance[lagos]).toEqual(["aegis"]);
    startTurnIntel(sim.state, content);
    expect(sim.state.surveillance).toEqual({});
  });

  it("Go To Ground hides the councilor, forgets who spotted them and can wipe enemy intel", () => {
    const sim = freshGame();
    const c = us(sim).councilors[0]!;
    c.spottedBy = ["iron-dawn"];
    c.attributes.espionage = 25;
    c.traits = [];
    const enemy = sim.state.factions.find((f) => f.id === "iron-dawn")!;
    enemy.intel[c.id] = 0.6;
    runMission(sim, { type: "goToGround", nationId: c.locationId, regionId: content.regions.find((r) => r.nationId === c.locationId)!.id });
    expect(sim.state.hidden).toEqual([c.id]);
    expect(c.spottedBy).toEqual([]);
    // 50% + 3% × 25 Espionage: certain.
    expect(enemy.intel[c.id]).toBeUndefined();
    enemy.intel[c.id] = 0.6;
    const hunter = enemy.councilors[0]!;
    hunter.professionId = "commando";
    expect(assessMission(sim.state, content, "iron-dawn", hunter, { type: "assassinate", nationId: c.locationId, targetId: c.id }).ok).toBe(false);
  });
});

describe("councilor regions", () => {
  it("move a councilor to the mission's region: a chosen region, or the capital region of another nation", () => {
    const sim = freshGame();
    const c = us(sim).councilors[0]!;
    const region = content.regions.filter((r) => r.nationId === "nga").find((r) => !r.capital)!;
    runMission(sim, { type: "surveilLocation", nationId: "nga", regionId: region.id });
    expect([c.locationId, c.regionId]).toEqual(["nga", region.id]);
    const again = (mission: Mission) => {
      sim.state.phase = "council";
      for (const f of sim.state.factions) f.councilDone = false;
      runMission(sim, mission);
    };
    // Already in Nigeria: a nation mission there keeps them in their region.
    again({ type: "publicCampaign", nationId: "nga" });
    expect(c.regionId).toBe(region.id);
    again({ type: "publicCampaign", nationId: "gha" });
    expect(c.regionId).toBe(content.regions.find((r) => r.nationId === "gha" && r.capital)!.id);
  });
});

describe("Increase Unrest", () => {
  /** The first Aegis councilor as an Activist, who can run Increase Unrest. */
  function agitator(sim: Simulation): Councilor {
    const councilor = sim.state.factions.find((f) => f.id === "aegis")!.councilors[0]!;
    councilor.professionId = "activist";
    return councilor;
  }

  it("raises the nation's unrest and records who raised it", () => {
    const sim = freshGame();
    agitator(sim);
    const nga = sim.state.nations.find((n) => n.id === "nga")!;
    nga.unrest = 2;
    runMission(sim, { type: "increaseUnrest", nationId: "nga", regionId: "nga-1" });
    expect(nga.unrest).toBeCloseTo(2 + rules.increaseUnrest.unrestIncrease, 6);
    expect(sim.state.unrestRaised["nga"]?.["aegis"]).toBe(1);
  });

  it("can bring a fallen nation back in its home region, under the agitator's faction", () => {
    const sim = freshGame();
    agitator(sim);
    const s = sim.state;
    transferRegion(s, content, "mda-1", "rou");
    Object.assign(s.nations.find((n) => n.id === "rou")!, { unrest: 6, cohesion: 3 });
    runMission(sim, { type: "increaseUnrest", nationId: "rou", regionId: "mda-1" }, "critical");
    const mda = s.nations.find((n) => n.id === "mda")!;
    expect(regionOwner(s, "mda-1")).toBe("mda");
    expect(mda.controlPoints.every((cp) => cp.owner === "aegis")).toBe(true);
    expect(s.breakaways["mda"]).toBe("rou");
  });
});

describe("auto-repeat", () => {
  const nextPhase = (sim: Simulation) => {
    closeCouncilPhase(sim.state, content);
    resolveAllScheduledMissions(sim.state, content);
    startCouncilPhase(sim.state, content);
  };
  const aegis = (sim: Simulation) => sim.state.factions.find((f) => f.id === "aegis")!;
  const assign = (sim: Simulation, mission: Mission | null) =>
    applyCommand(sim.state, content, { type: "assignMission", factionId: "aegis", councilorId: aegis(sim).councilors[0]!.id, mission });
  const repeat = (sim: Simulation, on: boolean) =>
    applyCommand(sim.state, content, { type: "setMissionRepeat", factionId: "aegis", councilorId: aegis(sim).councilors[0]!.id, repeat: on });
  const advise: Mission = { type: "advise", nationId: "nga" };

  it("gives version 27 saves councilors with nothing to repeat", () => {
    const old = JSON.parse(serialize(freshGame().state));
    old.version = 27;
    for (const f of old.state.factions) for (const c of f.councilors) delete c.repeatMission;
    const state = deserialize(JSON.stringify(old), content);
    expect(state.factions[0]!.councilors[0]!.repeatMission).toBeNull();
  });

  it("needs a mission to repeat", () => {
    expect(repeat(freshGame(), true).ok).toBe(false);
  });

  it("takes the mission up again at the next council phases, until turned off", () => {
    const sim = freshGame();
    expect(assign(sim, advise).ok).toBe(true);
    expect(repeat(sim, true).ok).toBe(true);
    nextPhase(sim);
    expect(aegis(sim).councilors[0]!.mission).toEqual(advise);
    nextPhase(sim);
    expect(aegis(sim).councilors[0]!.mission).toEqual(advise);
    repeat(sim, false);
    nextPhase(sim);
    expect(aegis(sim).councilors[0]!.mission).toBeNull();
  });

  it("follows a new mission, and stops when the mission is cancelled", () => {
    const sim = freshGame();
    assign(sim, advise);
    repeat(sim, true);
    const other: Mission = { type: "publicCampaign", nationId: "nga" };
    assign(sim, other);
    expect(aegis(sim).councilors[0]!.repeatMission).toEqual(other);
    assign(sim, null);
    expect(aegis(sim).councilors[0]!.repeatMission).toBeNull();
  });

  it("lowers the spend to what can be afforded, and skips a phase it can't pay for", () => {
    const sim = freshGame();
    const faction = aegis(sim);
    const councilor = faction.councilors[0]!;
    faction.resources.influence = 1000;
    assign(sim, { type: "controlNation", nationId: "nga", spend: 64 });
    repeat(sim, true);
    councilor.mission = null;
    faction.resources.influence = 20;
    startCouncilPhase(sim.state, content);
    const repeated = aegis(sim).councilors[0]!.mission;
    const spend = repeated?.spend ?? 0;
    expect(repeated?.type).toBe("controlNation");
    expect(spend).toBeLessThanOrEqual(20);
    expect(spend).toBeGreaterThan(0);
    expect(councilor.repeatMission?.spend).toBe(64);
  });

  it("waits out detention, and ends the repeat when the mission is no longer possible", () => {
    const sim = freshGame();
    const councilor = aegis(sim).councilors[0]!;
    assign(sim, { type: "controlNation", nationId: "nga" });
    repeat(sim, true);
    councilor.detainedPhases = 2;
    startCouncilPhase(sim.state, content);
    expect(councilor.mission).toBeNull();
    expect(councilor.repeatMission).not.toBeNull();
    councilor.detainedPhases = 0;
    setOwners(sim.state, "nga", sim.state.nations.find((n) => n.id === "nga")!.controlPoints.map(() => "aegis"));
    startCouncilPhase(sim.state, content);
    expect(councilor.mission).toBeNull();
    expect(councilor.repeatMission).toBeNull();
    expect(sim.state.log.some((l) => l.text.includes("stopped repeating"))).toBe(true);
  });
});
