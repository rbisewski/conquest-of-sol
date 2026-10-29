// Secession after Terra Invicta (Foreign Relations, "Methods for Transferring Regions"). A
// nation with at most 3 cohesion and at least 6 unrest can lose regions: a nation that no
// longer exists may break away again in its home capital (checked daily), and regions may go
// over to a neighbour holding a peaceful claim on them (checked every 4 days). The odds are
// Terra Invicta's P% rolls; docs/formulas.md ("Claims") has them.
//
// A successful Increase Unrest mission can also set off a breakaway in the region it targets,
// and the faction that raised the most unrest in a nation takes the CPs of nations breaking
// away from it. Revolutions aren't in the game yet.
//
// Determinism note: only + − × ÷, Math.sqrt/floor/round/min/max and detmath.ts helpers.

import { hasClaim, hostileClaim, nationClaims, peacefulClaim } from "./claims";
import type { Content, RegionDef } from "./content";
import { addRivalry, areAllies } from "./diplomacy";
import { addLog, nationDef, nationState } from "./lookup";
import { nextFloat } from "./rng";
import type { GameState, NationState } from "./state";
import { homeCapital, isCapital, isExtant, nationNeighbors, nationRegions, regionOwner, transferRegion } from "./territory";

const clamp10 = (v: number) => Math.min(10, Math.max(0, v));
const name = (content: Content, id: string) => nationDef(content, id).name;

function uniform(state: GameState, lo: number, hi: number): number {
  return lo + (hi - lo) * nextFloat(state.rng);
}

/** Armies standing in a region, of any nation. */
function armiesIn(state: GameState, regionId: string): number {
  return state.armies.filter((a) => !a.move && a.regionId === regionId).length;
}

/** The faction that has raised unrest in a nation most often (Increase Unrest), if any. */
export function topUnrestRaiser(state: GameState, nationId: string): string | null {
  let best: string | null = null;
  for (const [id, amount] of Object.entries(state.unrestRaised[nationId] ?? {})) if (amount > 0 && (!best || amount > state.unrestRaised[nationId]![best]!)) best = id;
  return best;
}

/** Whether a nation in this state can lose regions. */
export function unstable(content: Content, nation: NationState): boolean {
  const s = content.rules.claims.secession;
  return isExtant(nation) && nation.cohesion <= s.maxCohesion && nation.unrest >= s.minUnrest;
}

/** The P% roll, as a 0–1 chance: hostile claims triple it, armies hold the region unless the government is liberal enough. */
function secessionChance(state: GameState, content: Content, x: NationState, region: RegionDef, score: number): number {
  const s = content.rules.claims.secession;
  let p = score;
  if (hostileClaim(state, content, x.id, region.id)) p *= s.hostileFactor;
  const armies = armiesIn(state, region.id);
  if (armies > 0 && x.democracy < s.armyGovernment) p /= s.armyDivisor * armies;
  return Math.max(0, p / s.divisor / 100);
}

/** Y becomes a breakaway of X, unless X is itself a breakaway. A breakaway is its parent's rival. */
export function markBreakaway(state: GameState, y: string, x: string): void {
  if (state.breakaways[x]) return;
  state.breakaways[y] = x;
  addRivalry(state, x, y);
}

/**
 * What happens to a nation brought back into existence by force (secession, or an army's
 * Annex Region): its new government settles in, and the nation it left calms down in
 * proportion to the people it lost. `gave` is that share of X's population.
 */
export function foundingEffects(state: GameState, content: Content, y: NationState, x: NationState, gave: number, cpOwner: string | null): void {
  for (const cp of y.controlPoints) {
    cp.owner = cpOwner;
    cp.disabledUntil = 0;
    cp.defendedUntil = 0;
  }
  y.cohesion = clamp10(y.cohesion + uniform(state, 0, 3));
  y.unrest = Math.floor(uniform(state, 0, 5));
  y.democracy = clamp10(y.democracy + uniform(state, -2, y.education / 2.25));
  y.militaryTech = Math.max(0, y.militaryTech - uniform(state, 0, 0.5));
  y.inequality = clamp10(y.inequality + uniform(state, -1, 1));
  x.unrest = clamp10(x.unrest - uniform(state, 0, 6) * gave);
  x.cohesion = clamp10(x.cohesion + uniform(state, 1, 3) * gave);
}

/**
 * Daily: each nation that no longer exists may break away from whoever holds its home
 * capital, taking with it nearby regions it peacefully claims that have no armies in them.
 */
export function checkBreakaways(state: GameState, content: Content): void {
  for (const y of state.nations) {
    if (isExtant(y)) continue;
    const home = homeCapital(content, y.id);
    // A breakaway whose claim a project unlocks waits for the project.
    if (!hasClaim(state, content, y.id, home.id)) continue;
    const x = nationState(state, regionOwner(state, home.id));
    if (!unstable(content, x) || isCapital(state, home.id)) continue;
    const chance = secessionChance(state, content, x, home, x.unrest / 2 - x.cohesion / 4 - x.democracy);
    if (chance <= 0 || nextFloat(state.rng) >= chance) continue;
    const before = x.population;
    transferRegion(state, content, home.id, y.id);
    const extra = (x.unrest * 6 - x.cohesion * 3 - x.democracy * 3) / 100;
    for (const r of [...nationRegions(state, content, x.id)]) {
      if (isCapital(state, r.id) || armiesIn(state, r.id) > 0 || !peacefulClaim(state, content, y.id, r.id)) continue;
      if (nextFloat(state.rng) < extra) transferRegion(state, content, r.id, y.id);
    }
    const gave = before > 0 ? 1 - x.population / before : 0;
    state.armies = state.armies.filter((a) => a.nationId !== y.id);
    markBreakaway(state, y.id, x.id);
    const raiser = topUnrestRaiser(state, x.id);
    if (x.democracy < 7 || raiser) addRivalry(state, x.id, y.id);
    foundingEffects(state, content, y, x, gave, raiser);
    addLog(state, { nationId: y.id, kind: "territory", text: `${name(content, y.id)} has broken away from ${name(content, x.id)}, declaring independence in ${home.name}.` });
  }
}

/**
 * Every few days: each non-capital region of an unstable nation may go over to a neighbouring,
 * non-allied nation with a peaceful claim on it, the most liberal claimant first.
 */
export function checkSecessions(state: GameState, content: Content): void {
  if (state.dayIndex % content.rules.claims.secession.neighborEveryDays !== 0) return;
  for (const x of state.nations) {
    if (!unstable(content, x)) continue;
    const claimants = nationNeighbors(state, content, x.id)
      .filter((id) => !areAllies(state, id, x.id))
      .map((id) => nationState(state, id))
      .sort((a, b) => b.democracy - a.democracy || a.id.localeCompare(b.id));
    if (claimants.length === 0) continue;
    for (const r of [...nationRegions(state, content, x.id)]) {
      if (!isExtant(x) || isCapital(state, r.id)) continue;
      for (const y of claimants) {
        if (!peacefulClaim(state, content, y.id, r.id)) continue;
        const chance = secessionChance(state, content, x, r, x.unrest - x.cohesion / 2 - x.democracy);
        if (chance <= 0 || nextFloat(state.rng) >= chance) continue;
        const gave = transferRegion(state, content, r.id, y.id);
        y.cohesion = clamp10(y.cohesion + uniform(state, 0, 2));
        x.unrest = clamp10(x.unrest - uniform(state, 0, 6) * gave);
        x.cohesion = clamp10(x.cohesion + uniform(state, 1, 3) * gave);
        if (x.democracy < 7 || topUnrestRaiser(state, x.id)) addRivalry(state, x.id, y.id);
        addLog(state, { nationId: y.id, kind: "territory", text: `${r.name} has seceded from ${name(content, x.id)} to join ${name(content, y.id)}.` });
        break;
      }
    }
  }
}

/**
 * After a successful Increase Unrest on a non-capital region: a nation that no longer exists
 * and has the region as its home capital may break away there (even under a hostile claim),
 * its CPs going to the faction that ran the mission. Terra Invicta's odds, P%:
 * base (× 10 on a critical success) / council phases a month (× 3 if the faction's project
 * gave it the claim) × (unrest − cohesion / 2) − Government, × 3 if the holder's claim is
 * hostile, ÷ (20 × armies) if there are armies and Government < 8, ÷ 300. Returns the news, or null.
 */
export function unrestBreakaway(state: GameState, content: Content, factionId: string, regionId: string, critical: boolean): string | null {
  if (isCapital(state, regionId)) return null;
  const u = content.rules.claims.unrestSecession;
  const s = content.rules.claims.secession;
  const x = nationState(state, regionOwner(state, regionId));
  const y = state.nations.find((n) => !isExtant(n) && homeCapital(content, n.id).id === regionId && hasClaim(state, content, n.id, regionId));
  if (!y) return null;
  const faction = state.factions.find((f) => f.id === factionId)!;
  const ours = (region: string) => nationClaims(state, content, y.id).some((c) => c.region === region && c.project && (faction.research.completed[c.project] ?? 0) > 0);
  const scale = (u.base * (critical ? u.criticalFactor : 1)) / content.rules.councilPhaseDays.length;
  const region = homeCapital(content, y.id);
  let p = scale * (ours(regionId) ? u.projectFactor : 1) * (x.unrest - x.cohesion / 2) - x.democracy;
  if (hostileClaim(state, content, x.id, regionId)) p *= s.hostileFactor;
  const armies = armiesIn(state, regionId);
  if (armies > 0 && x.democracy < s.armyGovernment) p /= s.armyDivisor * armies;
  if (p <= 0 || nextFloat(state.rng) >= p / u.divisor / 100) return null;

  const before = x.population;
  transferRegion(state, content, regionId, y.id);
  for (const r of [...nationRegions(state, content, x.id)]) {
    if (isCapital(state, r.id) || armiesIn(state, r.id) > 0 || !hasClaim(state, content, y.id, r.id)) continue;
    const q = hostileClaim(state, content, x.id, r.id) ? 100 : scale * (ours(r.id) ? u.projectFactor : 1) * (x.unrest * 2 - x.cohesion - x.democracy);
    if (!hostileClaim(state, content, y.id, r.id) && nextFloat(state.rng) < q / 100) transferRegion(state, content, r.id, y.id);
  }
  const gave = before > 0 ? 1 - x.population / before : 0;
  state.armies = state.armies.filter((a) => a.nationId !== y.id);
  markBreakaway(state, y.id, x.id);
  addRivalry(state, x.id, y.id);
  foundingEffects(state, content, y, x, gave, factionId);
  const text = `${name(content, y.id)} has risen again in ${region.name}, breaking away from ${name(content, x.id)}!`;
  addLog(state, { nationId: y.id, factionId, kind: "territory", tone: "good", text });
  return text;
}
