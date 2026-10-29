// Research (SPEC 1.6, 2.9), after Terra Invicta's Technology page. Nations produce research,
// paid to the holders of their CPs; each faction splits its research between the three
// global techs (shared by everyone, completed once for the world) and its own projects.
// The top contributor to a finished tech picks the next one. Projects unlock with a roll
// once their prerequisites are done, then wait to become available. Completed projects and
// techs apply their effects through the modifier helpers below. docs/formulas.md ("Research").

import type { Attribute, Content, ModifierContext, ProjectDef, ResearchEffect, TechDef } from "./content";
import { activeOrgs, effectiveAttributes, traitDef } from "./councilors";
import { detLn, detPow } from "./detmath";
import { workingHolders } from "./economy";
import { FormulaBuilder, type Breakdown } from "./formula";
import { addLog, factionState } from "./lookup";
import { applyPropaganda } from "./missions";
import { controlCap, controlUpkeep } from "./monthly";
import { gdpPerCapita, ownsActiveType } from "./nation";
import { nextFloat } from "./rng";
import type { FactionResearch, FactionState, GameState, MissionType, NationState, TechSlot } from "./state";

// Techs and projects are looked up in hot loops, so index them once per content.
const index = new WeakMap<Content, { techs: Map<string, TechDef>; projects: Map<string, ProjectDef>; unlocks: Map<string, number> }>();
function lookup(content: Content) {
  let entry = index.get(content);
  if (!entry) {
    // How many techs and projects each tech leads to, for the AI's picks.
    const unlocks = new Map<string, number>();
    for (const item of [...content.techs, ...content.projects]) for (const p of item.prereqs) unlocks.set(p, (unlocks.get(p) ?? 0) + 1);
    entry = { techs: new Map(content.techs.map((t) => [t.id, t])), projects: new Map(content.projects.map((p) => [p.id, p])), unlocks };
    index.set(content, entry);
  }
  return entry;
}

export function techDef(content: Content, id: string): TechDef {
  const t = lookup(content).techs.get(id);
  if (!t) throw new Error(`Unknown tech "${id}"`);
  return t;
}

export function projectDef(content: Content, id: string): ProjectDef {
  const p = lookup(content).projects.get(id);
  if (!p) throw new Error(`Unknown project "${id}"`);
  return p;
}

// ---------------------------------------------------------------------------
// Lasting effects of completed techs and projects

/** A faction's lasting effects, summed up once per change (they are read for every CP, every day). */
interface Totals {
  effects: ResearchEffect[];
  /** Additive modifiers and products of multiplicative ones, by "context" and "context:detail". */
  sums: Map<string, number>;
  products: Map<string, number>;
  /** Priority bonuses by priority id; mission bonuses by "mission:side". */
  priorities: Map<string, number>;
  missions: Map<string, number>;
}

const totalsCache = new WeakMap<FactionState, { version: number; totals: Totals }>();

/**
 * Every lasting effect that applies to the faction, once per completion: its own projects'
 * faction-wide effects, and the global effects of known techs and of any faction's projects.
 */
function totals(state: GameState, content: Content, factionId: string): Totals {
  const faction = factionState(state, factionId);
  const cached = totalsCache.get(faction);
  if (cached?.version === state.research.version) return cached.totals;
  const effects: ResearchEffect[] = [];
  for (const id of state.research.completed) effects.push(...techDef(content, id).effects);
  for (const f of state.factions) {
    for (const [id, times] of Object.entries(f.research.completed)) {
      for (const e of projectDef(content, id).effects) {
        if (!("scope" in e) || (e.scope === "faction" && f.id !== factionId)) continue;
        for (let i = 0; i < times; i++) effects.push(e);
      }
    }
  }
  const t: Totals = { effects, sums: new Map(), products: new Map(), priorities: new Map(), missions: new Map() };
  const add = (m: Map<string, number>, key: string, v: number) => m.set(key, (m.get(key) ?? 0) + v);
  for (const e of effects) {
    if (e.kind === "priority") add(t.priorities, e.priority, e.amount);
    if (e.kind === "mission") add(t.missions, `${e.mission}:${e.side}`, e.amount);
    if (e.kind !== "modifier") continue;
    const detail = e.attribute ?? e.resource;
    for (const key of detail ? [e.context, `${e.context}:${detail}`] : [e.context]) {
      if (e.op === "add") add(t.sums, key, e.value);
      else t.products.set(key, (t.products.get(key) ?? 1) * e.value);
    }
  }
  totalsCache.set(faction, { version: state.research.version, totals: t });
  return t;
}

export function activeEffects(state: GameState, content: Content, factionId: string): ResearchEffect[] {
  return totals(state, content, factionId).effects;
}

/** Sum of a modifier's additive values (0 if none), optionally for one attribute or resource. */
export function modifierSum(state: GameState, content: Content, factionId: string, context: ModifierContext, detail?: string): number {
  return totals(state, content, factionId).sums.get(detail ? `${context}:${detail}` : context) ?? 0;
}

/** Product of a modifier's multiplicative values (1 if none), optionally for one attribute or resource. */
export function modifierProduct(state: GameState, content: Content, factionId: string, context: ModifierContext, detail?: string): number {
  return totals(state, content, factionId).products.get(detail ? `${context}:${detail}` : context) ?? 1;
}

/** Product of a modifier's multiplicative values over the effects that reach every faction (known techs, global projects). */
export function globalModifierProduct(state: GameState, content: Content, context: ModifierContext): number {
  let product = 1;
  const apply = (e: ResearchEffect, times = 1) => {
    if (e.kind === "modifier" && e.context === context && e.op === "mul" && e.scope === "global") for (let i = 0; i < times; i++) product *= e.value;
  };
  for (const id of state.research.completed) for (const e of techDef(content, id).effects) apply(e);
  for (const f of state.factions) for (const [id, times] of Object.entries(f.research.completed)) for (const e of projectDef(content, id).effects) apply(e, times);
  return product;
}

/** Extra share of IP the faction's CPs put into a priority (0.1 = +10%). */
export function priorityBonus(state: GameState, content: Content, factionId: string, priority: string): number {
  return totals(state, content, factionId).priorities.get(priority) ?? 0;
}

/** Project bonus to a mission's attack (for the faction running it) or defense (for the faction it targets). */
export function missionBonus(state: GameState, content: Content, factionId: string, mission: MissionType, side: "attack" | "defense"): number {
  return totals(state, content, factionId).missions.get(`${mission}:${side}`) ?? 0;
}

/** Council seats: the base council plus projects. */
export function councilSize(state: GameState, content: Content, faction: FactionState): number {
  return content.rules.councilSize + modifierSum(state, content, faction.id, "CouncilSize");
}

/** The mission spend slider's steps: 0, 1, 2 … 64, doubling once more per extra step from projects. */
export function spendSteps(state: GameState, content: Content, factionId: string): number[] {
  const steps = [...content.rules.missions.spend.steps];
  for (let i = 0; i < modifierSum(state, content, factionId, "MaxMissionSliderSteps"); i++) steps.push(steps.at(-1)! * 2);
  return steps;
}

// ---------------------------------------------------------------------------
// Production

/**
 * Terra Invicta's research_month: (population × GDPPC factor × Education × min(Education, 12)
 * × Government^(1/6) × 0.0075 + min(population / 5000, CPs + Education + Government / 2))
 * × cohesion factor (125% at 5, 75% at 0 and 10) × (1 − Unrest² / 100).
 */
export function nationResearch(content: Content, nation: NationState): Breakdown {
  const r = content.rules.research.national;
  const gdppc = gdpPerCapita(nation) * 1000;
  const ratio = gdppc / r.gdppcPivot;
  // Above the knee the curve turns logarithmic, continuing (pivot × 2)^0.6 smoothly.
  const kneeRatio = r.gdppcKnee / r.gdppcPivot;
  const wealth =
    gdppc <= r.gdppcKnee
      ? detPow(Math.max(ratio, 0), r.gdppcExponent)
      : detPow(kneeRatio, r.gdppcExponent) * (1 + r.gdppcExponent * (detLn(ratio) - detLn(kneeRatio)));
  const education = nation.education * Math.min(nation.education, r.educationCap);
  const government = detPow(Math.max(nation.democracy, 1), 1 / r.governmentRoot);
  const people = nation.population * wealth * education * government * r.scale;
  const base = Math.min((nation.population * 1e6) / r.basePopulationDivisor, nation.controlPoints.length + nation.education + nation.democracy / 2);
  return new FormulaBuilder()
    .add("Population, wealth, Education and Government", people)
    .add("Base (CPs + Education + Government / 2)", base)
    .mul("Cohesion", r.cohesionMax - Math.abs(nation.cohesion - r.cohesionPeak) * r.cohesionSlope)
    .mul("Unrest", Math.max(0, 1 - nation.unrest * nation.unrest * r.unrestSquared))
    .build();
}

/** A councilor's research from traits and orgs, +1% per point of Science. */
function councilorResearch(content: Content, faction: FactionState): number {
  let sum = 0;
  for (const c of faction.councilors) {
    let own = 0;
    for (const id of c.traits) own += traitDef(content, id).income?.research ?? 0;
    for (const o of activeOrgs(content, c)) own += o.income?.research ?? 0;
    if (own !== 0) sum += own * (1 + content.rules.research.sciencePerPoint * effectiveAttributes(content, c).science);
  }
  return sum;
}

/** A faction's research a month: its CPs' shares of their nations' research, a base, and its councilors. */
export function monthlyResearch(state: GameState, content: Content, faction: FactionState): Breakdown {
  let nations = 0;
  for (const nation of state.nations) {
    const held = workingHolders(state, nation).get(faction.id);
    if (held) nations += nationShare(state, content, nation, faction.id, held.length, nationResearch(content, nation).value);
  }
  const f = new FormulaBuilder().add("Nations (control points)", nations);
  const projects = modifierProduct(state, content, faction.id, "ControlPointResearch");
  if (projects !== 1) f.mul("Projects (control point research)", projects);
  return f
    .add("Faction base", content.rules.research.factionBase)
    .add("Councilors' traits and orgs", councilorResearch(content, faction))
    .build();
}

/** The holder's share of a nation's research: an equal share per CP, +5% with the Knowledge Sector. */
function nationShare(state: GameState, content: Content, nation: NationState, factionId: string, held: number, research: number): number {
  const knowledge = ownsActiveType(state, nation, factionId, "Knowledge Sector") ? 1 + content.rules.research.knowledgeSectorBonus : 1;
  return (research * held * knowledge) / nation.controlPoints.length;
}

// ---------------------------------------------------------------------------
// Costs, slots and availability

export function techCost(state: GameState, content: Content, id: string): number {
  return techDef(content, id).cost * content.rules.difficulty[state.difficulty].researchCost;
}

/** Repeatable projects cost (1 + times completed) times as much. */
export function projectCost(state: GameState, content: Content, faction: FactionState, id: string): number {
  return projectDef(content, id).cost * (1 + (faction.research.completed[id] ?? 0)) * content.rules.difficulty[state.difficulty].researchCost;
}

/** One project slot is free; a councilor holding an org with research income opens a second. Habs (the third) aren't modelled yet. */
export function projectSlotCount(content: Content, faction: FactionState): number {
  const org = faction.councilors.some((c) => c.detainedPhases === 0 && activeOrgs(content, c).some((o) => (o.income?.research ?? 0) > 0));
  return Math.min(content.rules.research.maxProjectSlots, org ? 2 : 1);
}

export function techAvailable(state: GameState, content: Content, id: string): boolean {
  const r = state.research;
  return !r.completed.includes(id) && !r.slots.some((s) => s.techId === id) && techDef(content, id).prereqs.every((p) => r.completed.includes(p));
}

export function availableTechs(state: GameState, content: Content): TechDef[] {
  return content.techs.filter((t) => techAvailable(state, content, t.id));
}

/** True while a player faction must pick the next global tech; the clock waits for it. */
export function awaitingTechChoice(state: GameState): boolean {
  return state.research.slots.some((s) => s.techId === null && s.chooser !== null && state.factions.some((f) => f.id === s.chooser && f.isPlayer));
}

/** The project slots where a faction must pick the next project: emptied by a completion, still empty, with a project to pick. */
export function projectChoices(content: Content, faction: FactionState): number[] {
  const r = faction.research;
  if (!r.available.some((id) => !r.projectSlots.includes(id))) return [];
  return r.choosing.filter((j) => r.projectSlots[j] === null && j < projectSlotCount(content, faction));
}

/** True while a player faction must pick the next project; the clock waits for it. */
export function awaitingProjectChoice(state: GameState, content: Content): boolean {
  return state.factions.some((f) => f.isPlayer && projectChoices(content, f).length > 0);
}

/** Whether this faction must pick a global tech or a project before the clock runs again. */
export function mustChooseResearch(state: GameState, content: Content, factionId: string): boolean {
  const faction = state.factions.find((f) => f.id === factionId);
  if (!faction) return false;
  return state.research.slots.some((s) => s.techId === null && s.chooser === factionId) || projectChoices(content, faction).length > 0;
}

/** A player faction picks the project for an emptied slot (once any is available). */
function awaitChoice(faction: FactionState, slot: number): void {
  if (faction.isPlayer && !faction.research.choosing.includes(slot)) faction.research.choosing.push(slot);
}

// ---------------------------------------------------------------------------
// Setup

export function newFactionResearch(content: Content): FactionResearch {
  const r = content.rules.research;
  return {
    pips: Array.from({ length: r.startingTechs.length + r.maxProjectSlots }, () => r.defaultPips),
    projectSlots: Array.from({ length: r.maxProjectSlots }, () => null),
    progress: {},
    completed: {},
    available: [],
    pending: {},
    failed: [],
    choosing: [],
  };
}

/** The campaign's starting techs, and each faction's first project ideas. AI factions start a project. */
export function initResearch(state: GameState, content: Content): void {
  state.research = {
    slots: content.rules.research.startingTechs.map((techId) => ({ techId, progress: 0, contributions: {}, chooser: null })),
    completed: [],
    maxMiltech: content.rules.research.startingMaxMiltech,
    takenProjects: [],
    version: 0,
  };
  for (const faction of state.factions) {
    faction.research = newFactionResearch(content);
    // AI factions lean on their projects: twice the pips of a global tech.
    if (!faction.isPlayer) faction.research.pips = faction.research.pips.map((p, i) => (i < state.research.slots.length ? p : p * 2));
  }
  for (const faction of state.factions) {
    rollUnlocks(state, content, faction);
    if (!faction.isPlayer) aiFillProjects(state, content, faction);
  }
}

function done(state: GameState, faction: FactionState, id: string): boolean {
  return state.research.completed.includes(id) || (faction.research.completed[id] ?? 0) > 0;
}

/** All prerequisites done; the alternative prerequisite can stand in for the first. */
function prereqsMet(state: GameState, faction: FactionState, p: ProjectDef): boolean {
  return p.prereqs.every((q, i) => done(state, faction, q) || (i === 0 && p.altPrereq !== undefined && done(state, faction, p.altPrereq)));
}

/**
 * Rolls the unlock chance, once each, of every project whose prerequisites the faction now
 * meets. A project it gets the idea for rolls its initial availability at once, and otherwise
 * waits for the monthly rolls.
 */
function rollUnlocks(state: GameState, content: Content, faction: FactionState): void {
  const r = faction.research;
  for (const p of content.projects) {
    if (r.available.includes(p.id) || p.id in r.pending || r.failed.includes(p.id) || state.research.takenProjects.includes(p.id)) continue;
    if (!p.repeatable && (r.completed[p.id] ?? 0) > 0) continue;
    if (p.factions && !p.factions.includes(faction.id)) continue;
    if (!prereqsMet(state, faction, p)) continue;
    const chance = p.guaranteedFor === faction.id ? 1 : p.unlockChance;
    if (nextFloat(state.rng) >= chance) {
      r.failed.push(p.id);
      continue;
    }
    if (nextFloat(state.rng) < p.availability.initial) r.available.push(p.id);
    else r.pending[p.id] = 0;
  }
}

/**
 * The 1st of the month: each waiting project becomes available with its chance for the
 * months waited. Terra Invicta rolls daily against a monthly chance; we roll once a month.
 */
export function rollProjectAvailability(state: GameState, content: Content): void {
  for (const faction of state.factions) {
    const r = faction.research;
    for (const id of Object.keys(r.pending)) {
      const a = projectDef(content, id).availability;
      const months = r.pending[id]! + 1;
      if (nextFloat(state.rng) < Math.min(a.max, a.initial + a.monthly * months)) {
        delete r.pending[id];
        r.available.push(id);
      } else r.pending[id] = months;
    }
    if (!faction.isPlayer) aiFillProjects(state, content, faction);
  }
}

// ---------------------------------------------------------------------------
// Daily research

/** Spends `share` of a month of research for every faction, then finishes completed techs. */
export function runResearchTick(state: GameState, content: Content, share: number): void {
  for (const faction of state.factions) spendResearch(state, content, faction, monthlyResearch(state, content, faction).value * share);
  state.research.slots.forEach((slot, i) => {
    if (slot.techId && slot.progress >= techCost(state, content, slot.techId)) completeTech(state, content, i);
  });
}

/** Splits research between the slots with pips: pips / total pips × (1 + 5% per such slot). */
function spendResearch(state: GameState, content: Content, faction: FactionState, amount: number): void {
  const r = faction.research;
  const techSlots = state.research.slots.length;
  const projectSlots = projectSlotCount(content, faction);
  const active: number[] = [];
  state.research.slots.forEach((s, i) => {
    if (s.techId && r.pips[i]! > 0) active.push(i);
  });
  r.projectSlots.forEach((id, j) => {
    if (id && j < projectSlots && r.pips[techSlots + j]! > 0) active.push(techSlots + j);
  });
  if (active.length === 0 || amount <= 0) return;
  const totalPips = active.reduce((sum, i) => sum + r.pips[i]!, 0);
  const total = amount * (1 + content.rules.research.bonusPerActiveSlot * active.length);
  for (const i of active) {
    const part = (total * r.pips[i]!) / totalPips;
    if (i < techSlots) {
      const slot = state.research.slots[i]!;
      slot.progress += part;
      slot.contributions[faction.id] = (slot.contributions[faction.id] ?? 0) + part;
    } else {
      const j = i - techSlots;
      const id = r.projectSlots[j];
      // A one-of-a-kind project another faction completed earlier today has left the slot.
      if (!id) continue;
      r.progress[id] = (r.progress[id] ?? 0) + part;
      if (r.progress[id]! >= projectCost(state, content, faction, id)) completeProject(state, content, faction, j);
    }
  }
}

/** The faction that put the most into the slot's tech; ties go to the first in faction order. */
export function topContributor(state: GameState, slot: TechSlot): string | null {
  let best: string | null = null;
  for (const f of state.factions) {
    const c = slot.contributions[f.id] ?? 0;
    if (c > 0 && (best === null || c > (slot.contributions[best] ?? 0))) best = f.id;
  }
  return best;
}

function completeTech(state: GameState, content: Content, slotIndex: number): void {
  const slot = state.research.slots[slotIndex]!;
  const tech = techDef(content, slot.techId!);
  const leader = topContributor(state, slot);
  state.research.completed.push(tech.id);
  state.research.version += 1;
  state.research.slots[slotIndex] = { techId: null, progress: 0, contributions: {}, chooser: leader };
  addLog(state, { kind: "research", text: `Researchers worldwide completed ${tech.name}.` });
  for (const e of tech.effects) {
    if (e.kind === "maxMiltech") state.research.maxMiltech += e.amount;
    if (e.kind === "councilorXp") for (const f of state.factions) for (const c of f.councilors) c.xp += e.amount;
  }
  for (const faction of state.factions) rollUnlocks(state, content, faction);
  const next = state.research.slots[slotIndex]!;
  const chooser = leader ? factionState(state, leader) : null;
  if (availableTechs(state, content).length === 0) next.chooser = null;
  else if (!chooser || !chooser.isPlayer) next.techId = aiPickTech(state, content);
}

function completeProject(state: GameState, content: Content, faction: FactionState, slot: number): void {
  const r = faction.research;
  const project = projectDef(content, r.projectSlots[slot]!);
  r.completed[project.id] = (r.completed[project.id] ?? 0) + 1;
  state.research.version += 1;
  r.progress[project.id] = 0;
  r.projectSlots[slot] = null;
  if (!project.repeatable) r.available = r.available.filter((id) => id !== project.id);
  for (const g of project.grants) faction.resources[g.resource] += g.amount;
  for (const e of project.effects) applyInstantEffect(state, content, faction, e);
  if (project.oneTimeGlobally) takeProject(state, project.id);
  addLog(state, { factionId: faction.id, kind: "research", tone: "good", text: `${project.name} completed.` });
  rollUnlocks(state, content, faction);
  if (!faction.isPlayer) aiFillProjects(state, content, faction);
  else awaitChoice(faction, slot);
}

function applyInstantEffect(state: GameState, content: Content, faction: FactionState, e: ResearchEffect): void {
  const max = content.rules.attribute.max;
  switch (e.kind) {
    case "councilorAttribute":
      for (const c of faction.councilors) c.attributes[e.attribute] = Math.min(max, c.attributes[e.attribute] + e.amount);
      break;
    case "councilorTrait":
      for (const c of faction.councilors) if (!c.traits.includes(e.trait)) c.traits.push(e.trait);
      break;
    case "councilorXp":
      for (const c of faction.councilors) c.xp += e.amount;
      break;
    case "propaganda":
      for (const nation of state.nations) applyPropaganda(content, nation, faction.id, e.strength);
      break;
    case "reviewFailed":
      faction.research.failed = [];
      break;
    default:
    // Lasting effects apply through activeEffects.
  }
}

/** A one-of-a-kind project leaves every other faction's lists and slots (their research in it is lost). */
function takeProject(state: GameState, id: string): void {
  state.research.takenProjects.push(id);
  for (const f of state.factions) {
    const r = f.research;
    r.available = r.available.filter((x) => x !== id);
    delete r.pending[id];
    r.failed = r.failed.filter((x) => x !== id);
    r.projectSlots.forEach((x, j) => x === id && awaitChoice(f, j));
    r.projectSlots = r.projectSlots.map((x) => (x === id ? null : x));
    delete r.progress[id];
  }
}

/** Attributes new recruits of this faction get from projects. */
export function recruitBonus(state: GameState, content: Content, factionId: string, attribute: Attribute): number {
  return modifierSum(state, content, factionId, "AllRecruitStats", attribute);
}

// ---------------------------------------------------------------------------
// Choices (commands and the AI)

export function checkTechChoice(state: GameState, content: Content, factionId: string, slot: number, techId: string): { ok: true } | { ok: false; reason: string } {
  const s = state.research.slots[slot];
  if (!s) return { ok: false, reason: "No such research slot" };
  if (s.techId !== null || s.chooser !== factionId) return { ok: false, reason: "This faction doesn't pick the next tech here" };
  if (!content.techs.some((t) => t.id === techId) || !techAvailable(state, content, techId)) return { ok: false, reason: "That tech can't be researched yet" };
  return { ok: true };
}

export function checkProjectChoice(content: Content, faction: FactionState, slot: number, projectId: string | null): { ok: true } | { ok: false; reason: string } {
  const r = faction.research;
  if (slot < 0 || slot >= projectSlotCount(content, faction)) return { ok: false, reason: "That project slot isn't open" };
  if (projectId === null) return { ok: true };
  if (!r.available.includes(projectId)) return { ok: false, reason: "That project isn't available" };
  if (r.projectSlots.some((id, j) => id === projectId && j !== slot)) return { ok: false, reason: "That project is already under way" };
  return { ok: true };
}

/** The available tech that leads to the most others per point of cost. */
function aiPickTech(state: GameState, content: Content): string | null {
  const unlocks = lookup(content).unlocks;
  let best: TechDef | null = null;
  let bestScore = -1;
  for (const t of availableTechs(state, content)) {
    const score = (1 + (unlocks.get(t.id) ?? 0)) / t.cost;
    if (score > bestScore) [best, bestScore] = [t, score];
  }
  return best?.id ?? null;
}

/** How much the AI wants a project of each Terra Invicta role; projects with no effect here only lead somewhere. */
const AI_ROLE_WEIGHT: Record<string, number> = {
  ControlPointCap: 2,
  Councilors: 2,
  Research: 2,
  DevelopNation: 1.5,
  PoliticalMissions: 1.5,
  TerrestrialWarfare: 1,
  NeutralizeNation: 1,
  Boost: 1,
  Influence: 1,
  Money: 1,
  Ops: 1,
};

/** Fills open project slots with the most wanted project per point of cost; more cap when near the control cap. */
export function aiFillProjects(state: GameState, content: Content, faction: FactionState): void {
  const r = faction.research;
  const tight = controlUpkeep(state, content, faction.id) > 0.8 * controlCap(state, content, faction).value;
  const unlocks = lookup(content).unlocks;
  const score = (id: string) => {
    const p = projectDef(content, id);
    const useful = p.effects.length > 0 || p.grants.length > 0;
    // Seats and cheaper control points are worth the most, whatever the project's role.
    const core = p.effects.some((e) => e.kind === "modifier" && (e.context === "CouncilSize" || e.context === "ControlPointMaintenance" || e.context === "ControlPointCapacity"));
    const role = core ? 2 : (AI_ROLE_WEIGHT[p.role] ?? 0.5);
    const weight = (useful ? role : 0.3 * (unlocks.get(id) ?? 0)) * (tight && core ? 3 : 1) * (p.repeatable ? 0.5 : 1);
    return weight / projectCost(state, content, faction, id);
  };
  for (let j = 0; j < projectSlotCount(content, faction); j++) {
    if (r.projectSlots[j]) continue;
    const options = r.available.filter((id) => !r.projectSlots.includes(id));
    if (options.length === 0) return;
    r.projectSlots[j] = options.reduce((a, b) => (score(b) > score(a) ? b : a));
  }
}
