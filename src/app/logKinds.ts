// What a log entry is about, for its event icon. Entries written before log entries carried a
// kind (saves from before 2026-10-26) are recognised from their text.

import { MISSION_NAMES, type LogEntry, type LogKind, type MissionType } from "../sim/index";

export interface EntryKind {
  kind: LogKind;
  mission?: MissionType;
  tone?: "good" | "bad";
}

/** Phrases the mission reports use, in the order they are tested. */
const MISSION_TEXT: [RegExp, MissionType][] = [
  [/took the .* control point|failed to take control/, "controlNation"],
  [/cracked down|crackdown/, "crackdown"],
  [/purged|purge in/, "purge"],
  [/overthrew the government|coup in/, "coup"],
  [/public campaign/, "publicCampaign"],
  [/investigated|investigation of/, "investigateCouncilor"],
  [/assassinated|attempt on .* life/, "assassinate"],
  [/is protecting/, "protectTarget"],
  [/enthusiasm for the cause|little impression on|made things worse with/, "inspire"],
  [/calmed|failed to stabilize/, "stabilizeNation"],
  [/stirred up|failed to stir up/, "increaseUnrest"],
  [/is advising the government/, "advise"],
  [/watching for enemy councilors/, "surveilLocation"],
  [/went to ground/, "goToGround"],
  [/defended our interests/, "defendInterests"],
];

const FAILED = /failed|fell flat|turned up nothing|abandoned|called off|little impression|made things worse|was assassinated/;

const OTHER_TEXT: [RegExp, LogKind][] = [
  [/spotted/, "intel"],
  [/joined the .* council|dismissed from the/, "council"],
  [/completed/, "research"],
  [/occupied|occupation|was destroyed in|has fallen/, "war"],
  [/founded a|atomic bomb/, "nation"],
];

export function entryKind(e: LogEntry): EntryKind {
  if (e.kind) return { kind: e.kind, mission: e.mission, tone: e.tone };
  // "abandoned Purge in …" and "called off Purge: …" name the mission outright.
  const named = (Object.entries(MISSION_NAMES) as [MissionType, string][]).find(([, name]) => e.text.includes(`abandoned ${name}`) || e.text.includes(`called off ${name}`));
  const mission = named?.[0] ?? MISSION_TEXT.find(([re]) => re.test(e.text))?.[1];
  if (mission) return { kind: "mission", mission, ...(FAILED.test(e.text) ? { tone: "bad" as const } : {}) };
  return { kind: OTHER_TEXT.find(([re]) => re.test(e.text))?.[1] ?? "nation" };
}
