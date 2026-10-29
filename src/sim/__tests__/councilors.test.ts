import { describe, expect, it } from "vitest";
import { baseContent } from "../../content/index";
import {
  ATTRIBUTES,
  applyCommand,
  assessMission,
  availableMissions,
  deserialize,
  effectiveAttributes,
  generateCouncilor,
  professionDef,
  orgDef,
  refreshOrgMarkets,
  serialize,
  Simulation,
  type Councilor,
  type GameState,
} from "../index";

const content = baseContent;

function setup(): { state: GameState; councilor: Councilor } {
  const sim = Simulation.create(content, { seed: 21, difficulty: "normal", playerFactions: ["aegis"] });
  const councilor = sim.state.factions.find((f) => f.id === "aegis")!.councilors[0]!;
  councilor.professionId = "executive";
  councilor.traits = [];
  councilor.orgs = [];
  return { state: sim.state, councilor };
}

const cmd = (state: GameState, c: Councilor, extra: Record<string, unknown>) =>
  applyCommand(state, content, { factionId: "aegis", councilorId: c.id, ...extra } as Parameters<typeof applyCommand>[2]);

describe("missions by profession", () => {
  it("limits a councilor to their profession's missions, plus the ones everyone has", () => {
    const { councilor } = setup();
    expect([...availableMissions(content, councilor)].sort()).toEqual(["advise", "controlNation", "crackdown", "defendInterests", "goToGround", "purge", "setPolicy", "surveilLocation"]);
  });

  it("lets traits grant and forbid missions", () => {
    const { state, councilor } = setup();
    councilor.traits = ["puppet-master"];
    councilor.professionId = "journalist";
    expect(availableMissions(content, councilor).has("controlNation")).toBe(true);
    councilor.traits = ["awkward-genius"];
    expect(availableMissions(content, councilor).has("publicCampaign")).toBe(false);
    expect(assessMission(state, content, "aegis", councilor, { type: "publicCampaign", nationId: "nga" }).ok).toBe(false);
  });
});

describe("professions", () => {
  it("each has missions and orgs it can hold", () => {
    expect(content.professions).toHaveLength(25);
    for (const p of content.professions) {
      expect(p.missions.length, p.id).toBeGreaterThan(0);
      expect(content.orgs.filter((o) => o.professions?.includes(p.id)).length, p.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("rolls Terra Invicta's attribute ranges, with its profession odds", () => {
    const { state } = setup();
    const counts = new Map<string, number>();
    for (let i = 0; i < 2000; i++) {
      const c = generateCouncilor(state, content);
      counts.set(c.professionId, (counts.get(c.professionId) ?? 0) + 1);
      const p = professionDef(content, c.professionId);
      for (const attr of ATTRIBUTES) {
        const [base, rand] = p.attributes[attr];
        expect(c.attributes[attr]).toBeGreaterThanOrEqual(base);
        expect(c.attributes[attr]).toBeLessThanOrEqual(base + rand);
      }
    }
    // Weights 10 for most, 5 for Kingpin and 1 for Astronaut (236 in all).
    expect(counts.get("astronaut") ?? 0).toBeLessThan(30);
    expect(counts.get("kingpin")!).toBeGreaterThan(15);
    expect(counts.get("kingpin")!).toBeLessThan(counts.get("politician")!);
  });

});

describe("augmenting", () => {
  it("spends 20 XP per point, up to 25", () => {
    const { state, councilor } = setup();
    councilor.xp = 45;
    const before = councilor.attributes.persuasion;
    expect(cmd(state, councilor, { type: "augmentAttribute", attribute: "persuasion" })).toEqual({ ok: true });
    expect(councilor.attributes.persuasion).toBe(before + 1);
    expect(councilor.xp).toBe(25);
    councilor.attributes.persuasion = 25;
    expect(cmd(state, councilor, { type: "augmentAttribute", attribute: "persuasion" }).ok).toBe(false);
    councilor.xp = 10;
    expect(cmd(state, councilor, { type: "augmentAttribute", attribute: "command" }).ok).toBe(false);
  });

  it("is cheaper for a Quick Learner", () => {
    const { state, councilor } = setup();
    councilor.traits = ["quick-learner"];
    councilor.xp = 16;
    expect(cmd(state, councilor, { type: "augmentAttribute", attribute: "science" })).toEqual({ ok: true });
    expect(councilor.xp).toBe(0);
  });

  it("can't raise Loyalty", () => {
    const { state, councilor } = setup();
    councilor.xp = 100;
    expect(cmd(state, councilor, { type: "augmentAttribute", attribute: "loyalty" }).ok).toBe(false);
  });
});

describe("orgs", () => {
  it("are bought from the faction's market, add their bonuses and need Administration", () => {
    const { state, councilor } = setup();
    const faction = state.factions.find((f) => f.id === "aegis")!;
    faction.orgMarket = ["ardent-systems"];
    faction.resources.money = 1000;
    councilor.attributes.administration = 1;
    expect(cmd(state, councilor, { type: "buyOrg", orgId: "ardent-systems" }).ok).toBe(false);
    councilor.attributes.administration = 5;
    const admin = effectiveAttributes(content, councilor).administration;
    expect(cmd(state, councilor, { type: "buyOrg", orgId: "ardent-systems" })).toEqual({ ok: true });
    expect(faction.resources.money).toBe(1000 - orgDef(content, "ardent-systems").cost.money!);
    expect(faction.orgMarket).toEqual([]);
    expect(effectiveAttributes(content, councilor).administration).toBe(admin + 2);
  });

  it("are restricted by profession or trait", () => {
    const { state, councilor } = setup();
    const faction = state.factions.find((f) => f.id === "aegis")!;
    faction.orgMarket = ["darknet-collective"];
    faction.resources.money = 1000;
    faction.resources.ops = 100;
    councilor.attributes.administration = 5;
    expect(cmd(state, councilor, { type: "buyOrg", orgId: "darknet-collective" }).ok).toBe(false);
    councilor.traits = ["criminal"];
    expect(cmd(state, councilor, { type: "buyOrg", orgId: "darknet-collective" })).toEqual({ ok: true });
  });

  it("sell for a third of their money cost", () => {
    const { state, councilor } = setup();
    const faction = state.factions.find((f) => f.id === "aegis")!;
    councilor.orgs = ["granite-industries"];
    const money = faction.resources.money;
    expect(cmd(state, councilor, { type: "sellOrg", orgId: "granite-industries" })).toEqual({ ok: true });
    expect(faction.resources.money - money).toBeCloseTo(250 * content.rules.councilors.orgSellRefund, 6);
    expect(councilor.orgs).toEqual([]);
  });

  it("are never on two markets or held twice", () => {
    const { state } = setup();
    for (let i = 0; i < 12; i++) refreshOrgMarkets(state, content);
    const seen = state.factions.flatMap((f) => [...f.orgMarket, ...f.councilors.flatMap((c) => c.orgs)]);
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe("customize and dismiss", () => {
  it("renames and restyles a councilor", () => {
    const { state, councilor } = setup();
    const look = { gender: "male", skinTone: 3, portraitSeed: 1234, hairSeed: 99 };
    expect(cmd(state, councilor, { type: "customizeCouncilor", name: " Ada Byrne ", ...look })).toEqual({ ok: true });
    expect([councilor.name, councilor.gender, councilor.skinTone, councilor.portraitSeed, councilor.hairSeed]).toEqual(["Ada Byrne", "male", 3, 1234, 99]);
    expect(cmd(state, councilor, { type: "customizeCouncilor", name: "", ...look }).ok).toBe(false);
    expect(cmd(state, councilor, { type: "customizeCouncilor", name: "Ada", ...look, gender: "other" }).ok).toBe(false);
  });

  it("dismisses a councilor but never the last one", () => {
    const { state } = setup();
    const faction = state.factions.find((f) => f.id === "aegis")!;
    while (faction.councilors.length > 1) expect(cmd(state, faction.councilors[0]!, { type: "dismissCouncilor" })).toEqual({ ok: true });
    expect(cmd(state, faction.councilors[0]!, { type: "dismissCouncilor" }).ok).toBe(false);
  });
});


describe("recruiting", () => {
  it("offers 6–9 candidates and hires one for 60 influence into a free seat", () => {
    const { state } = setup();
    const faction = state.factions.find((f) => f.id === "aegis")!;
    expect(faction.recruits.length).toBeGreaterThanOrEqual(6);
    expect(faction.recruits.length).toBeLessThanOrEqual(9);
    const candidate = faction.recruits[0]!;
    faction.resources.influence = 100;
    expect(applyCommand(state, content, { type: "hireCouncilor", factionId: "aegis", recruitId: candidate.id }).ok).toBe(false);
    faction.councilors.pop();
    expect(applyCommand(state, content, { type: "hireCouncilor", factionId: "aegis", recruitId: candidate.id })).toEqual({ ok: true });
    expect(faction.councilors).toContain(candidate);
    expect(faction.recruits).not.toContain(candidate);
    expect(faction.resources.influence).toBe(40);
  });
});

describe("councilor names", () => {
  it("come from the home nation's culture, with female family names where they differ", () => {
    const sim = Simulation.create(baseContent, { seed: 21, difficulty: "normal", playerFactions: [] });
    const all = sim.state.factions.flatMap((f) => [...f.councilors, ...f.recruits]);
    for (const c of all) {
      const culture = baseContent.names.cultures[baseContent.names.nations[c.nationId]!]!;
      const family = c.gender === "female" && culture.familyFemale ? culture.familyFemale : culture.family;
      expect(culture[c.gender].some((g) => c.name.startsWith(`${g} `))).toBe(true);
      expect(family.some((f) => c.name.endsWith(` ${f}`))).toBe(true);
    }
  });
});
