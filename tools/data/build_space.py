"""Builds the space economy's content from Terra Invicta's game files.

    python3 -I tools/data/build_space.py "<Terra Invicta>/TerraInvicta_Data/StreamingAssets" src/content

Run it after build_solar.py and build_research.py: it keeps only the sites and orbits of bodies in
src/content/solarSystem.json, and only the hab modules whose projects are in projects.json.

- habSites.json (TIHabSiteTemplate): each body's surface sites for bases, with their mining
  profile and, for the planets and large moons, latitude and longitude.
- miningProfiles.json (TIMiningProfileTemplate): what a site of each profile yields a month, per
  resource as the game rolls it (docs/data-sources.md, "Space economy"), and whether small bodies
  scale it by their mass and density.
- orbits.json (TIOrbitTemplate): the orbits stations are built in, around bodies or their
  Lagrange points, with how many stations each holds, the global tech that opens it (its body's,
  with the game's exceptions: the Earth's farthest orbit and the Lagrange points of the Earth go
  with the Moon and Mars), and the Earth "interface" and low orbits some modules ask for. The
  game gives most synchronous orbits no height; theirs is worked out from the body's mass and its
  rotation period (TISpaceBodyTemplate).
- habModules.json (TIHabModuleTemplate): the modules habs are built from, cores included, with
  their build costs (the game's material weights times the mass, at 10 tons a unit), monthly
  support and income, power, crew, mission control and special rules. Alien, disabled and
  wrecked modules are left out.

Names come from the English localization (Localization/en beside Templates/).
"""

import json
import math
import os
import re
import sys

G = 6.674e-11

# The game's resource names, and ours.
RESOURCES = {
    "money": "money",
    "influence": "influence",
    "ops": "ops",
    "boost": "boost",
    "water": "water",
    "volatiles": "volatiles",
    "metals": "metals",
    "nobleMetals": "nobleMetals",
    "nobles": "nobleMetals",
    "fissiles": "fissiles",
    "antimatter": "antimatter",
    "exotics": "exotics",
}
MINED = ["water", "volatiles", "metals", "nobles", "fissiles"]
INCOMES = {
    "incomeMoney_month": "money",
    "incomeInfluence_month": "influence",
    "incomeOps_month": "ops",
    "incomeResearch_month": "research",
    "incomeVolatiles_month": "volatiles",
    "incomeMetals_month": "metals",
    "incomeNobles_month": "nobleMetals",
    "incomeFissiles_month": "fissiles",
    "incomeAntimatter_month": "antimatter",
    "incomeExotics_month": "exotics",
}
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
HAB_TYPES = {"Base": "base", "Station": "station", "Any": "any"}
# The game's Sun, and ours.
BODY_IDS = {"Sun": "Sol"}
# The Lagrange points opened by Mission to Mars (Effect_ExploreEarthLagrangePoints), not by their bodies' techs.
EARTH_LAGRANGE = {"EarthLuna", "SunEarth"}
EARTH_LAGRANGE_TECH = "MissiontoMars"
# A unit of a space resource is 10 tons.
TONS_PER_UNIT = 10


def load_localization(path):
    out = {}
    with open(path, encoding="utf-8-sig") as f:
        for line in f:
            if "=" in line:
                key, value = line.rstrip("\n").split("=", 1)
                out[key.strip()] = re.sub(r"<[^>]+>", " ", value).strip()
    return out


def amounts(values, scale=1):
    """A resource table in our names, without the zeros, rounded clear of float noise."""
    out = {}
    for key, value in (values or {}).items():
        if value:
            out[RESOURCES[key]] = round(value * scale, 6)
    return out


def lagrange_point(name, bodies):
    """(body, point) for a Lagrange point such as "JupiterIoL4" (Io's L4), or None if it isn't one."""
    m = re.fullmatch(r"(\w+?)L([1-5])", name)
    if not m:
        return None
    pair = m.group(1)
    for primary in sorted(bodies, key=len, reverse=True) + list(BODY_IDS):
        if pair.startswith(primary):
            secondary = pair[len(primary) :]
            parent = BODY_IDS.get(primary, primary)
            if secondary in bodies and bodies[secondary]["parent"] == parent:
                return secondary, int(m.group(2))
    return None


def main(game_dir, out_dir):
    templates = os.path.join(game_dir, "Templates")
    text = os.path.join(game_dir, "Localization", "en")

    def load(name):
        with open(os.path.join(templates, name), encoding="utf-8-sig") as f:
            return json.load(f)

    def read(name):
        with open(os.path.join(out_dir, name), encoding="utf-8") as f:
            return json.load(f)

    bodies = {b["id"]: b for b in read("solarSystem.json")}
    # Tidally locked bodies give "Lock"; only the turning ones matter here.
    rotation_hours = {b["dataName"]: abs(float(b["rotationPeriod_strHours"])) for b in load("TISpaceBodyTemplate.json") if re.fullmatch(r"-?[\d.]+", str(b.get("rotationPeriod_strHours", "")))}
    projects = {p["id"] for p in read("projects.json")}
    effects = {e["dataName"]: e for e in load("TIEffectTemplate.json")}
    explore_tech = {name: t["dataName"] for t in load("TITechTemplate.json") for name in t.get("effects", []) if effects.get(name, {}).get("contexts", [""])[0].startswith(("Explore", "OuterExploration", "InnerExploration"))}

    # Sites.
    site_text = load_localization(os.path.join(text, "TIHabSiteTemplate.en"))
    sites, dropped_sites = [], 0
    for s in load("TIHabSiteTemplate.json"):
        if s["parentBodyName"] not in bodies:
            dropped_sites += 1
            continue
        site = {
            "id": s["dataName"],
            "name": site_text.get(f"TIHabSiteTemplate.displayName.{s['dataName']}", s["friendlyName"]),
            "body": s["parentBodyName"],
            "profile": s["miningProfileName"],
        }
        if "latitude" in s:
            site["lat"] = s["latitude"]
            site["lon"] = s["longitude"]
        sites.append(site)

    # Mining profiles.
    profile_text = load_localization(os.path.join(text, "TIMiningProfileTemplate.en"))
    used = {s["profile"] for s in sites}
    profiles = []
    for p in load("TIMiningProfileTemplate.json"):
        if p["dataName"] not in used:
            continue
        profiles.append(
            {
                "id": p["dataName"],
                "name": profile_text.get(f"TIMiningProfileTemplate.displayName.{p['dataName']}", p["friendlyName"]),
                "scaleBySize": p["modifyBySize"],
                "resources": {RESOURCES[r]: {k: p[f"{r}_{k}"] for k in ("mean", "width", "min", "jump")} for r in MINED},
            }
        )

    # Orbits.
    orbit_text = load_localization(os.path.join(text, "TIOrbitTemplate.en"))
    orbits, dropped_orbits = [], 0
    for o in load("TIOrbitTemplate.json"):
        centre = o["barycenterName"]
        point = None
        if centre in bodies:
            body = centre
        else:
            found = lagrange_point(centre, bodies)
            if not found:
                dropped_orbits += 1
                continue
            body, point = found
        if o.get("effectToExplore") in explore_tech:
            tech = explore_tech[o["effectToExplore"]]
        elif point is not None and re.sub(r"L[1-5]$", "", centre) in EARTH_LAGRANGE:
            tech = EARTH_LAGRANGE_TECH
        else:
            tech = bodies[body].get("exploreTech")
        orbit = {
            "id": o["dataName"],
            "name": orbit_text.get(f"TIOrbitTemplate.displayName.{o['dataName']}", o["friendly name"]),
            "body": body,
        }
        if point is not None:
            orbit["lagrange"] = point
        # The game flags some synchronous orbits, and names the rest; Saturn's "synchronous" one it calls Medium.
        synchronous = bool(o.get("synch")) or orbit["name"].startswith("Synchronous")
        if "altitude_km" in o:
            orbit["altitudeKm"] = o["altitude_km"]
        elif synchronous and point is None and "semiMajorAxis_km" not in o:
            # Where an orbit keeps pace with the body's turning: Kepler's third law for its rotation period.
            period = rotation_hours[body] * 3600
            radius_km = (G * bodies[body]["massKg"] * period * period / (4 * math.pi * math.pi)) ** (1 / 3) / 1000
            orbit["altitudeKm"] = round(radius_km - bodies[body]["radiusKm"])
        if "semiMajorAxis_km" in o:
            orbit["semiMajorAxisKm"] = o["semiMajorAxis_km"]
        if synchronous:
            orbit["synchronous"] = True
        orbit["inclinationDeg"] = o["inclination_Deg"]
        orbit["nodeDeg"] = o["longAscendingNode_Deg"]
        orbit["capacity"] = o["stationCapacity"]
        if o["irradiatedMultiplier"] != 1:
            orbit["irradiation"] = o["irradiatedMultiplier"]
        if o.get("interfaceOrbit"):
            orbit["interface"] = True
        if o.get("earthLEO"):
            orbit["earthLeo"] = True
        if o.get("amat_ugpy"):
            orbit["antimatterUgPerYear"] = o["amat_ugpy"]
        if tech:
            orbit["exploreTech"] = tech
        orbits.append(orbit)

    # Modules.
    module_text = load_localization(os.path.join(text, "TIHabModuleTemplate.en"))
    candidates = [m for m in load("TIHabModuleTemplate.json") if not (m["alienModule"] or m["disable"] or m["destroyed"])]
    kept = {m["dataName"] for m in candidates if m.get("requiredProjectName") in projects}
    modules = []
    for m in candidates:
        if m["dataName"] not in kept:
            continue
        weights = m.get("weightedBuildMaterials") or m.get("weightBuildMaterials") or {}
        module = {
            "id": m["dataName"],
            "name": module_text.get(f"TIHabModuleTemplate.displayName.{m['dataName']}", m["friendlyName"]),
            "summary": module_text.get(f"TIHabModuleTemplate.description.{m['dataName']}", ""),
            "type": HAB_TYPES[m["habType"]],
            "tier": m["tier"],
            "project": m["requiredProjectName"],
        }
        if m["coreModule"]:
            module["core"] = True
        if m.get("upgradesFromName") in kept:
            module["upgradesFrom"] = m["upgradesFromName"]
        for flag, key in (("onePerHab", "onePerHab"), ("automated", "automated"), ("mine", "mine"), ("allowsShipConstruction", "shipyard"), ("allowsResupply", "resupply"), ("spaceCombatModule", "defense")):
            if m.get(flag):
                module[key] = True
        module["massTons"] = m["baseMass_tons"]
        module["buildDays"] = m["buildTime_Days"]
        module["buildCost"] = amounts(weights, m["baseMass_tons"] / TONS_PER_UNIT)
        module["support"] = amounts(m.get("supportMaterials_month"))
        module["income"] = {ours: m[theirs] for theirs, ours in INCOMES.items() if m.get(theirs)}
        if m.get("incomeProjects"):
            module["projectSlots"] = m["incomeProjects"]
        module["power"] = m["power"]
        module["crew"] = m["crew"]
        if m.get("missionControl"):
            module["missionControl"] = m["missionControl"]
        if m.get("controlPointCapacity"):
            module["controlPointCapacity"] = m["controlPointCapacity"]
        if m["constructionTimeModifier"] != 1:
            module["constructionTime"] = m["constructionTimeModifier"]
        if m.get("mine"):
            # A mine yields its site's resources times this; its cost and power scale with the body's mining modifier.
            module["mineOutput"] = m["miningModifier"]
        if "Cost_Scales_With_Gravity" in (m.get("specialRules") or []):
            module["scalesWithMining"] = True
        if m.get("techBonuses"):
            module["researchBonuses"] = {CATEGORIES[b["category"]]: b["bonus"] for b in m["techBonuses"]}
        if m.get("specialRules"):
            module["rules"] = m["specialRules"]
            if m.get("specialRulesValue") is not None:
                module["ruleValue"] = m["specialRulesValue"]
        if m.get("unlocksProjectName") in projects:
            module["unlocksProject"] = m["unlocksProjectName"]
        modules.append(module)

    def write(name, items):
        with open(os.path.join(out_dir, name), "w", encoding="utf-8") as f:
            f.write("[\n" + ",\n".join("  " + json.dumps(i, ensure_ascii=False) for i in items) + "\n]\n")

    write("habSites.json", sites)
    write("miningProfiles.json", profiles)
    write("orbits.json", orbits)
    write("habModules.json", modules)
    print(f"{len(sites)} sites ({dropped_sites} on bodies we leave out), {len(profiles)} mining profiles, {len(orbits)} orbits ({dropped_orbits} around bodies we leave out), {len(modules)} hab modules ({len(candidates) - len(kept)} whose projects we leave out)")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
