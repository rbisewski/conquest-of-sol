// Federations after Terra Invicta (Foreign Relations, "Federations"): nations in permanent
// alliance that pool their Funding and Boost, share a space program's launch capacity, and
// get an Economy bonus from the size of the others. Each is led by the member with the
// largest ambitions (most foreign claims). Joining and leaving are national policies
// (diplomacy.ts); this module holds the membership and its effects.
//
// Determinism note: only + − × ÷, Math.sqrt/floor/round/min/max and detmath.ts helpers.

import { foreignClaims } from "./claims";
import type { Content } from "./content";
import { detPow } from "./detmath";
import { nationDef, nationState, newId } from "./lookup";
import type { FederationState, GameState, NationState } from "./state";

export function federationOf(state: GameState, nationId: string): FederationState | undefined {
  return state.federations.find((f) => f.members.includes(nationId));
}

export function sameFederation(state: GameState, a: string, b: string): boolean {
  const f = federationOf(state, a);
  return f !== undefined && a !== b && f.members.includes(b);
}

/**
 * The member with the most significant international ambitions: the most foreign claims,
 * then the most CPs, then the earlier id.
 */
export function pickLeader(state: GameState, content: Content, members: string[]): string {
  const score = (id: string) => [foreignClaims(state, content, id).length, nationState(state, id).controlPoints.length] as const;
  return [...members].sort((a, b) => {
    const [ca, pa] = score(a);
    const [cb, pb] = score(b);
    return cb - ca || pb - pa || a.localeCompare(b);
  })[0]!;
}

/** A new federation takes its leader's union name if it has one, else "<Leader> Federation". */
export function federationName(content: Content, leaderId: string): string {
  return content.relations.federationNames[leaderId] ?? `${nationDef(content, leaderId).name} Federation`;
}

export function createFederation(state: GameState, content: Content, members: string[], leaderId = pickLeader(state, content, members), name = federationName(content, leaderId)): FederationState {
  const federation: FederationState = { id: newId(state, "fed"), name, leaderId, members: [...members].sort() };
  state.federations.push(federation);
  return federation;
}

export function addMember(federation: FederationState, nationId: string): void {
  if (!federation.members.includes(nationId)) federation.members = [...federation.members, nationId].sort();
}

/**
 * Takes a nation out of its federation (it left, fell to a coup, or ceased to exist). A
 * federation of one is disbanded; one that lost its leader picks a new one. Alliances stay.
 */
export function removeFromFederation(state: GameState, content: Content, nationId: string): FederationState | undefined {
  const federation = federationOf(state, nationId);
  if (!federation) return undefined;
  federation.members = federation.members.filter((id) => id !== nationId);
  if (federation.members.length < 2) state.federations = state.federations.filter((f) => f !== federation);
  else if (federation.leaderId === nationId) federation.leaderId = pickLeader(state, content, federation.members);
  return federation;
}

/**
 * The nation's share of its federation's pooled Funding and Boost: each member takes a share
 * proportional to its CP count cubed. Outside a federation, its own.
 */
export function sharedOutputs(state: GameState, content: Content, nation: NationState): { annualFunding: number; annualBoost: number } {
  const federation = federationOf(state, nation.id);
  if (!federation) return { annualFunding: nation.annualFunding, annualBoost: nation.annualBoost };
  const exponent = content.rules.diplomacy.federation.shareExponent;
  let funding = 0;
  let boost = 0;
  let weights = 0;
  for (const id of federation.members) {
    const member = nationState(state, id);
    funding += member.annualFunding;
    boost += member.annualBoost;
    weights += detPow(member.controlPoints.length, exponent);
  }
  const share = weights > 0 ? detPow(nation.controlPoints.length, exponent) / weights : 0;
  return { annualFunding: funding * share, annualBoost: boost * share };
}

/** A member may invest in Boost and Mission Control if any member has a space program. */
export function hasSharedSpaceProgram(state: GameState, nation: NationState): boolean {
  if (nation.spaceProgram) return true;
  const federation = federationOf(state, nation.id);
  return federation !== undefined && federation.members.some((id) => nationState(state, id).spaceProgram);
}

/**
 * Economy priority bonus for a member: (the other members' GDP in $B)^0.25 / 2 percent,
 * rounded to the nearest percent. Returned as a fraction (0.03 = 3%).
 */
export function federationEconomyBonus(state: GameState, content: Content, nation: NationState): number {
  const federation = federationOf(state, nation.id);
  if (!federation) return 0;
  const r = content.rules.diplomacy.federation;
  const others = federation.members.reduce((sum, id) => (id === nation.id ? sum : sum + nationState(state, id).gdp), 0);
  return others > 0 ? Math.round(detPow(others, r.economyExponent) / r.economyDivisor) / 100 : 0;
}
