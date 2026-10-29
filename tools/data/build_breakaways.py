"""Lists Terra Invicta's breakaway nations: the ones that hold no regions at the start.

They come into being through secession, Increase Unrest, Annex Region or a grant of
independence, in their desired capital region (the claim TIBilateralTemplate marks
capitalClaim). This writes tools/data/breakaways.json, which build_world.py reads to give each
breakaway capital a region of its own (a province cluster pinned to the game's map region), and
which build_claims.py reads to add their claims. Run it before both:

    python3 -I tools/data/build_breakaways.py <game StreamingAssets or techtree gamefiles dir>

Left out: the alien nation and the Protectorate Authority (no alien nation here yet).
Ids are Terra Invicta's codes in lower case, renamed where they clash with an ISO code we use.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_claims import FOLDED, NATIONS, load  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "tools", "data", "breakaways.json")

LEFT_OUT = {"ALN", "PRA"}
# Terra Invicta codes that are ISO codes of other nations we have.
RENAMED = {"ARE": "arw", "CRI": "crm", "MDV": "mrd", "SVN": "rvn"}


def main(game_dir: str) -> None:
    templates = os.path.join(game_dir, "Templates")
    claims = [c for c in load(os.path.join(templates, "TIBilateralTemplate.json")) if c["relationType"] == "Claim" and not c["nation1"][:4].isdigit()]
    map_regions = {m["dataName"]: m for m in load(os.path.join(templates, "TIMapRegionTemplate.json"))}
    ti_regions = {r["dataName"]: r for r in load(os.path.join(templates, "TIRegionTemplate.json"))}
    ti_names = {n["dataName"]: n["friendlyName"] for n in load(os.path.join(templates, "TINationTemplate.json"))}
    nations = json.load(open(os.path.join(ROOT, "src", "content", "nations.json"), encoding="utf-8"))
    by_name = {n["name"]: n["id"] for n in nations}
    ours = {n["id"] for n in nations}

    owner = {c["region1"]: c["nation1"] for c in claims if c.get("initialOwner")}
    starting = set(owner.values())
    folded_into = {ti: our for our, ti in FOLDED.items()}

    def our_nation(ti: str) -> str | None:
        return NATIONS.get(ti) or by_name.get(ti_names.get(ti, "")) or folded_into.get(ti)

    out = []
    for c in claims:
        ti = c["nation1"]
        if ti in starting or ti in LEFT_OUT or not c.get("capitalClaim"):
            continue
        region = ti_regions[c["region1"]]
        where = map_regions[region["mapRegionName"]]
        parent = our_nation(owner[c["region1"]])
        if parent is None:
            print(f"skipped {ti_names[ti]}: no parent for {c['region1']}")
            continue
        nation_id = RENAMED.get(ti, ti.lower())
        assert nation_id not in ours, f"{ti} clashes with nation id {nation_id}"
        out.append({
            "id": nation_id,
            "ti": ti,
            "name": ti_names[ti],
            "parent": parent,
            "capital": {"region": c["region1"], "name": region.get("primaryCity") or c["region1"], "lat": round(where["latitude"], 3), "lon": round(where["longitude"], 3)},
            **({"project": c["projectUnlockName"]} if c.get("projectUnlockName") else {}),
        })
    out.sort(key=lambda b: b["id"])
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("[\n" + ",\n".join("  " + json.dumps(b, ensure_ascii=False) for b in out) + "\n]\n")
    shared = len(out) - len({b["capital"]["region"] for b in out})
    print(f"{len(out)} breakaway nations ({shared} share a capital region with another)")


if __name__ == "__main__":
    main(sys.argv[1])
