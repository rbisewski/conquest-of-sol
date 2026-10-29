// Claims after Terra Invicta (Foreign Relations, "Claims"): which regions a nation may take.
// Some are held from the start, others once any faction completes the project that unlocks
// them, and a nation that absorbs another gains its claims. A nation's claim on a region is
// hostile when history makes it so, or when the claimant's Government is 1.5 or more below
// that of the region's nation. Regions taken under a hostile claim stay hostile, costing
// cohesion and adding unrest, until Government and Unity investment reconciles them.
//
// Determinism note: only + − × ÷, Math.sqrt/floor/round/min/max and detmath.ts helpers.

import type { ClaimDef, Content } from "./content";
import { nationState } from "./lookup";
import type { GameState, NationState } from "./state";
import { nationRegions, regionDef, regionOwner, transferRegion } from "./territory";

interface ClaimIndex {
  byNation: Map<string, ClaimDef[]>;
  byRegion: Map<string, ClaimDef[]>;
  byProject: Map<string, ClaimDef[]>;
}

const indexCache = new WeakMap<Content, ClaimIndex>();

function index(content: Content): ClaimIndex {
  let i = indexCache.get(content);
  if (!i) {
    i = { byNation: new Map(), byRegion: new Map(), byProject: new Map() };
    const add = (m: Map<string, ClaimDef[]>, key: string, c: ClaimDef) => (m.get(key) ?? m.set(key, []).get(key)!).push(c);
    for (const c of content.claims) {
      add(i.byNation, c.nation, c);
      add(i.byRegion, c.region, c);
      if (c.project) add(i.byProject, c.project, c);
    }
    indexCache.set(content, i);
  }
  return i;
}

const claimKey = (nationId: string, regionId: string) => `${nationId}|${regionId}`;

/** Every claim on a region, held or not: content's and those gained in play. */
function regionClaims(state: GameState, content: Content, regionId: string): ClaimDef[] {
  const base = index(content).byRegion.get(regionId) ?? [];
  const gained = state.gainedClaims.filter((c) => c.region === regionId);
  return gained.length ? [...base, ...gained] : base;
}

/** Whether a claim holds now: from the start, or once a faction has completed its project. */
export function claimHeld(state: GameState, c: ClaimDef): boolean {
  return !c.project || state.research.takenProjects.includes(c.project) || state.factions.some((f) => (f.research.completed[c.project!] ?? 0) > 0);
}

/** The nation's held claims on a region (usually one). */
function heldClaims(state: GameState, content: Content, nationId: string, regionId: string): ClaimDef[] {
  return regionClaims(state, content, regionId).filter((c) => c.nation === nationId && claimHeld(state, c));
}

/** Whether a nation holds a claim on a region (its own regions included). */
export function hasClaim(state: GameState, content: Content, nationId: string, regionId: string): boolean {
  return heldClaims(state, content, nationId, regionId).length > 0;
}

/**
 * Whether the nation's claim on a region is hostile: settled in play, else hostile by history,
 * else when its Government trails the region's nation's by the rules' gap. A nation with
 * several claims on a region is judged by its best one.
 */
export function hostileClaim(state: GameState, content: Content, nationId: string, regionId: string): boolean {
  const status = state.claimStatus[claimKey(nationId, regionId)];
  if (status) return status === "hostile";
  const claims = heldClaims(state, content, nationId, regionId);
  if (claims.length === 0 || claims.every((c) => c.hostile)) return true;
  const owner = regionOwner(state, regionId);
  if (owner === nationId) return false;
  return nationState(state, nationId).democracy <= nationState(state, owner).democracy - content.rules.claims.hostileGovernmentGap;
}

/** Whether a nation has a claim on the region that isn't hostile. */
export function peacefulClaim(state: GameState, content: Content, nationId: string, regionId: string): boolean {
  return hasClaim(state, content, nationId, regionId) && !hostileClaim(state, content, nationId, regionId);
}

/** The claim as shown: hostile by the nation's judgement above. */
export function claimHostile(state: GameState, content: Content, c: ClaimDef): boolean {
  return hostileClaim(state, content, c.nation, c.region);
}

/** The claims a nation holds on other nations' regions. */
export function foreignClaims(state: GameState, content: Content, nationId: string): ClaimDef[] {
  return nationClaims(state, content, nationId).filter((c) => regionOwner(state, c.region) !== nationId && claimHeld(state, c));
}

/** Other nations' held claims on a region. */
export function claimsOn(state: GameState, content: Content, regionId: string): ClaimDef[] {
  const owner = regionOwner(state, regionId);
  return regionClaims(state, content, regionId).filter((c) => c.nation !== owner && claimHeld(state, c));
}

/** Every claim a nation has or can gain, held or not, including those gained in play. */
export function nationClaims(state: GameState, content: Content, nationId: string): ClaimDef[] {
  const base = index(content).byNation.get(nationId) ?? [];
  const gained = state.gainedClaims.filter((c) => c.nation === nationId);
  return gained.length ? [...base, ...gained] : base;
}

/** The claims a project unlocks. */
export function projectClaims(content: Content, projectId: string): ClaimDef[] {
  return index(content).byProject.get(projectId) ?? [];
}

/**
 * Hands a region to a claimant. A region taken under a hostile claim stays hostile to its new
 * nation (the people don't change their minds when the Government gap closes). Returns the
 * share of the old owner's population that went.
 */
export function takeRegion(state: GameState, content: Content, regionId: string, toId: string): number {
  if (hasClaim(state, content, toId, regionId) && hostileClaim(state, content, toId, regionId)) state.claimStatus[claimKey(toId, regionId)] = "hostile";
  return transferRegion(state, content, regionId, toId);
}

/**
 * A nation that absorbs another takes over its held claims, hostile ones staying hostile.
 * Call before the regions move, while the absorbed nation's claims still judge as its own.
 */
export function inheritClaims(state: GameState, content: Content, fromId: string, toId: string): void {
  for (const c of nationClaims(state, content, fromId)) {
    if (!claimHeld(state, c) || hasClaim(state, content, toId, c.region)) continue;
    const hostile = hostileClaim(state, content, fromId, c.region);
    state.gainedClaims.push({ nation: toId, region: c.region, ...(hostile ? { hostile: true } : {}) });
  }
}

// A nation's claims on its own regions don't depend on Governments, so the hostile share only
// changes with borders, settled claims, claims gained and research (project claims).
const shareCache = new WeakMap<Record<string, string>, { key: string; shares: Map<string, number> }>();

/** Share of the nation's population living in regions it holds under a hostile claim. */
export function hostileShare(state: GameState, content: Content, nation: NationState): number {
  const statuses = Object.values(state.claimStatus);
  const key = `${statuses.length}|${statuses.filter((v) => v === "hostile").length}|${state.gainedClaims.length}|${state.research.version}|${state.research.takenProjects.length}`;
  let cache = shareCache.get(state.regionOwners);
  if (!cache || cache.key !== key) shareCache.set(state.regionOwners, (cache = { key, shares: new Map() }));
  let share = cache.shares.get(nation.id);
  if (share === undefined) cache.shares.set(nation.id, (share = computeHostileShare(state, content, nation)));
  return share;
}

function computeHostileShare(state: GameState, content: Content, nation: NationState): number {
  let total = 0;
  let hostile = 0;
  for (const r of nationRegions(state, content, nation.id)) {
    total += r.population;
    if (hostileClaim(state, content, nation.id, r.id)) hostile += r.population;
  }
  return total > 0 ? hostile / total : 0;
}

/** Terra Invicta's hostile-claim penalties to Base Unrest and Base Cohesion. */
export function hostilePenalties(state: GameState, content: Content, nation: NationState): { unrest: number; cohesion: number } {
  const share = hostileShare(state, content, nation);
  const k = content.rules.claims.hostilePenalty;
  return { unrest: k * share * (10 - nation.democracy), cohesion: k * share * nation.democracy };
}

/**
 * Government and Unity completions reconcile hostile regions: every rules.claims.integration
 * of them makes one hostile claim on the nation's own regions peaceful. Candidates next to a
 * peaceful region of the nation come first, then the most populous.
 */
export function integrate(state: GameState, content: Content, nation: NationState): string | null {
  nation.integration += 1;
  if (nation.integration < content.rules.claims.integration) return null;
  const regions = nationRegions(state, content, nation.id);
  const hostile = regions.filter((r) => hostileClaim(state, content, nation.id, r.id));
  if (hostile.length === 0) return null;
  nation.integration -= content.rules.claims.integration;
  const peaceful = new Set(regions.filter((r) => !hostile.includes(r)).map((r) => r.id));
  const adjacent = hostile.filter((r) => r.neighbors.some((n) => peaceful.has(n)));
  const pool = adjacent.length > 0 ? adjacent : hostile;
  const chosen = pool.reduce((best, r) => (r.population > best.population ? r : best));
  state.claimStatus[claimKey(nation.id, chosen.id)] = "peaceful";
  return regionDef(content, chosen.id).name;
}
