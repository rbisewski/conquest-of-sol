// Plain-language lines for what techs and projects do, for the Research panel.

import { baseContent } from "../content/index";
import { MISSION_NAMES, nationDef, projectClaims, regionDef, type ModifierContext, type ProjectDef, type ResearchEffect, type TechDef } from "../sim/index";

const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;
const times = (v: number) => (v >= 1 ? `+${Math.round((v - 1) * 100)}%` : `−${Math.round((1 - v) * 100)}%`);
const signed = (v: number) => `${v > 0 ? "+" : ""}${v}`;
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const MODIFIERS: Record<ModifierContext, (e: Extract<ResearchEffect, { kind: "modifier" }>) => string> = {
  ControlPointMaintenance: (e) => `Control point upkeep ${signed(e.value)}%`,
  ControlPointCapacity: (e) => `${signed(e.value)} control point capacity`,
  PublicCampaignStrength: (e) => `Public Campaign strength ${times(e.value)}`,
  DefendInterestsValue: (e) => `Defend Interests ${signed(e.value)} defense`,
  CouncilSize: (e) => `${signed(e.value)} council seat${e.value === 1 ? "" : "s"}`,
  MaxMissionSliderSteps: (e) => `${signed(e.value)} mission spend step (doubles the most we can spend)`,
  AllRecruitStats: (e) => `New recruits ${signed(e.value)} ${title(e.attribute ?? "")}`,
  NewCouncilorRecruitXP: (e) => `New recruits start with ${signed(e.value)} XP`,
  ControlPointResearch: (e) => `Research from control points ${times(e.value)}`,
  BilateralRelationsCooldownMultiplier: (e) => `Diplomatic cooldowns ${times(e.value)}`,
  OrgPurchaseCost: (e) => `Org ${e.resource ?? ""} costs ${times(e.value)}`,
  MaxAvailableOrgs: (e) => `${signed(e.value)} orgs on our market`,
  Corruption: (e) => `Corruption ${times(e.value)}`,
  SpoilsOutput: (e) => `Spoils money ${times(e.value)}`,
  Economy_BasePCGDPIncrease: (e) => `Economy priority growth ${times(e.value)}`,
  ProbeTransferTime: (e) => `Probe travel time ${times(e.value)}`,
  GenericModuleTransferTime: (e) => `Boost delivery time ${times(e.value)}`,
  GenericTransfer_OffDate_PCT: (e) => `Delay for launching outside a window ${times(e.value)}`,
  SpaceMiningBonus: (e) => `Mines yield ${pct(e.value)}`,
  MiningWaterBonus: (e) => `Mines yield water ${times(e.value)}`,
  MiningVolatilesBonus: (e) => `Mines yield volatiles ${times(e.value)}`,
  MiningMetalsBonus: (e) => `Mines yield base metals ${times(e.value)}`,
  MiningNoblesBonus: (e) => `Mines yield noble metals ${times(e.value)}`,
  MiningFissilesBonus: (e) => `Mines yield fissiles ${times(e.value)}`,
  MCFreeSpaceMineNetwork: (e) => `${signed(e.value)} mines we can work without mission control`,
  HabMissionControlReduction: (e) => `Mission control our habs use ${times(e.value)}`,
};

export function describeEffect(e: ResearchEffect): string {
  const everyone = "scope" in e && e.scope === "global" ? " (every faction)" : "";
  switch (e.kind) {
    case "priority":
      return `${baseContent.priorities.find((p) => p.id === e.priority)?.name ?? e.priority} priority ${pct(e.amount)}${everyone}`;
    case "mission":
      return `${MISSION_NAMES[e.mission]} ${e.side} ${signed(e.amount)}${everyone}`;
    case "modifier":
      return MODIFIERS[e.context](e) + everyone;
    case "councilorAttribute":
      return `Our councilors ${signed(e.amount)} ${title(e.attribute)}`;
    case "councilorTrait":
      return `Our councilors gain the ${baseContent.traits.find((t) => t.id === e.trait)?.name ?? e.trait} trait`;
    case "councilorXp":
      return `Every councilor gains ${e.amount} XP`;
    case "propaganda":
      return `Propaganda ${signed(e.strength)} for us in every nation`;
    case "reviewFailed":
      return "Re-rolls the project ideas we missed";
    case "maxMiltech":
      return `Highest Miltech any nation can reach ${signed(e.amount)}`;
    case "exhaustVelocity":
      return `Boost deliveries beyond low Earth orbit at ${e.kps} km/s exhaust velocity`;
  }
}

/** "Angola claims 20 regions in DR Congo, Tanzania and 9 more nations", one line per claimant. */
function describeClaims(project: ProjectDef): string[] {
  const nation = (id: string) => nationDef(baseContent, id).name;
  const byClaimant = new Map<string, string[]>();
  for (const c of projectClaims(baseContent, project.id)) {
    // Described by the regions' starting nations, so the text doesn't change as borders move.
    const owner = regionDef(baseContent, c.region).nationId;
    if (owner !== c.nation) (byClaimant.get(c.nation) ?? byClaimant.set(c.nation, []).get(c.nation)!).push(owner);
  }
  return [...byClaimant].map(([claimant, owners]) => {
    const nations = [...new Set(owners)].map(nation);
    const where = nations.length <= 3 ? nations.join(", ") : `${nations.slice(0, 2).join(", ")} and ${nations.length - 2} more nations`;
    return `${nation(claimant)} claims ${owners.length} region${owners.length === 1 ? "" : "s"} in ${where}`;
  });
}

/** "Opens Mars, Phobos and 17 more bodies to exploration" (probes and habs), and any station orbits it opens beyond those bodies'. */
function describeExploration(tech: TechDef): string[] {
  const bodies = baseContent.solarSystem.filter((b) => b.exploreTech === tech.id).map((b) => b.name);
  const orbits = baseContent.orbits.filter((o) => o.exploreTech === tech.id && baseContent.solarSystem.find((b) => b.id === o.body)!.exploreTech !== tech.id).length;
  const lines: string[] = [];
  if (bodies.length > 0) {
    const names = bodies.length <= 3 ? bodies.join(", ") : `${bodies.slice(0, 2).join(", ")} and ${bodies.length - 2} more bodies`;
    lines.push(`Opens ${names} to exploration`);
  }
  if (orbits > 0) lines.push(`Opens ${orbits} more station orbit${orbits === 1 ? "" : "s"}`);
  return lines;
}

/** Every line for a tech or project: effects, one-time grants, then claims, or what a tech opens in space. Empty if it does nothing yet. */
export function describe(item: TechDef | ProjectDef): string[] {
  const lines = item.effects.map(describeEffect);
  if ("grants" in item) {
    for (const g of item.grants) lines.push(`${signed(g.amount)} ${g.resource} once`);
    lines.push(...describeClaims(item));
  } else lines.push(...describeExploration(item));
  return lines;
}
