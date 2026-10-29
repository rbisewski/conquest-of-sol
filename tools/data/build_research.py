"""Builds src/content/techs.json and src/content/projects.json from Terra Invicta's game files.

The game's template files (TITechTemplate, TIProjectTemplate, TIEffectTemplate) and English
localization are published with the tech tree site at
https://github.com/Pzixel/terra-invicta-techtree-update (public/gamefiles/stable):

    git clone --depth 1 https://github.com/Pzixel/terra-invicta-techtree-update techtree
    python3 -I tools/data/build_research.py techtree/public/gamefiles/stable src/content

Techs keep the game's names, categories, costs, prerequisites and summaries. Their effects
are kept where our simulation has the system they act on (the Miltech cap, the Economy
priority, councilor XP); docs/formulas.md ("Research") lists them.

Projects are kept when at least one of their effects or one-time grants works in our
simulation, or they unlock claims (src/content/claims.json, from build_claims.py, which must run
first), together with every project on their prerequisite chains (which may do nothing yet). Projects for the alien faction, and projects that need campaign objectives we don't
have yet, are left out. Faction-specific projects go to our faction in the same ideological
position (FACTIONS below).
"""

import json
import os
import re
import sys

CATEGORIES = {
    "Energy": "energy",
    "InformationScience": "information",
    "LifeScience": "life",
    "Materials": "materials",
    "MilitaryScience": "military",
    "SocialScience": "social",
    "SpaceScience": "space",
    "Xenology": "xenology",
}

# Terra Invicta's factions and ours, matched by their place on the alien question and the means axis.
FACTIONS = {
    "ResistCouncil": "aegis",
    "DestroyCouncil": "iron-dawn",
    "CooperateCouncil": "lumen",
    "ExploitCouncil": "meridian",
    "EscapeCouncil": "ark",
    "AppeaseCouncil": "concord",
    "SubmitCouncil": "choir",
}
# Their faction names appear in some project names ("Resistance Talent Development").
FACTION_NAMES = {
    "Resistance": "Aegis",
    "Humanity First": "Iron Dawn",
    "Academy": "Lumen",
    "Initiative": "Meridian",
    "Project Exodus": "Ark",
    "Protectorate": "Concord",
    "Servant": "Choir",
}

PRIORITIES = {
    "EconomyPriority": "economy",
    "WelfarePriority": "welfare",
    "EnvironmentPriority": "environment",
    "KnowledgePriority": "knowledge",
    "GovernmentPriority": "government",
    "UnityPriority": "unity",
    "MilitaryPriority": "military",
    "OppressionPriority": "oppression",
    "LaunchFacilitiesPriority": "boost",
    "MissionControlPriority": "mission-control",
    "SpaceflightPriority": "found-space-program",
    "BuildArmyPriority": "build-army",
    "UpgradeArmyPriority": "build-navy",
    "BuildNuclearWeaponsPriority": "nuclear-weapons",
}

MISSIONS = {
    "GainControlPoint": "controlNation",
    "Purge": "purge",
    "Crackdown": "crackdown",
    "Coup": "coup",
    "Assassination": "assassinate",
    "Stabilize": "stabilizeNation",
    "GainInfluence": "publicCampaign",
    "InvestigateCouncilor": "investigateCouncilor",
    "Inspire": "inspire",
    "Unrest": "increaseUnrest",
}

# Our changes to the game's project effects.
EFFECT_OVERRIDES = {
    # Terra Invicta takes 5% off control point upkeep; we add capacity instead.
    "Project_ManagementResearch": [{"kind": "modifier", "context": "ControlPointCapacity", "op": "add", "value": 5, "scope": "faction"}],
}

# Faction modifiers our simulation applies, by the game's context name.
MODIFIERS = {
    "ControlPointMaintenance",
    "PublicCampaignStrength",
    "DefendInterestsValue",
    "CouncilSize",
    "MaxMissionSliderSteps",
    "AllRecruitStats",
    "NewCouncilorRecruitXP",
    "ControlPointResearch",
    "BilateralRelationsCooldownMultiplier",
    "OrgPurchaseCost",
    "MaxAvailableOrgs",
    "Corruption",
    "SpoilsOutput",
    "Economy_BasePCGDPIncrease",
}

ATTRIBUTES = {"Persuasion", "Investigation", "Espionage", "Command", "Administration", "Science", "Security", "Loyalty"}
RESOURCES = {"Money": "money", "Influence": "influence", "Operations": "ops", "Boost": "boost"}


def load_localization(path: str) -> dict[str, str]:
    out = {}
    with open(path, encoding="utf-8-sig") as f:
        for line in f:
            if "=" in line:
                key, value = line.rstrip("\n").split("=", 1)
                out[key.strip()] = re.sub(r"<[^>]+>", " ", value).strip()
    return out


def rename(name: str) -> str:
    for theirs, ours in FACTION_NAMES.items():
        name = name.replace(theirs, ours)
    return name


def convert_effect(e: dict, traits: set[str]) -> dict | None:
    """One of the game's effects in our terms, or None if we don't simulate what it acts on."""
    instant = e.get("instantEffect")
    if instant == "FactionAllCouncilorsModifyAttribute" and e.get("strValue") in ATTRIBUTES:
        return {"kind": "councilorAttribute", "attribute": e["strValue"].lower(), "amount": e["value"]}
    if instant == "FactionAllEligibleCouncilorsGainTrait" and e.get("strValue", "").lower() in traits:
        return {"kind": "councilorTrait", "trait": e["strValue"].lower()}
    if instant == "FactionAllEligibleCouncilorsGainXP":
        return {"kind": "councilorXp", "amount": e["value"]}
    if instant == "Propaganda" and e.get("effectTarget") == "AllExtantNations":
        return {"kind": "propaganda", "strength": e["value"]}
    if instant == "RerollMissingProjects":
        return {"kind": "reviewFailed"}
    if instant == "NationMaxMiltechChange":
        return {"kind": "maxMiltech", "amount": e["value"]}
    if instant or e.get("effectDuration") != "permanent":
        return None
    contexts = e.get("contexts", [])
    if len(contexts) != 1:
        return None
    context = contexts[0]
    op = "mul" if e.get("operation") == "Multiplicative" else "add"
    scope = "faction" if e.get("effectTarget") == "SourceFaction" else "global"
    if context in PRIORITIES:
        return {"kind": "priority", "priority": PRIORITIES[context], "amount": e["value"], "scope": scope}
    m = re.fullmatch(r"Mission_(\w+)_(Att|Def)", context)
    if m and m.group(1) in MISSIONS:
        return {"kind": "mission", "mission": MISSIONS[m.group(1)], "side": "attack" if m.group(2) == "Att" else "defense", "amount": e["value"], "scope": scope}
    if context in MODIFIERS:
        out = {"kind": "modifier", "context": context, "op": op, "value": e["value"], "scope": scope}
        if context == "AllRecruitStats":
            if e.get("strValue") not in ATTRIBUTES:
                return None
            out["attribute"] = e["strValue"].lower()
        if context == "OrgPurchaseCost":
            if e.get("strValue") not in RESOURCES:
                return None
            out["resource"] = RESOURCES[e["strValue"]]
        return out
    return None


def main(game_dir: str, out_dir: str) -> None:
    templates = os.path.join(game_dir, "Templates")
    load = lambda name: json.load(open(os.path.join(templates, name), encoding="utf-8-sig"))
    effects = {e["dataName"]: e for e in load("TIEffectTemplate.json")}
    tech_text = load_localization(os.path.join(game_dir, "Localization", "en", "TITechTemplate.en"))
    project_text = load_localization(os.path.join(game_dir, "Localization", "en", "TIProjectTemplate.en"))
    traits = {t["id"] for t in json.load(open(os.path.join(out_dir, "traits.json"), encoding="utf-8"))}
    claim_projects = {c["project"] for c in json.load(open(os.path.join(out_dir, "claims.json"), encoding="utf-8")) if "project" in c}

    def effects_of(item: dict) -> list[dict]:
        return [c for c in (convert_effect(effects[name], traits) for name in item.get("effects", []) if name in effects) if c]

    techs = []
    for t in load("TITechTemplate.json"):
        if t.get("endGameTech") or t["dataName"].startswith("FutureTech"):
            continue  # Repeatable end-of-category techs; they need every tech in their category first.
        techs.append(
            {
                "id": t["dataName"],
                "name": tech_text.get(f"TITechTemplate.displayName.{t['dataName']}", t["friendlyName"]),
                "category": CATEGORIES[t["techCategory"]],
                "cost": t["researchCost"],
                "prereqs": [p for p in t.get("prereqs", []) if p],
                "summary": tech_text.get(f"TITechTemplate.summary.{t['dataName']}", ""),
                "effects": [e for e in effects_of(t) if e.get("scope", "global") == "global" or e["kind"] != "modifier"],
            }
        )
    tech_ids = {t["id"] for t in techs}

    candidates = {}
    for p in load("TIProjectTemplate.json"):
        factions = p.get("factionPrereq") or []
        if p.get("disable") or p.get("requiredObjectiveName") or p.get("requiredMilestone"):
            continue
        if factions and not any(f in FACTIONS for f in factions):
            continue  # Alien-only.
        grants = [{"resource": RESOURCES[g["resource"]], "amount": g["value"]} for g in p["resourcesGranted"] if g["resource"] in RESOURCES]
        prereqs = [x for x in p.get("prereqs", []) if x]
        always = p.get("factionAlways")
        candidates[p["dataName"]] = {
            "id": p["dataName"],
            "name": rename(project_text.get(f"TIProjectTemplate.displayName.{p['dataName']}", p["friendlyName"])),
            "category": CATEGORIES[p["techCategory"]],
            "cost": p["researchCost"],
            "prereqs": prereqs,
            **({"altPrereq": p["altPrereq0"]} if p.get("altPrereq0") else {}),
            **({"factions": [FACTIONS[f] for f in factions if f in FACTIONS]} if factions else {}),
            **({"guaranteedFor": FACTIONS[always]} if always in FACTIONS else {}),
            "unlockChance": p["factionAvailableChance"] / 100,
            "availability": {"initial": p["initialUnlockChance"] / 100, "monthly": p["deltaUnlockChance"] / 100, "max": p["maxUnlockChance"] / 100},
            **({"repeatable": True} if p["repeatable"] else {}),
            **({"oneTimeGlobally": True} if p["oneTimeGlobally"] else {}),
            "summary": rename(project_text.get(f"TIProjectTemplate.summary.{p['dataName']}", "")),
            "effects": EFFECT_OVERRIDES.get(p["dataName"], effects_of(p)),
            "grants": grants,
            "role": p.get("AI_projectRole", ""),
        }

    # Keep projects that do something here, then everything their prerequisite chains need.
    keep = {pid for pid, p in candidates.items() if p["effects"] or p["grants"] or pid in claim_projects}
    frontier = list(keep)
    while frontier:
        p = candidates[frontier.pop()]
        for q in p["prereqs"] + ([p["altPrereq"]] if "altPrereq" in p else []):
            if q in candidates and q not in keep:
                keep.add(q)
                frontier.append(q)
    # Drop projects whose prerequisites were left out (objectives, alien-only), until stable.
    changed = True
    while changed:
        changed = False
        for pid in sorted(keep):
            needed = candidates[pid]["prereqs"]
            if any(q not in tech_ids and q not in keep for q in needed):
                keep.discard(pid)
                changed = True
    projects = sorted((candidates[pid] for pid in keep), key=lambda p: (p["cost"], p["name"]))
    for p in projects:
        if p.get("altPrereq") and p["altPrereq"] not in keep and p["altPrereq"] not in tech_ids:
            del p["altPrereq"]

    def write(name: str, items: list[dict]) -> None:
        with open(os.path.join(out_dir, name), "w", encoding="utf-8") as f:
            f.write("[\n" + ",\n".join("  " + json.dumps(i, ensure_ascii=False) for i in items) + "\n]\n")

    write("techs.json", sorted(techs, key=lambda t: (t["cost"], t["name"])))
    write("projects.json", projects)
    working = sum(1 for p in projects if p["effects"] or p["grants"])
    claiming = sum(1 for p in projects if p["id"] in claim_projects)
    missing = sorted(claim_projects - {p["id"] for p in projects})
    print(f"{len(techs)} techs, {len(projects)} projects ({working} with effects we simulate, {claiming} unlocking claims)")
    if missing:
        print("claim projects left out:", ", ".join(missing))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
