"""Builds src/content/climate.json: each region's climate traits and each nation's starting
Pollution Multiplier, after Terra Invicta's Climate Change rules.

Regions. Terra Invicta marks each of its regions ecologically Standard, Vulnerable (twice the
economic harm) or Beneficiary ("protected": none), and flags oil and mining regions. Its
regions are not ours, so each Terra Invicta region goes to the nearest of our regions held by
the same nation (matched as in build_claims.py). Each of our regions then gets the population
shares of its Terra Invicta regions that are vulnerable and protected, and how many oil and
mining regions it holds, and whether it holds one of the regions Terra Invicta's Wet Bulb
Disaster can strike.

Nations. Terra Invicta's monthly emissions are, in tonnes of CO2 a year,
    Pollution Multiplier × (GDP in $B × 275000
                            + people × 2.41 × min(1, GDPPC / 15000)² × min(1, GDPPC / 7500)²
                            + min(oil regions × 2.5e8, GDP in $B × 27500))
so each nation's starting multiplier is its real annual CO2 emissions (Our World in Data,
Global Carbon Project; latest year) over the bracket, clamped to Terra Invicta's 0.3325–10.
Nations without emissions data (and the breakaways, which hold no regions at the start) get
the world's emission-weighted multiplier.

    python3 -I tools/data/build_climate.py <game StreamingAssets or techtree gamefiles dir> src/content

Run after build_world.py (it reads regions.json and nations.json) and fetch.py.
"""

import csv
import importlib.util
import json
import os
import pathlib
import sys

CACHE = pathlib.Path(__file__).parent / ".cache"
MIN_POLLUTION = 0.3325
MAX_POLLUTION = 10.0

_spec = importlib.util.spec_from_file_location("build_claims", pathlib.Path(__file__).parent / "build_claims.py")
claims_tool = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(claims_tool)
load, distance, NATIONS, FOLDED = claims_tool.load, claims_tool.distance, claims_tool.NATIONS, claims_tool.FOLDED


def emissions_bracket(gdp_b: float, population_m: float, oil_regions: int) -> float:
    """Terra Invicta's emissions for a Pollution Multiplier of 1, in tonnes of CO2 a year."""
    people = population_m * 1e6
    gdppc = gdp_b * 1e9 / people if people > 0 else 0
    return gdp_b * 275000 + people * 2.41 * min(1, gdppc / 15000) ** 2 * min(1, gdppc / 7500) ** 2 + min(oil_regions * 2.5e8, gdp_b * 27500)


def latest_co2() -> dict[str, float]:
    """ISO3 code -> tonnes of CO2 in the latest year with data."""
    out: dict[str, tuple[int, float]] = {}
    with open(CACHE / "owid_co2.csv", encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader)
        for entity, code, year, value in reader:
            if not code or code.startswith("OWID") or not value:
                continue
            if code not in out or int(year) > out[code][0]:
                out[code] = (int(year), float(value))
    return {code: v for code, (_, v) in out.items()}


def main(game_dir: str, out_dir: str) -> None:
    templates = os.path.join(game_dir, "Templates")
    map_regions = {m["dataName"]: m for m in load(os.path.join(templates, "TIMapRegionTemplate.json"))}
    ti_regions = {r["dataName"]: r for r in load(os.path.join(templates, "TIRegionTemplate.json")) if r.get("mapRegionName") in map_regions}
    ti_where = {k: (map_regions[r["mapRegionName"]]["latitude"], map_regions[r["mapRegionName"]]["longitude"]) for k, r in ti_regions.items()}
    claims = [c for c in load(os.path.join(templates, "TIBilateralTemplate.json")) if c["relationType"] == "Claim" and c.get("initialOwner")]
    ti_owner = {c["region1"]: c["nation1"] for c in claims if not c["nation1"][:4].isdigit()}
    ti_names = {n["dataName"]: n["friendlyName"] for n in load(os.path.join(templates, "TINationTemplate.json"))}

    wet_bulb = set(next(e for e in load(os.path.join(templates, "TINarrativeEventTemplate.json")) if e["dataName"] == "event_WetBulb")["possibleTargetDataNames"])

    regions = load(os.path.join(out_dir, "regions.json"))
    nations = load(os.path.join(out_dir, "nations.json"))
    by_name = {n["name"]: n["id"] for n in nations}
    ours_of = {ti: NATIONS.get(ti) or by_name.get(ti_names.get(ti, "")) for ti in set(ti_owner.values())}
    for ours, ti in FOLDED.items():
        # A folded Terra Invicta nation's regions go to whichever of its parts is nearest.
        ours_of.setdefault(ti, None)

    # Each Terra Invicta region goes to the nearest of our regions in the nation that holds it.
    ours_by_nation: dict[str, list[dict]] = {}
    for r in regions:
        ours_by_nation.setdefault(r["nationId"], []).append(r)
    folded_parts = {ti: [n for n, t in FOLDED.items() if t == ti] for ti in set(FOLDED.values())}
    assigned: dict[str, list[dict]] = {}
    for ti_region, owner in ti_owner.items():
        if ti_region not in ti_where:
            continue
        candidates = [r for n in [ours_of.get(owner), *folded_parts.get(owner, [])] if n for r in ours_by_nation.get(n, [])]
        if not candidates:
            continue
        target = min(candidates, key=lambda r: distance((r["lat"], r["lon"]), ti_where[ti_region]))
        assigned.setdefault(target["id"], []).append(ti_regions[ti_region])

    traits = {}
    for r in regions:
        parts = assigned.get(r["id"])
        if not parts:
            # No Terra Invicta region landed here: take the nearest one in the same nation.
            parts = [min(sum((assigned.get(x["id"], []) for x in ours_by_nation[r["nationId"]]), []) or list(ti_regions.values()), key=lambda t: distance((r["lat"], r["lon"]), ti_where[t["dataName"]]))]
            oil = mining = 0
            heat = False
        else:
            oil = sum(1 for t in parts if t.get("oilResource"))
            mining = sum(1 for t in parts if t.get("mining"))
            heat = any(t["mapRegionName"] in wet_bulb for t in parts)
        pop = sum(max(t.get("population_Millions", 0), 0.001) for t in parts)
        share = lambda kind: round(sum(max(t.get("population_Millions", 0), 0.001) for t in parts if t.get("environment") == kind) / pop, 3)
        row = {}
        if share("Vulnerable") > 0:
            row["vulnerable"] = share("Vulnerable")
        if share("Beneficiary") > 0:
            row["protected"] = share("Beneficiary")
        if oil:
            row["oil"] = oil
        if mining:
            row["mining"] = mining
        if heat:
            row["wetBulb"] = 1
        if row:
            traits[r["id"]] = row

    # Starting Pollution Multipliers from real emissions.
    co2 = latest_co2()
    oil_of: dict[str, int] = {}
    for r in regions:
        oil_of[r["nationId"]] = oil_of.get(r["nationId"], 0) + traits.get(r["id"], {}).get("oil", 0)
    pollution = {}
    total_co2 = total_bracket = 0.0
    for n in nations:
        if "breakaway" in n or n["id"].upper() not in co2:
            continue
        bracket = emissions_bracket(n["gdp"], n["population"], oil_of.get(n["id"], 0))
        if bracket <= 0:
            continue
        real = co2[n["id"].upper()]
        pollution[n["id"]] = round(min(MAX_POLLUTION, max(MIN_POLLUTION, real / bracket)), 4)
        total_co2 += real
        total_bracket += bracket
    default = round(total_co2 / total_bracket, 4)
    missing = [n["id"] for n in nations if n["id"] not in pollution]
    for n in missing:
        pollution[n] = default

    out = {"defaultPollution": default, "regions": dict(sorted(traits.items())), "pollution": dict(sorted(pollution.items()))}
    with open(os.path.join(out_dir, "climate.json"), "w", encoding="utf-8") as f:
        f.write("{\n")
        f.write(f'  "defaultPollution": {default},\n')
        f.write('  "regions": {\n' + ",\n".join(f'    "{k}": {json.dumps(v)}' for k, v in out["regions"].items()) + "\n  },\n")
        f.write('  "pollution": {\n' + ",\n".join(f'    "{k}": {v}' for k, v in out["pollution"].items()) + "\n  }\n")
        f.write("}\n")
    print(f"{len(traits)} regions with climate traits; {len(pollution) - len(missing)} nations from emissions data, {len(missing)} at the world multiplier {default}")
    world = sum(emissions_bracket(n["gdp"], n["population"], oil_of.get(n["id"], 0)) * pollution[n["id"]] for n in nations if "breakaway" not in n)
    print(f"world emissions at the start: {world / 1e9:.1f} Gt CO2 a year")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
