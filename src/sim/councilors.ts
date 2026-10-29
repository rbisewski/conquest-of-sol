// Councilor details after Terra Invicta (SPEC 2.7): traits and orgs add to a councilor's
// attributes and incomes and grant or forbid missions; XP buys attribute points; each
// faction buys orgs from its own market, refreshed monthly.

import { ATTRIBUTES, type Attribute, type Content, type CouncilorIncome, type OrgDef, type TraitDef } from "./content";
import { FormulaBuilder, type Breakdown } from "./formula";
import { addLog, factionDef, nationDef, professionDef } from "./lookup";
import { modifierProduct, modifierSum } from "./research";
import { nextFloat, nextInt } from "./rng";
import type { Councilor, FactionState, GameState, MissionType } from "./state";

export const INCOME_KEYS = ["money", "influence", "ops", "boost", "research"] as const;
export type IncomeKey = (typeof INCOME_KEYS)[number];

// Traits and orgs are looked up in hot loops (every mission assessment), so index them once per content.
const index = new WeakMap<Content, { traits: Map<string, TraitDef>; orgs: Map<string, OrgDef> }>();
function lookup(c: Content) {
  let i = index.get(c);
  if (!i) {
    i = { traits: new Map(c.traits.map((t) => [t.id, t])), orgs: new Map(c.orgs.map((o) => [o.id, o])) };
    index.set(c, i);
  }
  return i;
}
export function traitDef(c: Content, id: string): TraitDef {
  const t = lookup(c).traits.get(id);
  if (!t) throw new Error(`Unknown trait "${id}"`);
  return t;
}
export function orgDef(c: Content, id: string): OrgDef {
  const o = lookup(c).orgs.get(id);
  if (!o) throw new Error(`Unknown org "${id}"`);
  return o;
}

/** Orgs give nothing while their councilor is detained, as in Terra Invicta. */
export function activeOrgs(content: Content, c: Councilor): OrgDef[] {
  return c.detainedPhases > 0 ? [] : c.orgs.map((id) => orgDef(content, id));
}

/** An attribute with its sources: the councilor's own value, then each trait and org. */
export function attributeBreakdown(content: Content, c: Councilor, attr: Attribute): Breakdown {
  const f = new FormulaBuilder().add("Base", c.attributes[attr]);
  for (const id of c.traits) {
    const t = traitDef(content, id);
    if (t.attributes?.[attr]) f.add(t.name, t.attributes[attr]!);
  }
  for (const o of activeOrgs(content, c)) if (o.attributes?.[attr]) f.add(o.name, o.attributes[attr]!);
  return f.build();
}

/** Attributes with trait and org bonuses, never below 0. Missions and the control cap use these. */
export function effectiveAttributes(content: Content, c: Councilor): Record<Attribute, number> {
  const out = { ...c.attributes };
  const add = (bonus: Partial<Record<Attribute, number>> | undefined) => {
    if (bonus) for (const attr of ATTRIBUTES) out[attr] += bonus[attr] ?? 0;
  };
  for (const id of c.traits) add(traitDef(content, id).attributes);
  for (const o of activeOrgs(content, c)) add(o.attributes);
  for (const attr of ATTRIBUTES) out[attr] = Math.max(0, out[attr]);
  return out;
}

/** Monthly incomes from the councilor's traits and orgs. */
export function councilorIncome(content: Content, c: Councilor): Record<IncomeKey, Breakdown> {
  const sources: { name: string; income?: CouncilorIncome }[] = [...c.traits.map((id) => traitDef(content, id)), ...activeOrgs(content, c)];
  const out = {} as Record<IncomeKey, Breakdown>;
  for (const key of INCOME_KEYS) {
    const f = new FormulaBuilder();
    for (const s of sources) if (s.income?.[key]) f.add(s.name, s.income[key]!);
    out[key] = f.build();
  }
  return out;
}

/** A faction's monthly income of one resource from all its councilors. */
export function councilIncome(content: Content, faction: FactionState, key: IncomeKey): number {
  let sum = 0;
  for (const c of faction.councilors) {
    for (const id of c.traits) sum += traitDef(content, id).income?.[key] ?? 0;
    for (const o of activeOrgs(content, c)) sum += o.income?.[key] ?? 0;
  }
  return sum;
}

/** Missions the councilor can run: their profession's, plus trait and org grants, minus trait prohibitions. */
export function availableMissions(content: Content, c: Councilor): Set<MissionType> {
  const out = new Set<MissionType>(professionDef(content, c.professionId).missions);
  // Set National Policy, Surveil Location and Go To Ground are open to every councilor.
  out.add("setPolicy");
  out.add("surveilLocation");
  out.add("goToGround");
  const traits = c.traits.map((id) => traitDef(content, id));
  for (const t of traits) for (const m of t.grants ?? []) out.add(m);
  for (const o of activeOrgs(content, c)) for (const m of o.grants ?? []) out.add(m);
  for (const t of traits) for (const m of t.prohibits ?? []) out.delete(m);
  return out;
}

/** Where a mission the councilor can run comes from, for the summary screen. */
export function missionSource(content: Content, c: Councilor, type: MissionType): string {
  if (type === "setPolicy" || type === "surveilLocation" || type === "goToGround") return "Common to all councilors";
  if (professionDef(content, c.professionId).missions.includes(type)) return professionDef(content, c.professionId).name;
  const trait = c.traits.map((id) => traitDef(content, id)).find((t) => t.grants?.includes(type));
  if (trait) return `Trait: ${trait.name}`;
  const org = activeOrgs(content, c).find((o) => o.grants?.includes(type));
  return org ? `Org: ${org.name}` : "";
}

/**
 * What a nation's advisors (Advise mission) add this turn: the x-th advisor counts 1/x, as
 * in Terra Invicta. Administration is a % bonus to IP; Command adds Command / 100 to Miltech.
 */
export function advisorBonus(state: GameState, nationId: string, attr: "administration" | "command"): number {
  return (state.advisors[nationId] ?? []).reduce((sum, a, i) => sum + a[attr] / (i + 1), 0);
}

/** Age in whole years on the current game date. */
export function councilorAge(state: GameState, content: Content, c: Councilor): number {
  return Math.floor(content.rules.startYear + state.dayIndex / 365.25) - c.birthYear;
}

// ---------------------------------------------------------------------------
// Traits

/** Rolls a new councilor's traits: each trait in content order, at most one per group. */
export function rollTraits(state: GameState, content: Content, professionId: string): string[] {
  const out: string[] = [];
  const groups = new Set<string>();
  for (const t of content.traits) {
    if (out.length >= content.rules.councilors.maxStartingTraits) break;
    const chance = t.chance[professionId] ?? t.chance["*"] ?? 0;
    if (chance <= 0 || nextFloat(state.rng) >= chance) continue;
    if (t.group && groups.has(t.group)) continue;
    out.push(t.id);
    if (t.group) groups.add(t.group);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Augmenting

/** XP to raise an attribute by one point, after trait discounts. */
export function augmentCost(content: Content, c: Councilor): number {
  const change = c.traits.reduce((sum, id) => sum + (traitDef(content, id).augmentCost ?? 0), 0);
  return Math.max(1, Math.round(content.rules.councilors.augmentXpCost * (1 + change)));
}

export function checkAugment(content: Content, c: Councilor, attr: Attribute): { ok: true } | { ok: false; reason: string } {
  if (attr === "loyalty") return { ok: false, reason: "Loyalty can't be augmented" };
  if (c.attributes[attr] >= content.rules.attribute.max) return { ok: false, reason: `Already at the maximum of ${content.rules.attribute.max}` };
  const cost = augmentCost(content, c);
  if (c.xp < cost) return { ok: false, reason: `Needs ${cost} XP` };
  return { ok: true };
}

export function augment(content: Content, c: Councilor, attr: Attribute): void {
  c.xp -= augmentCost(content, c);
  c.attributes[attr] += 1;
}

// ---------------------------------------------------------------------------
// Orgs

export function orgLoad(content: Content, c: Councilor): number {
  return c.orgs.reduce((sum, id) => sum + orgDef(content, id).tier, 0);
}

/** Org capacity: one tier per point of (effective) Administration. */
export function orgCapacity(content: Content, c: Councilor): number {
  return effectiveAttributes(content, c).administration;
}

/** Who may hold the org, ignoring capacity and cost. */
export function orgAllowed(state: GameState, content: Content, factionId: string, c: Councilor, org: OrgDef): { ok: true } | { ok: false; reason: string } {
  const restricted = (org.professions?.length ?? 0) + (org.traits?.length ?? 0) > 0;
  const byProfession = org.professions?.includes(c.professionId) ?? false;
  const byTrait = (org.traits ?? []).some((t) => c.traits.includes(t));
  if (restricted && !byProfession && !byTrait) {
    const who = [...(org.professions ?? []).map((p) => professionDef(content, p).name), ...(org.traits ?? []).map((t) => `${traitDef(content, t).name} trait`)];
    return { ok: false, reason: `Needs ${who.join(", ")}` };
  }
  if (org.nationId && c.nationId !== org.nationId) {
    const nation = state.nations.find((n) => n.id === org.nationId);
    if (!nation?.controlPoints.some((cp) => cp.owner === factionId)) {
      return { ok: false, reason: `Needs a control point in ${nationDef(content, org.nationId).name}, or a councilor from there` };
    }
  }
  return { ok: true };
}

const ORG_COST_KEYS = ["money", "influence", "ops", "boost"] as const;

/** What an org costs this faction: its price, with project discounts per resource. */
export function orgCost(state: GameState, content: Content, factionId: string, org: OrgDef): Record<(typeof ORG_COST_KEYS)[number], number> {
  const out = { money: 0, influence: 0, ops: 0, boost: 0 };
  for (const k of ORG_COST_KEYS) out[k] = (org.cost[k] ?? 0) * modifierProduct(state, content, factionId, "OrgPurchaseCost", k);
  return out;
}

function canAfford(faction: FactionState, cost: Record<(typeof ORG_COST_KEYS)[number], number>): boolean {
  return ORG_COST_KEYS.every((k) => faction.resources[k] >= cost[k]);
}

export function checkBuyOrg(state: GameState, content: Content, faction: FactionState, c: Councilor, orgId: string): { ok: true } | { ok: false; reason: string } {
  if (!faction.orgMarket.includes(orgId)) return { ok: false, reason: "That org isn't on our market" };
  const org = orgDef(content, orgId);
  const allowed = orgAllowed(state, content, faction.id, c, org);
  if (!allowed.ok) return allowed;
  if (orgLoad(content, c) + org.tier > orgCapacity(content, c)) return { ok: false, reason: `Not enough Administration (${orgLoad(content, c)}/${orgCapacity(content, c)} used)` };
  if (!canAfford(faction, orgCost(state, content, faction.id, org))) return { ok: false, reason: "We can't afford it" };
  return { ok: true };
}

export function buyOrg(state: GameState, content: Content, faction: FactionState, c: Councilor, orgId: string): void {
  const cost = orgCost(state, content, faction.id, orgDef(content, orgId));
  for (const k of ORG_COST_KEYS) faction.resources[k] -= cost[k];
  faction.orgMarket = faction.orgMarket.filter((id) => id !== orgId);
  c.orgs.push(orgId);
}

/** Sells an org for part of its Money cost; it leaves the game until a market draws it again. */
export function sellOrg(content: Content, faction: FactionState, c: Councilor, orgId: string): void {
  const org = orgDef(content, orgId);
  faction.resources.money += (org.cost.money ?? 0) * content.rules.councilors.orgSellRefund;
  c.orgs = c.orgs.filter((id) => id !== orgId);
}

/** Orgs some councilor holds or some market offers. */
function takenOrgs(state: GameState): Set<string> {
  const out = new Set<string>();
  for (const f of state.factions) {
    for (const id of f.orgMarket) out.add(id);
    for (const c of f.councilors) for (const id of c.orgs) out.add(id);
  }
  return out;
}

/**
 * Terra Invicta's monthly market refresh, simplified: each offered org stays with a chance of
 * 25% per star, then the market is topped up to a random size from the orgs nobody holds or offers.
 */
export function refreshOrgMarkets(state: GameState, content: Content): void {
  const m = content.rules.councilors.orgMarket;
  for (const faction of state.factions) {
    faction.orgMarket = faction.orgMarket.filter((id) => nextFloat(state.rng) < orgDef(content, id).tier * m.keepChancePerTier);
    const size = nextInt(state.rng, m.minSize, m.maxSize) + modifierSum(state, content, faction.id, "MaxAvailableOrgs");
    const taken = takenOrgs(state);
    const free = content.orgs.filter((o) => !taken.has(o.id)).map((o) => o.id);
    while (faction.orgMarket.length < size && free.length > 0) {
      const [id] = free.splice(nextInt(state.rng, 0, free.length - 1), 1);
      faction.orgMarket.push(id!);
    }
  }
}

/** Rough worth of an org to the AI: attribute points plus incomes in money-equivalent terms. */
function orgValue(org: OrgDef): number {
  const attrs = Object.values(org.attributes ?? {}).reduce((a, b) => a + b, 0);
  const i = org.income ?? {};
  return attrs * 3 + (i.money ?? 0) * 0.3 + (i.influence ?? 0) * 1.5 + (i.ops ?? 0) + (i.boost ?? 0) * 3 + (org.grants?.length ?? 0) * 2;
}

/** AI factions buy at most one org a month, keeping a reserve for missions and diplomacy. */
export function aiBuyOrgs(state: GameState, content: Content, faction: FactionState): void {
  const reserve = 40;
  const options = faction.orgMarket
    .map((id) => orgDef(content, id))
    .filter((o) => orgValue(o) > 0)
    .sort((a, b) => orgValue(b) - orgValue(a) || a.id.localeCompare(b.id));
  for (const org of options) {
    const cost = orgCost(state, content, faction.id, org);
    const spare = (["money", "influence"] as const).every((k) => faction.resources[k] - cost[k] >= reserve);
    if (!spare) continue;
    const holder = faction.councilors.find((c) => checkBuyOrg(state, content, faction, c, org.id).ok);
    if (!holder) continue;
    buyOrg(state, content, faction, holder, org.id);
    return;
  }
}

/**
 * Takes a councilor out of the game (dismissed or killed): their orgs leave with them, their
 * scheduled mission is dropped, and protection and intel on them are forgotten.
 */
export function removeCouncilor(state: GameState, faction: FactionState, c: Councilor): void {
  faction.councilors = faction.councilors.filter((x) => x !== c);
  state.scheduledMissions = state.scheduledMissions.filter((s) => s.councilorId !== c.id);
  delete state.protections[c.id];
  for (const [id, list] of Object.entries(state.protections)) state.protections[id] = list.filter((p) => p !== c.id);
  for (const f of state.factions) delete f.intel[c.id];
}

/** Dismisses a councilor (see removeCouncilor). */
export function dismissCouncilor(state: GameState, content: Content, faction: FactionState, c: Councilor): void {
  removeCouncilor(state, faction, c);
  addLog(state, { factionId: faction.id, kind: "council", text: `${c.name} (${professionDef(content, c.professionId).name}) was dismissed from the ${factionDef(content, faction.id).name} council.` });
}

