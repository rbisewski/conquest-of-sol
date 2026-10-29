// Terrestrial warfare (SPEC 2.6.4) after Terra Invicta's current release (SPEC D11, D13):
// armies in regions, movement, daily combat, occupation, healing and losses. Relations,
// wars and conquest are in diplomacy.ts. Nuclear strikes are at the end. docs/formulas.md ("Armies and war") lists every
// rule with its source, and the values we had to infer.
//
// Determinism note: only + − × ÷, Math.sqrt/floor/round/min/max and detmath.ts helpers.
// Distances come from the regions' precomputed unit vectors, never from trig.

import { nuclearStrikeAerosols } from "./climate";
import type { Content, RegionDef } from "./content";
import { advisorBonus, removeCouncilor } from "./councilors";
import { detPow } from "./detmath";
import { hasClaim, takeRegion } from "./claims";
import { addAlliance, areAllies, atWar, checkExecutive, enemiesOf, resolveConquests, sideOf, warBetween, type Check } from "./diplomacy";
import { addLog, factionDef, nationDef, nationState, newId } from "./lookup";
import { foundingEffects, markBreakaway } from "./secession";
import { applyPropaganda } from "./missions";
import { isDisabled } from "./nation";
import { nextFloat, nextInt } from "./rng";
import { STRIKE_LIMIT, type ArmyState, type GameState, type NationState } from "./state";
import { capitalRegion, homeCapital, isCapital, isExtant, nationRegions, populationShare, regionDef, regionIndex, regionOwner, transferRegion } from "./territory";
import { currentMinute, MINUTES_PER_DAY } from "./time";

// ---------------------------------------------------------------------------
// Regions

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance between region centres: 2·asin(chord / 2) by its Taylor series. */
export function distanceKm(a: RegionDef, b: RegionDef): number {
  const dx = a.xyz[0] - b.xyz[0];
  const dy = a.xyz[1] - b.xyz[1];
  const dz = a.xyz[2] - b.xyz[2];
  const h = Math.min(1, Math.sqrt(dx * dx + dy * dy + dz * dz) / 2);
  // asin(h) = Σ (2n)! / (4ⁿ (n!)² (2n+1)) h^(2n+1); exact to <0.5% up to 150°, 7% short at the antipode.
  const h2 = h * h;
  let term = h;
  let sum = h;
  for (let n = 1; n < 24; n++) {
    term *= (h2 * (2 * n - 1) * (2 * n - 1)) / (2 * n * (2 * n + 1));
    sum += term;
  }
  return 2 * sum * EARTH_RADIUS_KM;
}

/** Share of the region occupied by enemies, 0–1. */
export function occupiedShare(state: GameState, regionId: string): number {
  const shares = state.occupation[regionId];
  if (!shares) return 0;
  let total = 0;
  for (const share of Object.values(shares)) total += share;
  return Math.min(1, total);
}

export function isFullyOccupied(state: GameState, regionId: string): boolean {
  return occupiedShare(state, regionId) >= 1 - 1e-9;
}

/** A region is friendly to a nation's armies when it belongs to the nation or an ally. */
export function isFriendlyRegion(state: GameState, content: Content, nationId: string, regionId: string): boolean {
  const owner = regionOwner(state, regionId);
  return owner === nationId || areAllies(state, owner, nationId);
}

/** Health of the friendly armies (the owner's and its allies') standing in each nation. */
export function friendlyArmyHealth(state: GameState, content: Content): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of state.armies) {
    if (a.move) continue;
    const owner = regionOwner(state, a.regionId);
    if (owner === a.nationId || areAllies(state, owner, a.nationId)) out.set(owner, (out.get(owner) ?? 0) + a.health);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Armies

export function nationArmies(state: GameState, nationId: string): ArmyState[] {
  return state.armies.filter((a) => a.nationId === nationId);
}

export function navyCount(state: GameState, nationId: string): number {
  return state.armies.reduce((n, a) => n + (a.nationId === nationId && a.navy ? 1 : 0), 0);
}

/** Armies answer to their nation's CPs in turn, starting with the Executive. */
export function armyControlPoint(state: GameState, army: ArmyState): number {
  const cps = nationState(state, army.nationId).controlPoints.length;
  return nationArmies(state, army.nationId).indexOf(army) % cps;
}

/** The faction commanding the army: whoever holds its CP. Null means the nation's own AI. */
export function armyCommander(state: GameState, army: ArmyState): string | null {
  return nationState(state, army.nationId).controlPoints[armyControlPoint(state, army)]?.owner ?? null;
}

export function armyName(_state: GameState, _content: Content, army: ArmyState): string {
  return army.name;
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;

/** The nation's first formation name not in use, from content.armyNames; then "1st Division", "2nd Division"… */
export function nextArmyName(state: GameState, content: Content, nationId: string): string {
  const taken = new Set(nationArmies(state, nationId).map((a) => a.name));
  const free = (content.armyNames[nationId] ?? []).find((name) => !taken.has(name));
  if (free) return free;
  for (let n = 1; ; n++) if (!taken.has(`${ordinal(n)} Division`)) return `${ordinal(n)} Division`;
}

/** Armies may be at home, in allied nations, or in nations their nation is at war with. */
export function mayEnter(state: GameState, content: Content, army: ArmyState, regionId: string): boolean {
  const owner = regionOwner(state, regionId);
  return owner === army.nationId || areAllies(state, owner, army.nationId) || atWar(state, owner, army.nationId);
}

/** Sum of the Miltech of a side's navies. */
function navalScore(state: GameState, nations: string[]): number {
  let score = 0;
  for (const a of state.armies) if (a.navy && nations.includes(a.nationId)) score += nationState(state, a.nationId).militaryTech;
  return score;
}

/** A nation is blockaded when, in any of its wars, the other side's navies outscore its side's. */
export function navalFreedom(state: GameState, nationId: string): boolean {
  for (const war of state.wars) {
    const ours = war.attackers.includes(nationId) ? war.attackers : war.defenders.includes(nationId) ? war.defenders : null;
    if (!ours) continue;
    const theirs = ours === war.attackers ? war.defenders : war.attackers;
    if (navalScore(state, theirs) > navalScore(state, ours)) return false;
  }
  return true;
}

/** Terra Invicta's Estimated Military Strength, used to pick war leaders and by the AI. */
export function militaryStrength(state: GameState, content: Content, nation: NationState): number {
  const s = content.rules.military.strength;
  const mil = nation.militaryTech;
  let total = 0;
  for (const r of nationRegions(state, content, nation.id)) if (!isFullyOccupied(state, r.id)) total += mil * s.perRegion;
  for (const a of state.armies) {
    if (a.nationId !== nation.id) continue;
    total += mil * s.perArmy * a.health;
    if (a.navy) total += s.perNavy;
  }
  total += nation.unrest * s.perUnrest;
  if (nation.nukes > 0) total += s.hasNukes + nation.nukes * s.perNuke;
  return total;
}

/** Regions in the order new armies take them as headquarters: the capital, then by population. */
function headquartersOrder(state: GameState, content: Content, nationId: string): RegionDef[] {
  const capital = capitalRegion(state, content, nationId).id;
  return [...nationRegions(state, content, nationId)].sort((a, b) => Number(b.id === capital) - Number(a.id === capital) || b.population - a.population);
}

/** A new army, headquartered in the region with the fewest armies (capital first). */
export function raiseArmy(state: GameState, content: Content, nationId: string): ArmyState {
  const counts = new Map<string, number>();
  for (const a of state.armies) if (a.nationId === nationId) counts.set(a.homeRegionId, (counts.get(a.homeRegionId) ?? 0) + 1);
  let home = headquartersOrder(state, content, nationId)[0]!;
  for (const r of headquartersOrder(state, content, nationId)) if ((counts.get(r.id) ?? 0) < (counts.get(home.id) ?? 0)) home = r;
  const army: ArmyState = { id: newId(state, "a"), nationId, name: nextArmyName(state, content, nationId), homeRegionId: home.id, regionId: home.id, health: 1, navy: false, move: null, annex: null };
  state.armies.push(army);
  return army;
}

/** A new navy goes to an army without one, preferring armies based on the coast. Returns false if every army has one. */
export function equipNavy(state: GameState, content: Content, nationId: string): boolean {
  const candidates = nationArmies(state, nationId).filter((a) => !a.navy);
  const army = candidates.find((a) => regionDef(content, a.homeRegionId).coastal) ?? candidates[0];
  if (!army) return false;
  army.navy = true;
  return true;
}

// ---------------------------------------------------------------------------
// Movement

export type MoveCheck = { ok: true; naval: boolean; days: number } | { ok: false; reason: string };

function smallRegion(content: Content, region: RegionDef): boolean {
  return region.areaKm2 < content.rules.military.smallRegionKm2;
}

/** Days to cross from one region to an adjacent one over land, with Terra Invicta's multipliers. */
function landDays(state: GameState, content: Content, army: ArmyState, from: RegionDef, to: RegionDef): number {
  const r = content.rules.military;
  const miltech = Math.max(0.5, nationState(state, army.nationId).militaryTech);
  let days = (distanceKm(from, to) / r.landKmPerDay) * (r.speedMiltech / miltech);
  // The exponents shift the slowdown onto whichever end of the move is the larger region.
  const fromSmall = smallRegion(content, from);
  const toSmall = smallRegion(content, to);
  const fromExp = fromSmall && !toSmall ? 0.2 : !fromSmall && toSmall ? 0.8 : 0.5;
  const toExp = fromSmall && !toSmall ? 0.8 : !fromSmall && toSmall ? 0.2 : 0.5;
  const unrestFactor = (nationId: string) => 1 + (nationState(state, nationId).unrest - 5) / r.unrestMoveDivisor;
  const enemiesAtOrigin = state.armies.some((a) => !a.move && a.regionId === from.id && atWar(state, a.nationId, army.nationId));
  if (!isFriendlyRegion(state, content, army.nationId, from.id) || enemiesAtOrigin) days *= detPow(r.hostileMoveFactor, fromExp);
  else if (nationState(state, regionOwner(state, from.id)).unrest > 5) days *= detPow(unrestFactor(regionOwner(state, from.id)), fromExp);
  if (!isFriendlyRegion(state, content, army.nationId, to.id)) days *= detPow(r.hostileMoveFactor, toExp);
  else if (nationState(state, regionOwner(state, to.id)).unrest > 5) days *= detPow(unrestFactor(regionOwner(state, to.id)), toExp);
  return days;
}

/** Days to sail between two coastal regions. Real sea routes (canals, straits) are not modelled. */
function navalDays(state: GameState, content: Content, army: ArmyState, from: RegionDef, to: RegionDef): number {
  const r = content.rules.military;
  const miltech = Math.max(0.5, nationState(state, army.nationId).militaryTech);
  return (r.navalBaseDays + distanceKm(from, to) / r.navalKmPerDay) * (r.speedMiltech / miltech);
}

/** Whether the army can set off for a region now: an adjacent region, or any coastal one by sea. */
export function checkMove(state: GameState, content: Content, army: ArmyState, toRegionId: string): MoveCheck {
  if (army.move) return { ok: false, reason: "The army is already on the move" };
  if (toRegionId === army.regionId) return { ok: false, reason: "The army is already there" };
  const from = regionDef(content, army.regionId);
  const to = regionDef(content, toRegionId);
  if (!mayEnter(state, content, army, to.id)) return { ok: false, reason: `${nationDef(content, regionOwner(state, to.id)).name} is neither an ally nor at war with us` };
  if (from.neighbors.includes(to.id)) return { ok: true, naval: false, days: landDays(state, content, army, from, to) };
  if (!army.navy) return { ok: false, reason: "Only adjacent regions can be reached without a navy" };
  if (!from.coastal || !to.coastal) return { ok: false, reason: "Sailing needs a coastal region at both ends" };
  if (!navalFreedom(state, army.nationId)) return { ok: false, reason: "Our navies are blockaded" };
  return { ok: true, naval: true, days: navalDays(state, content, army, from, to) };
}

/** Minutes from now, never on a midnight, so arrivals don't coincide with the daily tick. */
function arrivalMinute(state: GameState, days: number): number {
  const at = currentMinute(state) + Math.max(1, Math.round(days * MINUTES_PER_DAY));
  return at % MINUTES_PER_DAY === 0 ? at + 1 : at;
}

export function startMove(state: GameState, army: ArmyState, toRegionId: string, days: number, naval: boolean, airlift = false): void {
  army.move = { toRegionId, departAt: currentMinute(state), arriveAt: arrivalMinute(state, days), naval, ...(airlift ? { airlift: true as const } : {}) };
}

/** Peacetime only: the army flies straight back to its headquarters. */
export function checkAirlift(state: GameState, content: Content, army: ArmyState): MoveCheck {
  if (army.move) return { ok: false, reason: "The army is already on the move" };
  if (army.regionId === army.homeRegionId) return { ok: false, reason: "The army is already at its headquarters" };
  if (enemiesOf(state, army.nationId).size > 0) return { ok: false, reason: "Armies can't be airlifted home while their nation is at war" };
  const r = content.rules.military;
  const miltech = Math.max(0.5, nationState(state, army.nationId).militaryTech);
  const km = distanceKm(regionDef(content, army.regionId), regionDef(content, army.homeRegionId));
  return { ok: true, naval: true, days: (r.airliftBaseDays + km / r.navalKmPerDay) * (r.speedMiltech / miltech) };
}

/** The earliest minute at which a moving army arrives, or Infinity. */
export function nextArrival(state: GameState): number {
  let next = Infinity;
  for (const a of state.armies) if (a.move && a.move.arriveAt < next) next = a.move.arriveAt;
  return next;
}

/** Lands every army whose move ends by now. */
export function arriveArmies(state: GameState): void {
  const now = currentMinute(state);
  for (const a of state.armies) {
    if (a.move && a.move.arriveAt <= now) {
      a.regionId = a.move.toRegionId;
      a.move = null;
    }
  }
}

/**
 * After relations change: occupations by nations no longer at war with the owner end, and
 * armies left where they may no longer be go home (moves into such regions are called off).
 */
export function pruneMilitary(state: GameState, content: Content): void {
  for (const [regionId, shares] of Object.entries(state.occupation)) {
    const owner = regionOwner(state, regionId);
    for (const occupier of Object.keys(shares)) if (!atWar(state, occupier, owner)) delete shares[occupier];
    if (Object.keys(shares).length === 0) delete state.occupation[regionId];
  }
  for (const army of state.armies) {
    if (army.move && !mayEnter(state, content, army, army.move.toRegionId)) army.move = null;
    if (!army.move && !mayEnter(state, content, army, army.regionId)) army.regionId = army.homeRegionId;
  }
}

// ---------------------------------------------------------------------------
// Combat

/** Terra Invicta's hit chance: 50% at equal Miltech, 0.775^(1.5·Δ) on the losing side. */
export function hitChance(content: Content, attack: number, defense: number): number {
  const r = content.rules.military;
  const tail = 0.5 * detPow(r.hitBase, r.hitExponent * Math.abs(attack - defense));
  return attack > defense ? 1 - tail : tail;
}

/** An army's Miltech in a region: attacking (A) adds the host nation's cohesion; defending (B) doesn't. */
export function armyMiltech(state: GameState, content: Content, army: ArmyState, regionId: string, attacking: boolean): number {
  const r = content.rules.military;
  const home = nationState(state, army.nationId);
  const owner = regionOwner(state, regionId);
  let miltech = home.militaryTech + advisorBonus(state, home.id, "command") / 100;
  if (owner === army.nationId) miltech += r.homeBonus;
  if (isDisabled(state, home, armyControlPoint(state, army))) miltech -= r.disabledCpPenalty;
  if (attacking && isFriendlyRegion(state, content, army.nationId, regionId)) miltech += r.cohesionBonus * nationState(state, owner).cohesion;
  return Math.max(0, miltech * (1 - r.lostHealthEffect * (1 - army.health)));
}

/** The region's own defenses: militia and fortifications, helped by calm neighbouring regions. */
export function regionMiltech(state: GameState, content: Content, region: RegionDef, contested: Set<string>): number {
  const r = content.rules.military;
  const owner = nationState(state, regionOwner(state, region.id));
  if (!owner.militaryFounded) return 0;
  let miltech = owner.militaryTech + advisorBonus(state, owner.id, "command") / 100 + r.cohesionBonus * owner.cohesion - r.unrestPenalty * owner.unrest;
  const same = region.neighbors.filter((id) => regionOwner(state, id) === owner.id);
  if (same.length > 0) {
    const calm = same.filter((id) => occupiedShare(state, id) === 0 && !contested.has(id)).length;
    miltech += (calm / same.length) * owner.militaryTech * r.adjacentRegionBonus * (1 - r.unrestPenalty * owner.unrest);
  }
  return Math.max(0, miltech * (1 - r.occupationEffect * occupiedShare(state, region.id)));
}

function uniform(state: GameState, lo: number, hi: number): number {
  return lo + (hi - lo) * nextFloat(state.rng);
}

/** Big, populous regions take longer to fight over. */
function regionActionMultiplier(content: Content, region: RegionDef): number {
  const index = regionIndex(content);
  return 2 / (detPow(region.population / index.meanPopulation, 0.75) + Math.sqrt(region.areaKm2 / index.medianArea));
}

/**
 * Critical multiplier for shots by or at region defenses. y is the crit chance in percent.
 * A fresh army against an untouched region gets the 100× opening shock.
 */
function regionCritical(state: GameState, y: number, fresh: boolean): number {
  const p = Math.min(1, y / 100);
  let z = nextFloat(state.rng) < p ? 40 : 1;
  if (fresh) z = 100;
  else if (nextFloat(state.rng) < p) z = 40;
  if (z < 40 && p < 1 && nextFloat(state.rng) < p / (1 - p)) z = 5;
  return z;
}

const effectiveness = (content: Content, a: ArmyState) => 1 - content.rules.military.lostHealthEffect * (1 - a.health);

/**
 * One day of war, region by region in content order: armies trade fire, region defenses
 * fire at invaders, invaders that aren't held up take ground, and owners win back regions
 * the invaders have left. Then healing, losses and capital captures.
 */
export function runMilitaryTick(state: GameState, content: Content): void {
  if (state.armies.length === 0 && Object.keys(state.occupation).length === 0) return;
  const r = content.rules.military;
  const present = new Map<string, ArmyState[]>();
  for (const a of state.armies) if (!a.move) present.set(a.regionId, [...(present.get(a.regionId) ?? []), a]);

  const hostileTo = (a: ArmyState, owner: string) => atWar(state, a.nationId, owner);
  const contested = new Set<string>();
  for (const [regionId, here] of present) {
    const owner = regionOwner(state, regionId);
    if (here.some((a) => hostileTo(a, owner) || here.some((b) => atWar(state, a.nationId, b.nationId)))) contested.add(regionId);
  }

  const damage = new Map<ArmyState, number>();
  const hurt = (a: ArmyState, amount: number) => damage.set(a, (damage.get(a) ?? 0) + amount);

  for (const region of content.regions) {
    const here = present.get(region.id) ?? [];
    if (here.length === 0 && !state.occupation[region.id]) continue;
    const owner = regionOwner(state, region.id);
    const startShare = occupiedShare(state, region.id);
    const invaders = here.filter((a) => hostileTo(a, owner));
    const defenders = here.filter((a) => !hostileTo(a, owner) && invaders.some((h) => atWar(state, a.nationId, h.nationId)));
    const fighting = here.filter((a) => here.some((b) => atWar(state, a.nationId, b.nationId)));
    const regionStrength = invaders.length > 0 ? regionMiltech(state, content, region, contested) : 0;
    // Region crits grow with the crowd: defenders × invaders².
    const y = defenders.length * invaders.length * invaders.length;

    for (const a of here) {
      const enemies = here.filter((b) => atWar(state, a.nationId, b.nationId));
      let fired = false;
      if (enemies.length > 0) {
        const target = enemies[nextInt(state.rng, 0, enemies.length - 1)]!;
        const attack = armyMiltech(state, content, a, region.id, true);
        if (nextFloat(state.rng) < hitChance(content, attack, armyMiltech(state, content, target, region.id, false))) {
          let z = nextFloat(state.rng) < Math.min(1, (fighting.length * fighting.length) / 100) ? 3 : 1;
          // Ambush: a fresh army fighting over untouched ground.
          if (a.health >= 1 && startShare === 0) z = 3;
          hurt(target, attack * r.armyDamage * uniform(state, 0.8, 1.2) * z);
        }
        fired = true;
      }
      if (!invaders.includes(a) || isFullyOccupied(state, region.id)) continue;
      const fresh = startShare === 0 && a.health >= 1;
      if (nextFloat(state.rng) < hitChance(content, regionStrength, armyMiltech(state, content, a, region.id, true))) {
        let x = regionStrength * r.regionDamage * uniform(state, 0.8, 1.2) * regionCritical(state, y, fresh);
        const h = invaders.reduce((sum, b) => sum + effectiveness(content, b), 0);
        const f = defenders.reduce((sum, b) => sum + effectiveness(content, b), 0);
        // Outnumbered defenses fire less.
        if (h - f > 0) x *= 1 - (h - f) / (h - f + 2);
        hurt(a, x);
      } else if (!fired) {
        // The army takes ground: faster with better Miltech than the defender's base.
        const miltech = armyMiltech(state, content, a, region.id, true);
        let x = miltech + Math.max(0, miltech - nationState(state, owner).militaryTech);
        x *= r.occupationRate * uniform(state, 0.8, 1.2) * regionActionMultiplier(content, region) * regionCritical(state, y, fresh);
        const crowding = invaders.length - region.areaKm2 / r.crowdingAreaKm2;
        if (crowding > 0) x *= Math.max(1 - crowding * r.crowdingPenalty, r.crowdingFloor);
        x = Math.min(x, r.maxOccupationPerHit, 1 - occupiedShare(state, region.id));
        if (x > 0) {
          const shares = (state.occupation[region.id] ??= {});
          shares[a.nationId] = (shares[a.nationId] ?? 0) + x;
          if (isFullyOccupied(state, region.id)) {
            addLog(state, { nationId: owner, kind: "war", text: `${nationDef(content, a.nationId).name} has occupied ${region.name}, ${nationDef(content, owner).name}.` });
          }
        }
      }
    }

    // Once the invaders are gone, the owner's (and allies') armies drive the occupiers out;
    // with nobody there, a partial occupation fades.
    if (invaders.length === 0 && startShare > 0) {
      const liberators = here.filter((a) => isFriendlyRegion(state, content, a.nationId, region.id));
      let relief = 0;
      if (liberators.length > 0) relief = regionMiltech(state, content, region, contested) * r.liberationRate * uniform(state, 0.8, 1.2) * liberators.length;
      else if (!isFullyOccupied(state, region.id)) relief = r.occupationDecay;
      relieve(state, content, region, relief);
    }
  }

  // Healing: in a friendly, untroubled region with no fight on.
  const h = r.heal;
  for (const a of state.armies) {
    if (a.move || damage.has(a) || a.health >= 1 || contested.has(a.regionId)) continue;
    if (!isFriendlyRegion(state, content, a.nationId, a.regionId) || occupiedShare(state, a.regionId) > 0) continue;
    let rate = h.base;
    if (regionOwner(state, a.regionId) === a.nationId) rate += h.homeNation;
    if (a.regionId === a.homeRegionId) rate += h.homeRegion;
    a.health = Math.min(1, a.health + rate);
  }
  for (const a of state.armies) {
    const d = damage.get(a);
    if (d) a.health = Math.max(0, a.health - d);
  }
  for (const a of state.armies.filter((army) => army.health <= 0)) destroyArmy(state, content, a);

  runAnnexations(state, content);
  resolveConquests(state, content);
}

/** Takes `amount` of occupation off a region, from every occupier in proportion. */
function relieve(state: GameState, content: Content, region: RegionDef, amount: number): void {
  const shares = state.occupation[region.id];
  if (!shares || amount <= 0) return;
  const total = occupiedShare(state, region.id);
  const keep = Math.max(0, total - amount) / total;
  for (const id of Object.keys(shares)) {
    shares[id]! *= keep;
    if (shares[id]! < 1e-6) delete shares[id];
  }
  if (Object.keys(shares).length === 0) {
    const owner = regionOwner(state, region.id);
    delete state.occupation[region.id];
    addLog(state, { nationId: owner, kind: "war", text: `${region.name}, ${nationDef(content, owner).name}, is free of occupation.` });
  }
}

/**
 * An army is destroyed. Democracies lose cohesion and the commanding faction loses support;
 * part of the army's cost goes back into the Build Army (and Build Navy) priorities.
 */
export function destroyArmy(state: GameState, content: Content, army: ArmyState, byNuke = false): void {
  const r = content.rules.military;
  const nation = nationState(state, army.nationId);
  const commander = armyCommander(state, army);
  const name = armyName(state, content, army);
  const where = regionDef(content, army.regionId);
  state.armies.splice(state.armies.indexOf(army), 1);

  if (nation.democracy >= 5) {
    nation.cohesion = Math.max(0, nation.cohesion - nation.democracy / 10);
    if (commander) applyPropaganda(content, nation, commander, -nation.democracy);
  }
  const atHome = regionOwner(state, where.id) === nation.id;
  const cost = (id: string) => content.priorities.find((p) => p.id === id)?.cost ?? 0;
  if (!byNuke) {
    const [lo, hi] = atHome ? r.armyRefund.home : r.armyRefund.abroad;
    nation.ipProgress["build-army"] = (nation.ipProgress["build-army"] ?? 0) + cost("build-army") * uniform(state, lo, hi);
  }
  if (army.navy) {
    const [lo, hi] = !navalFreedom(state, nation.id) ? r.navyRefund.blockaded : atHome ? r.navyRefund.home : r.navyRefund.abroad;
    nation.ipProgress["build-navy"] = (nation.ipProgress["build-navy"] ?? 0) + cost("build-navy") * uniform(state, lo, hi);
  }
  addLog(state, { nationId: nation.id, factionId: commander ?? undefined, kind: "war", ...(commander ? { tone: "bad" as const } : {}), text: `${name} (${nationDef(content, nation.id).name}) was destroyed in ${where.name}${where.name.endsWith(".") ? "" : "."}` });
}

// ---------------------------------------------------------------------------
// Annex Region

/** The nation that no longer exists and would come back in this region (its home capital), if any. */
export function nationToRestore(state: GameState, content: Content, regionId: string): string | null {
  return state.nations.find((n) => !isExtant(n) && homeCapital(content, n.id).id === regionId && hasClaim(state, content, n.id, regionId))?.id ?? null;
}

/** Whether the army's war alliance (against the region's nation) holds all of the region. */
function heldByAlliance(state: GameState, army: ArmyState, owner: string, regionId: string): boolean {
  const war = warBetween(state, army.nationId, owner);
  if (!war) return false;
  const side = war[sideOf(war, army.nationId)!];
  const shares = state.occupation[regionId] ?? {};
  return side.reduce((sum, id) => sum + (shares[id] ?? 0), 0) >= 1 - 1e-9;
}

/** Terra Invicta: 45 × ((population / mean)^0.75 + (area / median)^0.5), 45–270 days, × their Miltech / ours. */
export function annexDays(state: GameState, content: Content, army: ArmyState, region: RegionDef): number {
  const a = content.rules.claims.annex;
  const index = regionIndex(content);
  const days = a.baseDays * (detPow(region.population / index.meanPopulation, 0.75) + Math.sqrt(region.areaKm2 / index.medianArea));
  const theirs = nationState(state, regionOwner(state, region.id)).militaryTech;
  return (Math.min(a.maxDays, Math.max(a.minDays, days)) * Math.max(0.5, theirs)) / Math.max(0.5, nationState(state, army.nationId).militaryTech);
}

export type AnnexCheck = { ok: true; days: number; restores: string | null } | { ok: false; reason: string };

/**
 * Terra Invicta's Annex Region: an army at 80% health or more, not fighting, in a region its
 * war alliance fully occupies, that isn't the enemy's capital, where its nation has a claim
 * (hostile or not) or a nation that no longer exists would come back.
 */
export function checkAnnex(state: GameState, content: Content, army: ArmyState): AnnexCheck {
  if (army.move) return { ok: false, reason: "The army is on the move" };
  if (army.annex) return { ok: false, reason: "The army is already annexing the region" };
  const region = regionDef(content, army.regionId);
  const owner = regionOwner(state, region.id);
  if (!atWar(state, army.nationId, owner)) return { ok: false, reason: `We aren't at war with ${nationDef(content, owner).name}` };
  if (army.health < content.rules.claims.annex.minHealth) return { ok: false, reason: `Needs ${Math.round(content.rules.claims.annex.minHealth * 100)}% health` };
  if (state.armies.some((b) => !b.move && b.regionId === region.id && atWar(state, army.nationId, b.nationId))) return { ok: false, reason: "The army is in battle" };
  if (state.armies.some((b) => b !== army && b.annex?.regionId === region.id)) return { ok: false, reason: "Another army is already annexing the region" };
  if (isCapital(state, region.id)) return { ok: false, reason: `${region.name} is the capital: take it to conquer the nation` };
  if (!heldByAlliance(state, army, owner, region.id)) return { ok: false, reason: "Our side must fully occupy the region first" };
  const claim = hasClaim(state, content, army.nationId, region.id);
  const restores = claim ? null : nationToRestore(state, content, region.id);
  if (!claim && !restores) return { ok: false, reason: `${nationDef(content, army.nationId).name} has no claim on ${region.name}` };
  return { ok: true, days: annexDays(state, content, army, region), restores };
}

export function startAnnex(state: GameState, army: ArmyState, days: number): void {
  army.annex = { regionId: army.regionId, doneDay: state.dayIndex + Math.max(1, Math.round(days)) };
}

/** Daily: annexations go on while the army stays and its side holds the region, and complete on their day. */
function runAnnexations(state: GameState, content: Content): void {
  for (const army of [...state.armies]) {
    const annex = army.annex;
    if (!annex || !state.armies.includes(army)) continue;
    const owner = regionOwner(state, annex.regionId);
    const fighting = state.armies.some((b) => !b.move && b.regionId === annex.regionId && atWar(state, army.nationId, b.nationId));
    if (army.move || army.regionId !== annex.regionId || fighting || !atWar(state, army.nationId, owner) || !heldByAlliance(state, army, owner, annex.regionId)) {
      army.annex = null;
      continue;
    }
    if (state.dayIndex < annex.doneDay) continue;
    army.annex = null;
    completeAnnex(state, content, army, annex.regionId, owner);
  }
}

function completeAnnex(state: GameState, content: Content, army: ArmyState, regionId: string, from: string): void {
  const region = regionDef(content, regionId);
  const commander = armyCommander(state, army);
  const nationName = (id: string) => nationDef(content, id).name;
  if (hasClaim(state, content, army.nationId, regionId)) {
    takeRegion(state, content, regionId, army.nationId);
    addLog(state, { nationId: army.nationId, factionId: commander ?? undefined, kind: "territory", ...(commander ? { tone: "good" as const } : {}), text: `${nationName(army.nationId)} annexed ${region.name} from ${nationName(from)}.` });
    return;
  }
  const restored = nationToRestore(state, content, regionId);
  if (!restored) return;
  const x = nationState(state, from);
  const y = nationState(state, restored);
  const war = warBetween(state, army.nationId, from);
  const gave = transferRegion(state, content, regionId, restored);
  addAlliance(state, restored, army.nationId);
  markBreakaway(state, restored, from);
  foundingEffects(state, content, y, x, gave, commander);
  // The nation it was taken from declares war on it at once.
  if (war && !war[sideOf(war, army.nationId)!].includes(restored)) war[sideOf(war, army.nationId)!].push(restored);
  addLog(state, { nationId: restored, factionId: commander ?? undefined, kind: "territory", ...(commander ? { tone: "good" as const } : {}), text: `${nationName(army.nationId)} has restored ${nationName(restored)} in ${region.name}, freed from ${nationName(from)}.` });
}

/** What an army is doing, for the UI. */
export function armyActivity(state: GameState, content: Content, army: ArmyState): string {
  if (army.move) return `${army.move.airlift ? "Flying" : army.move.naval ? "Sailing" : "Moving"} to ${regionDef(content, army.move.toRegionId).name}`;
  if (army.annex) {
    const days = army.annex.doneDay - state.dayIndex;
    return `Annexing ${regionDef(content, army.annex.regionId).name} (${days} day${days === 1 ? "" : "s"} left)`;
  }
  const region = regionDef(content, army.regionId);
  if (state.armies.some((b) => !b.move && b.regionId === army.regionId && atWar(state, army.nationId, b.nationId))) return `Fighting in ${region.name}`;
  if (atWar(state, army.nationId, regionOwner(state, region.id))) {
    const share = Math.round((state.occupation[region.id]?.[army.nationId] ?? 0) * 100);
    return isFullyOccupied(state, region.id) ? `Holding ${region.name}` : `Occupying ${region.name} (${share}%)`;
  }
  if (army.health < 1 && isFriendlyRegion(state, content, army.nationId, region.id) && occupiedShare(state, region.id) === 0) return `Recovering in ${region.name}`;
  return `In ${region.name}`;
}

/** Faction name for the UI: "Aegis" or "the national government". */
export function commanderName(state: GameState, content: Content, army: ArmyState): string {
  const id = armyCommander(state, army);
  return id ? factionDef(content, id).name : "the national government";
}

// ---------------------------------------------------------------------------
// Nuclear strikes (Terra Invicta)

/**
 * The regions a nation can fire nuclear weapons at: its enemies' (only those bordering it or
 * on a coast without a space program, and only bordering ones while also blockaded), plus its
 * own and its allies' regions where an enemy army stands. Space Defenses don't exist yet.
 */
export function nukeTargets(state: GameState, content: Content, launcherId: string): string[] {
  const launcher = nationState(state, launcherId);
  const enemies = enemiesOf(state, launcherId);
  if (enemies.size === 0) return [];
  const ours = nationRegions(state, content, launcherId);
  const bordering = new Set(ours.flatMap((r) => r.neighbors));
  const free = navalFreedom(state, launcherId);
  const out: string[] = [];
  for (const region of content.regions) {
    const owner = regionOwner(state, region.id);
    if (enemies.has(owner)) {
      if (!launcher.spaceProgram && !bordering.has(region.id) && (!free || !region.coastal)) continue;
      out.push(region.id);
    } else if (owner === launcherId || areAllies(state, owner, launcherId)) {
      if (state.armies.some((a) => !a.move && a.regionId === region.id && enemies.has(a.nationId))) out.push(region.id);
    }
  }
  return out;
}

/** Whether a faction can fire one of a nation's nuclear weapons at a region: it needs the nation's working executive. */
export function checkNuclearStrike(state: GameState, content: Content, factionId: string, nationId: string, regionId: string): Check {
  const exec = checkExecutive(state, content, factionId, nationId);
  if (!exec.ok) return exec;
  const nation = nationState(state, nationId);
  const name = nationDef(content, nationId).name;
  if (nation.nukes <= 0) return { ok: false, reason: `${name} has no nuclear weapons` };
  if (enemiesOf(state, nationId).size === 0) return { ok: false, reason: `${name} is not at war` };
  if (!content.regions.some((r) => r.id === regionId)) return { ok: false, reason: `Unknown region "${regionId}"` };
  if (!nukeTargets(state, content, nationId).includes(regionId)) return { ok: false, reason: `${regionDef(content, regionId).name} is out of ${name}'s reach` };
  return { ok: true };
}

/**
 * Fires a nuclear weapon (Terra Invicta's Effects of a Nuclear Attack). The region loses much
 * of its economy and people, the world economy suffers, hostile armies there are destroyed or
 * crippled, councilors there may die, and smoke reaches the stratosphere. Strikes on our own
 * or an ally's ground ("defensive") do far less harm.
 */
export function launchNuclearStrike(state: GameState, content: Content, factionId: string, nationId: string, regionId: string): void {
  const n = content.rules.military.nukes;
  const launcher = nationState(state, nationId);
  const region = regionDef(content, regionId);
  const ownerId = regionOwner(state, regionId);
  const target = nationState(state, ownerId);
  const defensive = ownerId === nationId || areAllies(state, ownerId, nationId);
  const kind = defensive ? "defensive" : "offensive";
  const draw = ([lo, hi]: [number, number]) => uniform(state, lo, hi);
  launcher.nukes -= 1;

  const share = populationShare(state, content, regionId);
  const worldGdp = state.nations.reduce((sum, x) => sum + (isExtant(x) ? x.gdp : 0), 0);
  const worldShare = worldGdp > 0 ? (target.gdp * share) / worldGdp : 0;
  const before = target.population;
  target.gdp *= 1 - share * draw(n.gdp[kind]);
  target.population *= 1 - share * draw(n.population[kind]);
  target.pollution = Math.min(content.rules.climate.pollution.max, target.pollution + share * draw(n.pollution[kind]));
  const worldLoss = (defensive ? n.worldGdp.defensivePerWorldShare : n.worldGdp.perWorldShare + uniform(state, 0, n.worldGdp.random)) * worldShare;
  for (const x of state.nations) if (isExtant(x)) x.gdp *= 1 - worldLoss;
  if (!defensive) {
    for (const id of Object.keys(target.ipProgress)) if (!n.keepPriorities.includes(id)) delete target.ipProgress[id];
  }
  if (ownerId !== nationId) {
    target.launchSites = target.launchSites.filter((site) => site.regionId !== regionId);
    target.annualFunding *= 1 - n.funding * share;
  }

  // Armies: the strongest hostile one dies outright, the rest mostly do; friendly ones are scorched.
  const friendly = (a: ArmyState) => a.nationId === nationId || areAllies(state, a.nationId, nationId) || armyCommander(state, a) === factionId;
  const here = state.armies.filter((a) => !a.move && a.regionId === regionId);
  const hostile = here.filter((a) => !friendly(a));
  const strongest = hostile.reduce<ArmyState | null>((best, a) => {
    const score = (b: ArmyState) => b.health * nationState(state, b.nationId).militaryTech;
    return !best || score(a) > score(best) ? a : best;
  }, null);
  for (const a of here) {
    if (friendly(a)) a.health -= 1 / draw(n.friendlyDivisor);
    else if (a === strongest || nextFloat(state.rng) < 0.5) a.health = 0;
    else a.health -= 1 - draw(n.hardening) * Math.max(0, nationState(state, a.nationId).militaryTech - n.hardeningFrom);
  }

  const launcherName = nationDef(content, nationId).name;
  const targetName = nationDef(content, ownerId).name;
  const killed = before - target.population;
  addLog(state, {
    nationId: ownerId,
    factionId,
    kind: "war",
    text: `${launcherName} launched a nuclear strike on ${region.name}, ${targetName}: ${killed >= 1 ? `${killed.toFixed(1)} million` : `${Math.round(killed * 1000)} thousand`} dead.`,
  });
  for (const a of here.filter((army) => army.health <= 0)) destroyArmy(state, content, a, true);
  for (const a of here) a.health = Math.max(0, a.health);

  for (const faction of state.factions) {
    for (const c of [...faction.councilors]) {
      if (c.regionId !== regionId || c.traits.includes(n.survivorTrait) || nextFloat(state.rng) >= n.councilorDeath) continue;
      removeCouncilor(state, faction, c);
      addLog(state, { factionId: faction.id, nationId: ownerId, kind: "war", tone: "bad", text: `Our councilor ${c.name} was killed in the nuclear strike on ${region.name}.` });
    }
  }

  nuclearStrikeAerosols(state, content);
  const from = capitalRegion(state, content, nationId).id;
  state.strikes = [...state.strikes, { id: newId(state, "n"), dayIndex: state.dayIndex, minuteOfDay: state.minuteOfDay, launcherId: nationId, factionId, fromRegionId: from, regionId }].slice(-STRIKE_LIMIT);
}
