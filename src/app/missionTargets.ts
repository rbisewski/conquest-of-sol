// Valid targets for a councilor's mission, with odds, for the mission picker.

import { baseContent } from "../content/index";
import {
  assessMission,
  controlPointType,
  factionDef,
  findAnyCouncilor,
  intelOn,
  isExtant,
  missionRegion,
  nationDef,
  nationRegions,
  regionDef,
  type Councilor,
  type GameState,
  type Mission,
  type MissionType,
} from "../sim/index";

export interface MissionTarget {
  mission: Mission;
  label: string;
  /** Success chance, or null for an uncontested mission. */
  chance: number | null;
}

/**
 * Where to show one of our councilors: the mission's region and nation once a mission is
 * assigned, else where they are. The sim moves them only when the mission resolves.
 */
export function shownLocation(state: GameState, councilor: Councilor): { nationId: string; regionId: string } {
  const m = councilor.mission;
  return m ? { nationId: m.nationId, regionId: missionRegion(state, baseContent, councilor, m) } : { nationId: councilor.locationId, regionId: councilor.regionId };
}

export function missionKey(m: Mission): string {
  if ("targetId" in m) return `${m.type}:${m.targetId}`;
  if ("regionId" in m) return `${m.type}:${m.regionId}`;
  return "cpIndex" in m ? `${m.type}:${m.nationId}:${m.cpIndex}` : `${m.type}:${m.nationId}`;
}

/** "Brazil" or "Brazil, Legislature" for a mission's target. */
export function describeTarget(world: GameState, m: Mission): string {
  if ("regionId" in m) return `${regionDef(baseContent, m.regionId).name}, ${nationDef(baseContent, m.nationId).name}`;
  if ("targetId" in m) {
    const found = findAnyCouncilor(world, m.targetId);
    return found ? `${found.councilor.name}, ${regionDef(baseContent, found.councilor.regionId).name}, ${nationDef(baseContent, found.councilor.locationId).name}` : "a councilor no longer in play";
  }
  const nation = world.nations.find((n) => n.id === m.nationId)!;
  return `${nationDef(baseContent, m.nationId).name}${"cpIndex" in m ? `, ${controlPointType(nation, m.cpIndex)}` : ""}`;
}

/** Every valid target for a mission type: the selected nation first, then best odds. */
export function missionTargets(world: GameState, factionId: string, councilor: Councilor, type: MissionType, selectedNationId: string | null): MissionTarget[] {
  const out: MissionTarget[] = [];
  for (const nation of world.nations) {
    if (!isExtant(nation)) continue;
    const name = nationDef(baseContent, nation.id).name;
    const candidates: { mission: Mission; label: string }[] = [];
    if (type === "investigateCouncilor" || type === "assassinate") {
      // Other factions' councilors here whom we know enough about.
      for (const f of world.factions) {
        if (f.id === factionId) continue;
        for (const c of f.councilors) {
          if (c.locationId !== nation.id) continue;
          const intel = intelOn(world, factionId, c.id);
          if (intel < baseContent.rules.missions.intelToLocate) continue;
          const who = intel >= baseContent.rules.missions.intelToTarget ? `${c.name} (${factionDef(baseContent, f.id).name})` : "Unidentified councilor";
          candidates.push({ mission: { type, nationId: nation.id, targetId: c.id }, label: `${who} in ${regionDef(baseContent, c.regionId).name}, ${name} · intel ${Math.round(intel * 100)}%` });
        }
      }
    } else if (type === "surveilLocation" || type === "goToGround" || type === "increaseUnrest") {
      for (const r of nationRegions(world, baseContent, nation.id)) {
        candidates.push({ mission: { type, nationId: nation.id, regionId: r.id }, label: `${r.name}, ${name}` });
      }
    } else if (type === "protectTarget" || type === "inspire") {
      for (const c of world.factions.find((f) => f.id === factionId)!.councilors) {
        if (c.locationId === nation.id && c.id !== councilor.id) candidates.push({ mission: { type, nationId: nation.id, targetId: c.id }, label: `${c.name} in ${regionDef(baseContent, c.regionId).name}, ${name}` });
      }
    } else if (type === "crackdown" || type === "purge") {
      nation.controlPoints.forEach((cp, i) => {
        if (cp.owner && cp.owner !== factionId) {
          candidates.push({ mission: { type, nationId: nation.id, cpIndex: i }, label: `${name}: ${controlPointType(nation, i)} (${factionDef(baseContent, cp.owner).name})` });
        }
      });
    } else candidates.push({ mission: { type, nationId: nation.id } as Mission, label: name });
    for (const candidate of candidates) {
      const a = assessMission(world, baseContent, factionId, councilor, candidate.mission);
      if (a.ok) out.push({ ...candidate, chance: a.contested ? a.odds.chance : null });
    }
  }
  return out.sort(
    (a, b) =>
      Number(b.mission.nationId === selectedNationId) - Number(a.mission.nationId === selectedNationId) ||
      (b.chance ?? 1) - (a.chance ?? 1) ||
      a.label.localeCompare(b.label),
  );
}
