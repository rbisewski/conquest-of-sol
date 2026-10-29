"""Builds src/content/claims.json from Terra Invicta's game files.

Terra Invicta lists each nation's claims on regions in TIBilateralTemplate (relationType
"Claim"): claims held from the start, claims that a project unlocks, and whether a claim is
hostile. Its regions are not ours, so each of our regions is matched to the nearest Terra
Invicta region (TIMapRegionTemplate latitude/longitude) owned by the same nation, and each
Terra Invicta nation to ours by name (TINationTemplate), with NATIONS for the names that differ.
A nation's claims on its own starting regions only carry over to the same nation's regions here,
since Terra Invicta merges some of our nations (Qatar and Bahrain are its Gulf States).

Breakaway nations (no regions at the start; tools/data/build_breakaways.py, then build_world.py
gives each capital a region) claim the region pinned as their capital, and for their other
claims the nearest of our regions in the nation that holds that Terra Invicta region.

Left out: the 2026 and 2070 scenario nations, and the alien and Protectorate claims.

    python3 -I tools/data/build_claims.py <game StreamingAssets or techtree gamefiles dir> src/content

Output rows: {"nation": ours, "region": our region id, "project"?: id, "hostile"?: true}.
A claim with no project is held from the start. Every nation also claims its own regions.
"""

import json
import math
import os
import sys

LEFT_OUT_PROJECTS = {"Project_AlienMasterProject", "Project_ProtectorateAuthority"}

# Terra Invicta's starting nations whose names differ from ours. Its "Congo" is DR Congo.
NATIONS = {
    "COD": "cod",
    "COR": "cog",
    "CPV": "cpv",
    "STP": "stp",
    "IVO": "civ",
    "USA": "usa",
    "RWB": "rwa",
    "GUS": "qat",
    "CAB": "ecs",
    "PCS": "fji",
    "MCS": "pis",
    "PLS": "pis",
    "YMS": "yem",
}

# Our nations that Terra Invicta folds into one of its own: their regions match that nation's.
# Cyprus has no Terra Invicta region, so only Cyprus claims it.
FOLDED = {"bdi": "RWB", "bhr": "GUS", "lux": "BGM", "mlt": "ITA", "slb": "PCS", "tto": "CAB"}


def load(path: str):
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Great-circle angle between two (lat, lon) points, in radians."""
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    c = math.sin(la1) * math.sin(la2) + math.cos(la1) * math.cos(la2) * math.cos(lo1 - lo2)
    return math.acos(max(-1.0, min(1.0, c)))


def main(game_dir: str, out_dir: str) -> None:
    templates = os.path.join(game_dir, "Templates")
    claims = [c for c in load(os.path.join(templates, "TIBilateralTemplate.json")) if c["relationType"] == "Claim"]
    claims = [c for c in claims if not c["nation1"][:4].isdigit() and c.get("projectUnlockName") not in LEFT_OUT_PROJECTS]
    map_regions = {m["dataName"]: m for m in load(os.path.join(templates, "TIMapRegionTemplate.json"))}
    ti_where = {r["dataName"]: (map_regions[r["mapRegionName"]]["latitude"], map_regions[r["mapRegionName"]]["longitude"]) for r in load(os.path.join(templates, "TIRegionTemplate.json")) if r.get("mapRegionName") in map_regions}

    regions = load(os.path.join(out_dir, "regions.json"))
    our_nations = load(os.path.join(out_dir, "nations.json"))
    nations = {n["id"] for n in our_nations}
    ti_names = {n["dataName"]: n["friendlyName"] for n in load(os.path.join(templates, "TINationTemplate.json"))}
    where = {r["id"]: (r["lat"], r["lon"]) for r in regions}

    # Terra Invicta's starting map: who owns each of its regions.
    ti_owner = {c["region1"]: c["nation1"] for c in claims if c.get("initialOwner")}

    def nearest(point, candidates):
        return min(candidates, key=lambda r: distance(point, ti_where[r]))

    # Terra Invicta's starting nations, matched to ours by name.
    by_name = {n["name"]: n["id"] for n in our_nations}
    ours_of = {ti: NATIONS.get(ti) or by_name.get(ti_names.get(ti, "")) for ti in set(ti_owner.values())}
    ours_of = {ti: n for ti, n in ours_of.items() if n}
    breakaway_of = {n["breakaway"]["ti"]: n for n in our_nations if "breakaway" in n}
    for ti, n in breakaway_of.items():
        ours_of[ti] = n["id"]

    # Each of our regions is the nearest Terra Invicta region owned by the same nation.
    ti_regions_of = {}
    for region, ti in ti_owner.items():
        if region in ti_where:
            ti_regions_of.setdefault(ti, []).append(region)
    matched = {}
    for r in regions:
        ti = [t for t, ours in ours_of.items() if ours == r["nationId"]] or ([FOLDED[r["nationId"]]] if r["nationId"] in FOLDED else [])
        candidates = [x for t in ti for x in ti_regions_of.get(t, [])]
        if candidates:
            matched.setdefault(nearest(where[r["id"]], candidates), []).append(r["id"])

    # A claim on a Terra Invicta region becomes a claim on every one of our regions matched to it.
    # Merged claims keep the easiest terms: held from the start beats a project, non-hostile beats hostile.
    best = {}
    nation_of = {r["id"]: r["nationId"] for r in regions}
    def targets(c) -> list[str]:
        """Our regions a claim on a Terra Invicta region lands on."""
        b = breakaway_of.get(c["nation1"])
        if b is None:
            return matched.get(c["region1"], [])
        if c.get("capitalClaim"):
            return [b["breakaway"]["capitalRegion"]]
        if matched.get(c["region1"]):
            return matched[c["region1"]]
        holder = ours_of.get(ti_owner.get(c["region1"], ""))
        candidates = [r for r in regions if r["nationId"] == holder]
        if not candidates or c["region1"] not in ti_where:
            return []
        return [min(candidates, key=lambda r: distance(where[r["id"]], ti_where[c["region1"]]))["id"]]

    for c in claims:
        nation = ours_of.get(c["nation1"])
        if nation not in nations:
            continue
        for region in targets(c):
            if c.get("initialOwner") and nation_of[region] != nation:
                continue
            project = c.get("projectUnlockName")
            row = {"nation": nation, "region": region, **({"project": project} if project else {}), **({"hostile": True} if c.get("hostileClaim") else {})}
            old = best.get((nation, region))
            rank = lambda x: (0 if "project" not in x else 1, 1 if x.get("hostile") else 0)
            if old is None or rank(row) < rank(old):
                best[(nation, region)] = row
    # Every nation claims its own regions.
    for r in regions:
        old = best.get((r["nationId"], r["id"]))
        if old is None or "project" in old:
            best[(r["nationId"], r["id"])] = {"nation": r["nationId"], "region": r["id"], **({"hostile": True} if old and old.get("hostile") else {})}

    rows = sorted(best.values(), key=lambda x: (x["nation"], x["region"]))
    with open(os.path.join(out_dir, "claims.json"), "w", encoding="utf-8") as f:
        f.write("[\n" + ",\n".join("  " + json.dumps(r, ensure_ascii=False) for r in rows) + "\n]\n")
    foreign = [r for r in rows if nation_of[r["region"]] != r["nation"]]
    print(f"{len(rows)} claims ({len(foreign)} on other nations' regions, {sum(1 for r in foreign if 'project' not in r)} of them from the start)")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
