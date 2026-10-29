// Who holds which region (SPEC 2.6.4). Regions change hands through war, national policy
// and secession (claims.ts says who may take what), so ownership lives in
// GameState.regionOwners, region id → nation id. That record is replaced, never edited, on
// every change (see transferRegion), so the indexes built from it are cached by its identity.
//
// A nation that loses its last region ceases to exist (capitalId null) but keeps its place in
// GameState.nations: it can come back by secession or a grant of independence, starting from
// its home capital, the capital region in content.
//
// Determinism note: only + − × ÷, Math.sqrt/floor/round/min/max and detmath.ts helpers.

import type { Content, RegionDef } from "./content";
import { boostPerCompletion } from "./economy";
import { removeFromFederation } from "./federation";
import { nationState } from "./lookup";
import { syncControlPointCount } from "./nation";
import { pruneMilitary } from "./military";
import type { GameState, NationState } from "./state";

// ---------------------------------------------------------------------------
// Region definitions

interface RegionIndex {
  byId: Map<string, RegionDef>;
  /** Each nation's capital in content: where it starts, and where it comes back. */
  homeCapitals: Map<string, RegionDef>;
  meanPopulation: number;
  medianArea: number;
}

const regionCache = new WeakMap<Content, RegionIndex>();
// Region lookups are hot (several per army per day), so the last content's index is kept at hand.
let lastIndex: { content: Content; index: RegionIndex } | null = null;

export function regionIndex(content: Content): RegionIndex {
  if (lastIndex?.content === content) return lastIndex.index;
  let index = regionCache.get(content);
  if (!index) {
    const areas = content.regions.map((r) => r.areaKm2).sort((a, b) => a - b);
    const mid = Math.floor(areas.length / 2);
    index = {
      byId: new Map(content.regions.map((r) => [r.id, r])),
      homeCapitals: new Map([
        ...content.regions.filter((r) => r.capital).map((r) => [r.nationId, r] as const),
        // A breakaway's capital is a region of its parent.
        ...content.nations.flatMap((n) => (n.breakaway ? [[n.id, content.regions.find((r) => r.id === n.breakaway!.capitalRegion)!] as const] : [])),
      ]),
      meanPopulation: content.regions.reduce((sum, r) => sum + r.population, 0) / content.regions.length,
      medianArea: areas.length % 2 ? areas[mid]! : (areas[mid - 1]! + areas[mid]!) / 2,
    };
    regionCache.set(content, index);
  }
  lastIndex = { content, index };
  return index;
}

export function regionDef(content: Content, id: string): RegionDef {
  const region = regionIndex(content).byId.get(id);
  if (!region) throw new Error(`Unknown region "${id}"`);
  return region;
}

/** The nation's capital in content: its desired capital in Terra Invicta's terms. */
export function homeCapital(content: Content, nationId: string): RegionDef {
  return regionIndex(content).homeCapitals.get(nationId)!;
}

/** The regions each nation started with, in content order. */
export function homeRegions(content: Content, nationId: string): RegionDef[] {
  return content.regions.filter((r) => r.nationId === nationId);
}

/** Ownership as the campaign starts. */
export function startingOwners(content: Content): Record<string, string> {
  return Object.fromEntries(content.regions.map((r) => [r.id, r.nationId]));
}

// ---------------------------------------------------------------------------
// Ownership

interface OwnerIndex {
  content: Content;
  byNation: Map<string, RegionDef[]>;
  neighbors: Map<string, string[]>;
}

const ownerCache = new WeakMap<Record<string, string>, OwnerIndex>();

function ownerIndex(state: GameState, content: Content): OwnerIndex {
  let index = ownerCache.get(state.regionOwners);
  if (!index || index.content !== content) {
    const byNation = new Map<string, RegionDef[]>();
    const sets = new Map<string, Set<string>>();
    for (const r of content.regions) {
      const owner = state.regionOwners[r.id]!;
      (byNation.get(owner) ?? byNation.set(owner, []).get(owner)!).push(r);
      for (const n of r.neighbors) {
        const other = state.regionOwners[n]!;
        if (other !== owner) (sets.get(owner) ?? sets.set(owner, new Set()).get(owner)!).add(other);
      }
    }
    index = { content, byNation, neighbors: new Map([...sets].map(([k, v]) => [k, [...v].sort()])) };
    ownerCache.set(state.regionOwners, index);
  }
  return index;
}

/** The nation that holds a region now. */
export function regionOwner(state: GameState, regionId: string): string {
  return state.regionOwners[regionId]!;
}

/** A nation's regions now, in content order. Empty once it has ceased to exist. */
export function nationRegions(state: GameState, content: Content, nationId: string): RegionDef[] {
  return ownerIndex(state, content).byNation.get(nationId) ?? [];
}

/** Nations sharing a land border now, from region adjacency. */
export function nationNeighbors(state: GameState, content: Content, nationId: string): string[] {
  return ownerIndex(state, content).neighbors.get(nationId) ?? [];
}

/** A nation exists while it holds at least one region. */
export function isExtant(nation: NationState): boolean {
  return nation.capitalId !== null;
}

/** The nation's capital region, or its home capital while it doesn't exist. */
export function capitalRegion(state: GameState, content: Content, nationId: string): RegionDef {
  const id = nationState(state, nationId).capitalId;
  return id ? regionDef(content, id) : homeCapital(content, nationId);
}

/** Whether the region is the capital of the nation holding it. */
export function isCapital(state: GameState, regionId: string): boolean {
  return nationState(state, regionOwner(state, regionId)).capitalId === regionId;
}

/** Share of a nation's population living in a region: populations from content, as weights. */
export function populationShare(state: GameState, content: Content, regionId: string): number {
  const owner = regionOwner(state, regionId);
  const total = nationRegions(state, content, owner).reduce((sum, r) => sum + r.population, 0);
  return total > 0 ? regionDef(content, regionId).population / total : 0;
}

// ---------------------------------------------------------------------------
// Transfers

/** Population-weighted mean of a stat over the two parts. */
function blend(a: number, wa: number, b: number, wb: number): number {
  return wa + wb > 0 ? (a * wa + b * wb) / (wa + wb) : a;
}

/**
 * Hands a region to another nation, with its share of the old owner's population, GDP and
 * Funding (by the regions' content populations) and any launch complex in it. Education,
 * inequality and public opinion mix by population; a nation coming back into existence
 * takes the old owner's state as its own. Armies based in the region are disbanded and its
 * occupation ends. A nation left with no regions ceases to exist (see dissolveNation).
 * Returns the share of the old owner's population that went.
 */
export function transferRegion(state: GameState, content: Content, regionId: string, toId: string): number {
  const region = regionDef(content, regionId);
  const fromId = regionOwner(state, regionId);
  if (fromId === toId) return 0;
  const from = nationState(state, fromId);
  const to = nationState(state, toId);
  const share = populationShare(state, content, regionId);
  const people = from.population * share;

  if (!isExtant(to)) {
    to.education = from.education;
    to.inequality = from.inequality;
    to.democracy = from.democracy;
    to.cohesion = from.cohesion;
    to.unrest = from.unrest;
    to.militaryTech = from.militaryTech;
    to.publicOpinion = { ...from.publicOpinion };
  } else {
    to.education = blend(to.education, to.population, from.education, people);
    to.inequality = blend(to.inequality, to.population, from.inequality, people);
    const opinion: Record<string, number> = {};
    for (const key of new Set([...Object.keys(to.publicOpinion), ...Object.keys(from.publicOpinion)])) {
      opinion[key] = blend(to.publicOpinion[key] ?? 0, to.population, from.publicOpinion[key] ?? 0, people);
    }
    to.publicOpinion = opinion;
  }
  to.population += people;
  to.gdp += from.gdp * share;
  to.annualFunding += from.annualFunding * share;
  from.population -= people;
  from.gdp -= from.gdp * share;
  from.annualFunding -= from.annualFunding * share;

  // A launch complex goes with the region if the new owner has a space program to run it.
  const site = from.launchSites.find((s) => s.regionId === regionId);
  if (site) {
    const boost = boostPerCompletion(content, region.lat);
    from.launchSites = from.launchSites.filter((s) => s !== site);
    from.annualBoost = Math.max(0, from.annualBoost - boost);
    from.missionControl = Math.max(0, from.missionControl - 1);
    if (to.spaceProgram) {
      to.launchSites.push(site);
      to.annualBoost += boost;
      to.missionControl += 1;
    }
  }

  state.armies = state.armies.filter((a) => a.homeRegionId !== regionId || a.nationId === toId);
  for (const a of state.armies) if (a.annex?.regionId === regionId) a.annex = null;
  delete state.occupation[regionId];
  state.regionOwners = { ...state.regionOwners, [regionId]: toId };

  if (!isExtant(to)) to.capitalId = regionId;
  if (from.capitalId === regionId) {
    const rest = nationRegions(state, content, fromId);
    from.capitalId = rest.length > 0 ? rest.reduce((best, r) => (r.population > best.population ? r : best)).id : null;
  }
  for (const f of state.factions) {
    for (const c of f.councilors) if (c.regionId === regionId) c.locationId = toId;
  }
  syncControlPointCount(content, to);
  if (isExtant(from)) syncControlPointCount(content, from);
  else dissolveNation(state, content, from);
  pruneMilitary(state, content);
  return share;
}

/**
 * A nation without regions: no people, economy, control points, armies or relations. Its
 * breakaways become independent and it leaves its federation. The diplomatic side is left to the caller's rules, but
 * wars, alliances and rivalries are dropped here so nothing refers to a nation that isn't there.
 */
export function dissolveNation(state: GameState, content: Content, nation: NationState): void {
  nation.capitalId = null;
  nation.population = 0;
  nation.gdp = 0;
  nation.annualFunding = 0;
  nation.annualBoost = 0;
  nation.missionControl = 0;
  nation.launchSites = [];
  nation.nukes = 0;
  nation.controlPoints = [];
  nation.ipProgress = {};
  nation.unrest = 0;
  state.armies = state.armies.filter((a) => a.nationId !== nation.id);
  for (const war of [...state.wars]) {
    war.attackers = war.attackers.filter((id) => id !== nation.id);
    war.defenders = war.defenders.filter((id) => id !== nation.id);
    if (war.attackers.length === 0 || war.defenders.length === 0) state.wars.splice(state.wars.indexOf(war), 1);
  }
  const involves = (key: string) => key.split("|").includes(nation.id);
  state.diplomacy.alliances = state.diplomacy.alliances.filter((k) => !involves(k));
  for (const key of Object.keys(state.diplomacy.rivalries)) if (involves(key)) delete state.diplomacy.rivalries[key];
  for (const [child, parent] of Object.entries(state.breakaways)) if (child === nation.id || parent === nation.id) delete state.breakaways[child];
  removeFromFederation(state, content, nation.id);
  for (const [id, d] of Object.entries(state.defections)) if (id === nation.id || d.leaderId === nation.id) delete state.defections[id];
  delete state.advisors[nation.id];
  delete state.unrestRaised[nation.id];
  for (const f of state.factions) delete f.priorityWeights[nation.id];
}
