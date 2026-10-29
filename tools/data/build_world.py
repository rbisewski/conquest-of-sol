"""Builds the Earth layer from real-world data (SPEC 2.6.1).

Inputs come from tools/data/.cache (run fetch.py first). Outputs:
  src/content/nations.json   real nations with 2030 starting stats
  src/content/regions.json   regions made by clustering each nation's provinces
  public/map/earth.png       pixel-art Earth texture (equirectangular)
  public/map/regions.png     region id map for picking and tinting (RGB = region index + 1, 0 = sea)
  public/map/borders.png     nation and region border overlay (RGBA)

Run: python3 tools/data/build_world.py
Needs numpy and Pillow.
"""

from __future__ import annotations

import csv
import json
import math
import pathlib
from collections import defaultdict

import numpy as np
from PIL import Image, ImageDraw
from PIL.ImageFilter import GaussianBlur as ImageFilterGaussian

ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE = ROOT / "tools/data/.cache"
CONTENT = ROOT / "src/content"
MAP_OUT = ROOT / "public/map"
BREAKAWAYS = ROOT / "tools/data/breakaways.json"
# Breakaway homeland regions named by hand rather than after their capital city, by breakaway id.
REGION_NAMES = {"fnt": "North West Territories", "atl": "St. John's"}
# Other regions renamed by hand (they are otherwise named after their most populous province).
REGION_RENAMES = {"CAN": {"British Columbia": "Victoria", "Saskatchewan": "Regina", "Manitoba": "Winnipeg", "Ontario": "Ottawa", "Nova Scotia": "Halifax"}}
# Capitals on a provincial border whose point lands in the wrong province on our raster.
CAPITAL_PROVINCES = {"CAN": "Ontario"}

# Map resolution. Pixel art texture and id map share it so a texel is a pickable unit.
W, H = 2048, 1024
TARGET_REGIONS = 360

# ---------------------------------------------------------------------------
# Nation membership

# Territories folded into another nation: disputed areas go to the de facto
# administrator, European microstates into the surrounding country (SPEC: "grouping microstates").
FOLD = {
    "SOL": "SOM",  # Somaliland
    "CYN": "CYP",  # Northern Cyprus
    "KAS": "IND",  # Siachen Glacier
    "SAH": "MAR",  # Western Sahara (de facto administration)
    "ALD": "FIN",  # Åland
    "VAT": "ITA",
    "SMR": "ITA",
    "MCO": "FRA",
    "AND": "ESP",
    "LIE": "CHE",
}

# Island microstates grouped into one nation each, as Terra Invicta does for small neighbours.
AGGREGATES = {
    "ecs": ("Eastern Caribbean States", ["ATG", "DMA", "GRD", "KNA", "LCA", "VCT", "BRB"]),
    "pis": ("Pacific Island States", ["KIR", "TUV", "NRU", "PLW", "MHL", "FSM", "WSM", "TON", "VUT"]),
}

NAME_OVERRIDES = {
    "USA": "United States",
    "RUS": "Russia",
    "KOR": "South Korea",
    "PRK": "North Korea",
    "COD": "DR Congo",
    "COG": "Congo",
    "LAO": "Laos",
    "SYR": "Syria",
    "IRN": "Iran",
    "VNM": "Vietnam",
    "BRN": "Brunei",
    "CZE": "Czechia",
    "MKD": "North Macedonia",
    "SWZ": "Eswatini",
    "PSE": "Palestine",
    "TWN": "Taiwan",
    "XKX": "Kosovo",
    "CIV": "Côte d'Ivoire",
    "GBR": "United Kingdom",
    "BHS": "Bahamas",
    "GMB": "Gambia",
    "FSM": "Micronesia",
}

CAPITAL_OVERRIDES = {"ZAF": "Pretoria", "BOL": "La Paz", "NLD": "Amsterdam", "CIV": "Abidjan", "PSE": "Ramallah"}

# Data the World Bank does not publish. Population in millions (2030), GDP in billions USD (2030 estimate).
MANUAL_STATS = {
    # Taiwan: DGBAS / IMF WEO figures, GDP grown ~4%/yr from 2024.
    "TWN": {"population": 23.0, "gdp": 1000.0},
    # North Korea: Bank of Korea estimate of ~$28B (2023), grown 2%/yr.
    "PRK": {"gdp": 32.0},
    # Eritrea: last World Bank figure is 2011; UN estimate ~$2.5B (2021), grown 3%/yr.
    "ERI": {"gdp": 3.2},
}

# Estimated nuclear warhead inventories (SIPRI Yearbook 2025). Converted to strategic barrages below.
WARHEADS = {"RUS": 5459, "USA": 5177, "CHN": 600, "FRA": 290, "GBR": 225, "IND": 180, "PAK": 170, "ISR": 90, "PRK": 50}

# Nations with an operational orbital launch capability in 2025.
SPACE_PROGRAMS = {"USA", "RUS", "CHN", "IND", "JPN", "FRA", "ISR", "IRN", "PRK", "KOR", "NZL"}

# Active orbital launch sites (name, lat, lon, operating nation).
LAUNCH_SITES = [
    ("Cape Canaveral", 28.5, -80.6, "USA"),
    ("Vandenberg", 34.7, -120.6, "USA"),
    ("Wallops", 37.9, -75.5, "USA"),
    ("Starbase", 26.0, -97.2, "USA"),
    ("Plesetsk", 62.9, 40.6, "RUS"),
    ("Vostochny", 51.9, 128.3, "RUS"),
    ("Jiuquan", 40.96, 100.3, "CHN"),
    ("Taiyuan", 38.85, 111.6, "CHN"),
    ("Xichang", 28.25, 102.0, "CHN"),
    ("Wenchang", 19.6, 110.95, "CHN"),
    ("Satish Dhawan", 13.7, 80.2, "IND"),
    ("Tanegashima", 30.4, 131.0, "JPN"),
    ("Uchinoura", 31.25, 131.1, "JPN"),
    ("Kourou", 5.2, -52.8, "FRA"),
    ("Palmachim", 31.9, 34.7, "ISR"),
    ("Semnan", 35.2, 53.9, "IRN"),
    ("Sohae", 39.66, 124.7, "PRK"),
    ("Naro", 34.43, 127.5, "KOR"),
    ("Mahia", -39.26, 177.86, "NZL"),
]


def lon_to_x(lon: float) -> float:
    return (lon + 180.0) / 360.0 * W


def lat_to_y(lat: float) -> float:
    return (90.0 - lat) / 180.0 * H


def polygons(geometry: dict):
    if geometry["type"] == "Polygon":
        yield geometry["coordinates"]
    elif geometry["type"] == "MultiPolygon":
        yield from geometry["coordinates"]


def draw_feature(draw: ImageDraw.ImageDraw, geometry: dict, value: int) -> None:
    for poly in polygons(geometry):
        outer, *holes = poly
        if len(outer) >= 3:
            draw.polygon([(lon_to_x(x), lat_to_y(y)) for x, y, *_ in outer], fill=value)
        for hole in holes:
            if len(hole) >= 3:
                draw.polygon([(lon_to_x(x), lat_to_y(y)) for x, y, *_ in hole], fill=0)


def unit_vector(lat: float, lon: float) -> np.ndarray:
    la, lo = math.radians(lat), math.radians(lon)
    return np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])


def to_lat_lon(v: np.ndarray) -> tuple[float, float]:
    v = v / np.linalg.norm(v)
    return math.degrees(math.asin(max(-1.0, min(1.0, v[2])))), math.degrees(math.atan2(v[1], v[0]))


# ---------------------------------------------------------------------------
# Statistics


def world_bank(indicator: str) -> dict[str, list[tuple[int, float]]]:
    rows = json.loads((CACHE / f"wb_{indicator}.json").read_text())[1]
    out: dict[str, list[tuple[int, float]]] = defaultdict(list)
    for r in rows:
        if r["countryiso3code"] and r["value"] is not None:
            out[r["countryiso3code"]].append((int(r["date"]), float(r["value"])))
    for series in out.values():
        series.sort()
    return out


def latest(series: dict[str, list[tuple[int, float]]], iso: str) -> tuple[int, float] | None:
    values = series.get(iso)
    return values[-1] if values else None


def owid_latest(name: str, column: str) -> dict[str, float]:
    out: dict[str, tuple[int, float]] = {}
    with open(CACHE / name, newline="") as f:
        for row in csv.DictReader(f):
            code, value = row["Code"], row[column]
            if code and value:
                year = int(row["Year"])
                if code not in out or year > out[code][0]:
                    out[code] = (year, float(value))
    return {k: v for k, (_, v) in out.items()}


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def main() -> None:
    admin0 = json.loads((CACHE / "ne_50m_admin_0_countries.geojson").read_text())["features"]
    admin1 = json.loads((CACHE / "ne_10m_admin_1_states_provinces.geojson").read_text())["features"]
    places = json.loads((CACHE / "ne_10m_populated_places_simple.geojson").read_text())["features"]

    # --- Which nation does each Natural Earth country unit belong to?
    main_iso_by_sov: dict[str, str] = {}
    for f in admin0:
        p = f["properties"]
        if p["ADMIN"] == p["SOVEREIGNT"]:
            main_iso_by_sov[p["SOV_A3"]] = p["ADM0_A3"]

    def nation_key(adm0_a3: str, sov_a3: str) -> str | None:
        if adm0_a3 == "ATA":
            return None
        if adm0_a3 in FOLD:
            adm0_a3 = FOLD[adm0_a3]
        for key, (_, members) in AGGREGATES.items():
            if adm0_a3 in members:
                return key
        if adm0_a3 in ("PSX", "KOS", "TWN"):
            return {"PSX": "PSE", "KOS": "XKX", "TWN": "TWN"}[adm0_a3]
        main = main_iso_by_sov.get(sov_a3, adm0_a3)
        return {"PSX": "PSE", "KOS": "XKX"}.get(main, main) if adm0_a3 not in FOLD.values() else adm0_a3

    unit_nation: dict[str, str] = {}
    unit_props: dict[str, dict] = {}
    for f in admin0:
        p = f["properties"]
        key = nation_key(p["ADM0_A3"], p["SOV_A3"])
        if key:
            unit_nation[p["ADM0_A3"]] = key
            unit_props[p["ADM0_A3"]] = p

    # --- Statistics per World Bank ISO code
    pop = world_bank("SP.POP.TOTL")
    gdp = world_bank("NY.GDP.MKTP.CD")
    gini = world_bank("SI.POV.GINI")
    stability = world_bank("GOV_WGI_PV.EST")
    milex = world_bank("MS.MIL.XPND.CD")
    democracy = owid_latest("owid_democracy.csv", "Electoral democracy index")
    schooling = owid_latest("owid_schooling.csv", "Average years of schooling")

    def gdp_2030(iso: str) -> float | None:
        series = gdp.get(iso)
        if not series:
            return None
        year, value = series[-1]
        old = [v for y, v in series if y <= year - 8]
        growth = 0.04
        if old and old[0] > 0:
            span = year - next(y for y, v in series if v == old[0])
            growth = clamp((value / old[0]) ** (1 / max(span, 1)) - 1, -0.01, 0.08)
        return value / 1e9 * (1 + growth) ** (2030 - year)

    def stats_for(iso: str, fallback_props: dict | None) -> dict:
        p2030 = next((v for y, v in pop.get(iso, []) if y == 2030), None)
        p2025 = next((v for y, v in pop.get(iso, []) if y == 2025), None)
        g = gdp_2030(iso)
        manual = MANUAL_STATS.get(iso, {})
        population = manual.get("population") or (p2030 / 1e6 if p2030 else (fallback_props or {}).get("POP_EST", 0) / 1e6)
        growth = (p2030 / p2025) ** 0.2 - 1 if p2030 and p2025 else 0.0
        if manual.get("gdp"):
            g = manual["gdp"]
        if g is None and fallback_props:
            g = fallback_props.get("GDP_MD", 0) / 1000 * 1.04 ** (2030 - fallback_props.get("GDP_YEAR", 2019))
        return {
            "population": population,
            "growth": growth,
            "gdp": g or 0.0,
            "gini": (latest(gini, iso) or (0, None))[1],
            "stability": (latest(stability, iso) or (0, None))[1],
            "milex": ((latest(milex, iso) or (0, 0.0))[1]) / 1e9,
            "democracy": democracy.get(iso),
            "schooling": schooling.get(iso),
        }

    # Group country units into nations.
    members: dict[str, list[str]] = defaultdict(list)
    for adm0, key in unit_nation.items():
        members[key].append(adm0)

    # World Bank ISO for a unit (Natural Earth uses -99 for Kosovo etc.).
    def wb_iso(adm0: str) -> str:
        p = unit_props[adm0]
        iso = p["ISO_A3_EH"] if p["ISO_A3_EH"] != "-99" else p["ADM0_A3"]
        return {"KOS": "XKX", "PSX": "PSE", "SDS": "SSD"}.get(iso, iso)

    # Only units that are the nation itself (or aggregate members) contribute statistics;
    # dependencies are counted in their sovereign's figures already.
    def stat_units(key: str) -> list[str]:
        if key in AGGREGATES:
            return [m for m in members[key] if m in AGGREGATES[key][1]]
        # Only the sovereign's own unit: dependencies can share its ISO code (e.g. Australia's
        # Indian Ocean Territories) and would otherwise be counted twice.
        own = [m for m in members[key] if m == {"PSE": "PSX", "XKX": "KOS"}.get(key, key)]
        return own or members[key][:1]

    medians: dict[str, float] = {}

    raw_nations: dict[str, dict] = {}
    for key in sorted(members):
        units = stat_units(key)
        parts = [stats_for(wb_iso(u), unit_props[u]) for u in units]
        total_pop = sum(s["population"] for s in parts) or 1e-6

        def weighted(field: str) -> float | None:
            vals = [(s[field], s["population"]) for s in parts if s[field] is not None]
            if not vals:
                return None
            wsum = sum(w for _, w in vals) or 1
            return sum(v * w for v, w in vals) / wsum

        raw_nations[key] = {
            "population": total_pop,
            "gdp": sum(s["gdp"] for s in parts),
            "growth": weighted("growth") or 0.0,
            "gini": weighted("gini"),
            "stability": weighted("stability"),
            "milex": sum(s["milex"] for s in parts),
            "democracy": weighted("democracy"),
            "schooling": weighted("schooling"),
        }

    for field in ("gini", "stability", "democracy", "schooling"):
        vals = sorted(n[field] for n in raw_nations.values() if n[field] is not None)
        medians[field] = vals[len(vals) // 2]
    missing = defaultdict(list)
    for key, n in raw_nations.items():
        for field in medians:
            if n[field] is None:
                n[field] = medians[field]
                missing[field].append(key)
    print("Filled with medians:", {k: len(v) for k, v in missing.items()})

    # --- Rasterize provinces: an id map of admin-1 units.
    a1_units = []
    for f in admin1:
        p = f["properties"]
        key = unit_nation.get(p["adm0_a3"])
        if key is None:
            continue
        a1_units.append({"feature": f, "nation": key, "name": p["name"] or p["admin"], "area": p.get("area_sqkm") or 0,
                         "lat": p["latitude"], "lon": p["longitude"]})
    # Provinces of countries missing from admin-1 (rare) fall back to the country polygon.
    covered = {u["nation"] for u in a1_units}
    for adm0, key in unit_nation.items():
        if key not in covered:
            f = next(f for f in admin0 if f["properties"]["ADM0_A3"] == adm0)
            a1_units.append({"feature": f, "nation": key, "name": unit_props[adm0]["NAME"], "area": 0,
                             "lat": f["properties"].get("LABEL_Y", 0), "lon": f["properties"].get("LABEL_X", 0)})
            covered.add(key)
    print(f"{len(a1_units)} provinces")

    a1_img = Image.new("I", (W, H), 0)
    draw = ImageDraw.Draw(a1_img)
    for i, u in enumerate(a1_units):
        draw_feature(draw, u["feature"]["geometry"], i + 1)
    a1 = np.array(a1_img, dtype=np.int32)

    def lookup(raster: np.ndarray, lat: float, lon: float, search: int = 3) -> int:
        x, y = int(lon_to_x(lon)) % W, min(H - 1, max(0, int(lat_to_y(lat))))
        if raster[y, x]:
            return int(raster[y, x])
        for r in range(1, search + 1):
            for dy in range(-r, r + 1):
                for dx in range(-r, r + 1):
                    yy, xx = y + dy, (x + dx) % W
                    if 0 <= yy < H and raster[yy, xx]:
                        return int(raster[yy, xx])
        return 0

    # Province population from city populations, which tracks real distribution far
    # better than area (think Siberia vs Moscow).
    a1_pop = np.zeros(len(a1_units) + 1)
    for pl in places:
        p = pl["properties"]
        idx = lookup(a1, p["latitude"], p["longitude"])
        if idx:
            a1_pop[idx] += p["pop_max"] or 0
    pixel_count = np.bincount(a1.ravel(), minlength=len(a1_units) + 1)
    # Area of each pixel in km², which shrinks with cos(latitude).
    row_lat = 90.0 - (np.arange(H) + 0.5) * 180.0 / H
    px_km2 = (360.0 / W * 111.32) * (180.0 / H * 110.57) * np.cos(np.radians(row_lat))
    a1_area = np.bincount(a1.ravel(), weights=np.repeat(px_km2, W), minlength=len(a1_units) + 1)

    # --- How many regions each nation gets: grows with population and land area.
    by_nation: dict[str, list[int]] = defaultdict(list)
    for i, u in enumerate(a1_units):
        by_nation[u["nation"]].append(i)
    area_px = {k: sum(pixel_count[i + 1] for i in idx) for k, idx in by_nation.items()}

    def wanted(scale: float) -> dict[str, int]:
        out = {}
        for k, idx in by_nation.items():
            if k in AGGREGATES:
                out[k] = len({u for u in members[k]})
                continue
            raw = scale * (raw_nations[k]["population"] ** 0.45 + 0.02 * area_px[k] ** 0.6)
            out[k] = int(clamp(round(raw), 1, min(14, len(idx))))
        return out

    lo, hi = 0.01, 2.0
    for _ in range(40):
        mid = (lo + hi) / 2
        if sum(wanted(mid).values()) < TARGET_REGIONS:
            lo = mid
        else:
            hi = mid
    k_by_nation = wanted(lo)
    print(f"{sum(k_by_nation.values())} regions across {len(k_by_nation)} nations")

    # --- Capital cities (regions fall back to the most populous one below)
    capitals: dict[str, dict] = {}
    for pl in places:
        p = pl["properties"]
        if p["featurecla"] != "Admin-0 capital" and p["adm0cap"] != 1:
            continue
        key = unit_nation.get(p["adm0_a3"])
        if key is None or (key not in AGGREGATES and p["adm0_a3"] not in (key, {"PSE": "PSX", "XKX": "KOS"}.get(key))):
            continue
        override = CAPITAL_OVERRIDES.get(key)
        cur = capitals.get(key)
        better = cur is None or (p["pop_max"] or 0) > cur["pop"]
        if override:
            better = p["name"] == override or (cur is None)
            if cur and cur["name"] == override:
                better = False
        if better:
            capitals[key] = {"name": p["name"], "lat": p["latitude"], "lon": p["longitude"], "pop": p["pop_max"] or 0}
    # Named overrides may not be flagged as national capitals in Natural Earth (e.g. Ramallah).
    for key, wanted_name in CAPITAL_OVERRIDES.items():
        for pl in places:
            p = pl["properties"]
            if p["name"] == wanted_name and unit_nation.get(p["adm0_a3"]) == key:
                capitals[key] = {"name": p["name"], "lat": p["latitude"], "lon": p["longitude"], "pop": p["pop_max"] or 0}
                break
    # --- Breakaway capitals (tools/data/breakaways.json): each gets a region of its own,
    # as does its parent's capital, so the breakaway can secede without taking the capital.
    breakaways = json.loads(BREAKAWAYS.read_text()) if BREAKAWAYS.exists() else []
    anchors_of: dict[str, list[dict]] = defaultdict(list)
    for b in breakaways:
        anchors_of[b["parent"].upper()].append(b)

    def nearest_unit(idx: list[int], lat: float, lon: float, taken: list[int] = []) -> int:
        """The nation's province under a point, else the free one whose centre is nearest.
        Terra Invicta's map coordinates are rough, so a point may land in a neighbouring province."""
        hit = lookup(a1, lat, lon, search=2) - 1
        if hit in idx and hit not in taken:
            return hit
        v = unit_vector(lat, lon)
        free = [i for i in idx if i not in taken] or idx
        return min(free, key=lambda i: float(np.linalg.norm(unit_vector(a1_units[i]["lat"], a1_units[i]["lon"]) - v)))

    anchored_region: dict[str, int] = {}
    breakaway_city = {b["id"]: b["capital"]["name"] for b in breakaways}
    capital_unit: dict[str, int] = {}

    # --- Cluster provinces into regions (weighted k-means on the sphere, deterministic init).
    region_of_a1 = np.zeros(len(a1_units) + 1, dtype=np.int32)
    regions = []
    for key in sorted(by_nation):
        idx = by_nation[key]
        k = k_by_nation[key]
        # Pinned provinces: the capital's and each breakaway capital's, one region each.
        pinned: list[int] = []
        pinned_for: dict[int, str] = {}
        if anchors_of.get(key):
            c = capitals.get(key)
            named = [i for i in idx if a1_units[i]["name"] == CAPITAL_PROVINCES.get(key)]
            if named:
                pinned.append(named[0])
            elif c:
                pinned.append(nearest_unit(idx, c["lat"], c["lon"]))
            if pinned:
                capital_unit[key] = pinned[0]
            # Capitals that land right on a province's centre claim it first.
            def off_centre(b: dict) -> float:
                u = nearest_unit(idx, b["capital"]["lat"], b["capital"]["lon"])
                return float(np.linalg.norm(unit_vector(a1_units[u]["lat"], a1_units[u]["lon"]) - unit_vector(b["capital"]["lat"], b["capital"]["lon"])))
            for b in sorted(anchors_of[key], key=off_centre):
                unit = nearest_unit(idx, b["capital"]["lat"], b["capital"]["lon"], pinned)
                if unit in pinned:
                    print(f"  {b['name']}: its capital falls in an already pinned province of {key}")
                    continue
                pinned.append(unit)
                pinned_for[unit] = b["id"]
            k = min(len(idx), k + len(pinned_for))
        if key in AGGREGATES:
            # One region per member country.
            groups: dict[str, list[int]] = defaultdict(list)
            for i in idx:
                groups[a1_units[i]["feature"]["properties"].get("adm0_a3", "")].append(i)
            clusters = list(groups.values())
        else:
            pts = np.array([unit_vector(a1_units[i]["lat"], a1_units[i]["lon"]) for i in idx])
            weights = np.array([a1_pop[i + 1] + 2e4 + 50.0 * pixel_count[i + 1] for i in idx])
            local = {u: j for j, u in enumerate(idx)}
            centers = [pts[local[u]] for u in pinned] or [pts[int(np.argmax(weights))]]
            while len(centers) < k:
                d = np.min([np.linalg.norm(pts - c, axis=1) for c in centers], axis=0)
                for u in pinned:
                    d[local[u]] = 0
                centers.append(pts[int(np.argmax(d * np.sqrt(weights)))])
            centers = np.array(centers)
            for _ in range(30):
                assign = np.argmin(((pts[:, None, :] - centers[None, :, :]) ** 2).sum(-1), axis=1)
                # Pinned centres stay on their province, and the province stays with them.
                for c, u in enumerate(pinned):
                    assign[local[u]] = c
                for c in range(len(pinned), k):
                    m = assign == c
                    if m.any():
                        centers[c] = (pts[m] * weights[m, None]).sum(0) / weights[m].sum()
            clusters = [[idx[j] for j in range(len(idx)) if assign[j] == c] for c in range(k)]
            for c, u in enumerate(pinned):
                if u in pinned_for:
                    anchored_cluster = clusters[c]
                    anchored_cluster.sort(key=lambda i: i != u)
            clusters = [c for c in clusters if c]
        for members_idx in clusters:
            rid = len(regions)
            if members_idx[0] in pinned_for:
                anchored_region[pinned_for[members_idx[0]]] = rid
            for i in members_idx:
                region_of_a1[i + 1] = rid + 1
            best = max(members_idx, key=lambda i: a1_pop[i + 1] + pixel_count[i + 1])
            vec = sum(unit_vector(a1_units[i]["lat"], a1_units[i]["lon"]) * (a1_pop[i + 1] + 1e4) for i in members_idx)
            lat, lon = to_lat_lon(vec)
            # A breakaway's region is named after its capital city (Terra Invicta's primary city).
            # If another region of the nation already goes by that name, the home province's name is used.
            name = a1_units[best]["name"]
            if members_idx[0] in pinned_for:
                city = breakaway_city[pinned_for[members_idx[0]]]
                taken = {a1_units[max(c, key=lambda i: a1_pop[i + 1] + pixel_count[i + 1])]["name"] for c in clusters if c is not members_idx}
                name = city if city not in taken else a1_units[members_idx[0]]["name"]
                name = REGION_NAMES.get(pinned_for[members_idx[0]], name)
            if key in AGGREGATES:
                adm0 = a1_units[best]["feature"]["properties"].get("adm0_a3", "")
                name = NAME_OVERRIDES.get(adm0, unit_props.get(adm0, {}).get("NAME", name))
            regions.append({"nation": key, "name": name, "lat": lat, "lon": lon,
                            "cityPop": float(sum(a1_pop[i + 1] for i in members_idx)),
                            "px": int(sum(pixel_count[i + 1] for i in members_idx)),
                            "area": float(sum(a1_area[i + 1] for i in members_idx))})

    rid_map = region_of_a1[a1]  # 0 = sea, else region index + 1

    # --- Adjacency (land borders, wrapping at the antimeridian) and coastlines.
    neighbors: dict[int, set[int]] = defaultdict(set)
    coastal = set()
    for dy, dx in ((0, 1), (1, 0)):
        a = rid_map
        b = np.roll(rid_map, -dx, axis=1) if dx else np.vstack([rid_map[1:], rid_map[-1:]])
        diff = (a != b)
        both = diff & (a > 0) & (b > 0)
        for x, y in set(zip(a[both].tolist(), b[both].tolist())):
            neighbors[x - 1].add(y - 1)
            neighbors[y - 1].add(x - 1)
        shore = diff & ((a == 0) ^ (b == 0))
        coastal.update((a[shore & (a > 0)] - 1).tolist())
        coastal.update((b[shore & (b > 0)] - 1).tolist())

    # --- Region populations: split each nation's population by city population, with a
    # floor from area so empty regions are not literally empty.
    for key in by_nation:
        rs = [r for r in regions if r["nation"] == key]
        weights = [r["cityPop"] + 50.0 * r["px"] for r in rs]
        total = sum(weights) or 1
        for r, w in zip(rs, weights):
            r["population"] = raw_nations[key]["population"] * w / total

    for key in by_nation:
        if key not in capitals:
            r = max((r for r in regions if r["nation"] == key), key=lambda r: r["population"])
            capitals[key] = {"name": r["name"], "lat": r["lat"], "lon": r["lon"], "pop": 0}

    capital_region = {}
    for key, c in capitals.items():
        rid = int(region_of_a1[capital_unit[key] + 1]) - 1 if key in capital_unit else lookup(rid_map, c["lat"], c["lon"], search=6) - 1
        if rid < 0 or regions[rid]["nation"] != key:
            rid = max((i for i, r in enumerate(regions) if r["nation"] == key), key=lambda i: regions[i]["population"])
        capital_region[key] = rid

    launch_region: dict[int, str] = {}
    for name, lat, lon, operator in LAUNCH_SITES:
        rid = lookup(rid_map, lat, lon, search=8) - 1
        if rid >= 0:
            launch_region[rid] = name

    # --- Nation stats in game units (see docs/formulas.md, "Starting data").
    nations_out = []
    for key in sorted(by_nation):
        n = raw_nations[key]
        name = AGGREGATES[key][0] if key in AGGREGATES else NAME_OVERRIDES.get(key, unit_props.get(key, {}).get("NAME_LONG") or key)
        if key not in AGGREGATES and key in unit_props:
            name = NAME_OVERRIDES.get(key, unit_props[key]["NAME_LONG"])
        gdppc = n["gdp"] / max(n["population"], 1e-3)  # thousands of USD
        government = round(clamp(n["democracy"] * 10, 0, 10), 2)
        inequality = round(clamp((n["gini"] - 18) / 4.5, 1, 9), 2)
        stab = n["stability"]
        unrest = round(clamp(3.2 - 2.2 * stab, 0, 9.5), 2)
        cohesion = round(clamp(5 + 0.8 * stab + 0.3 * (5 - government) - 0.15 * (inequality - 4), 1, 9), 2)
        miltech = round(clamp(2 + 0.5 * math.log2(max(gdppc, 0.5) / 2), 2, 5), 2)
        # Europe (without Russia) fields about half the armies its spending would buy elsewhere.
        europe = unit_props.get(key, {}).get("CONTINENT") == "Europe" and key != "RUS"
        min_milex, per_army = (9, 5.0) if europe else (2, 2.9)
        armies = 0 if n["population"] < 6 or n["milex"] < min_milex else max(1, round(math.sqrt(n["milex"]) / per_army))
        nation_coastal = any(i in coastal for i, r in enumerate(regions) if r["nation"] == key)
        cps = max(1, min(round(n["gdp"] ** 0.18 / 1.09), 6)) if n["gdp"] > 0 else 1
        navies = min(armies, round(armies / 2)) if nation_coastal and cps >= 3 else 0
        warheads = WARHEADS.get(key, 0)
        nations_out.append({
            "id": key.lower(),
            "name": name,
            "capital": {"name": capitals[key]["name"], "lat": round(capitals[key]["lat"], 2), "lon": round(capitals[key]["lon"], 2)},
            "population": round(n["population"], 3),
            "gdp": round(n["gdp"], 2),
            "education": round(clamp(n["schooling"], 1, 20), 2),
            "inequality": inequality,
            "cohesion": cohesion,
            "democracy": government,
            "unrest": unrest,
            "populationGrowth": round(n["growth"], 5),
            "militaryTech": miltech,
            "armies": armies,
            "navies": navies,
            "nukes": math.ceil(warheads / 100),
            "spaceProgram": key in SPACE_PROGRAMS,
        })

    regions_out = []
    for i, r in enumerate(regions):
        regions_out.append({
            "id": f"{r['nation'].lower()}-{sum(1 for q in regions[:i] if q['nation'] == r['nation']) + 1}",
            "name": REGION_RENAMES.get(r["nation"], {}).get(r["name"], r["name"]),
            "nationId": r["nation"].lower(),
            "lat": round(r["lat"], 2),
            "lon": round(r["lon"], 2),
            "population": round(r["population"], 3),
            "areaKm2": round(r["area"]),
            # Unit vector of the centre, so the simulation can measure distances without trig.
            "xyz": [round(float(c), 6) for c in unit_vector(r["lat"], r["lon"])],
            "capital": capital_region.get(r["nation"]) == i,
            "coastal": i in coastal,
            "launchSite": launch_region.get(i),
            "neighbors": [],
        })
    names = [(r["nationId"], r["name"]) for r in regions_out]
    assert len(set(names)) == len(names), "two regions of a nation share a name"
    for i, ns in neighbors.items():
        regions_out[i]["neighbors"] = sorted(regions_out[j]["id"] for j in ns)
    for r in regions_out:
        if r["launchSite"] is None:
            del r["launchSite"]

    # Breakaway nations hold no regions at the start: no people or economy of their own until
    # they break away (they then take on their parent's stats), and a capital region inside
    # their parent, pinned above.
    for b in breakaways:
        rid = anchored_region.get(b["id"])
        if rid is None:
            rid = lookup(rid_map, b["capital"]["lat"], b["capital"]["lon"], search=6) - 1
            print(f"  {b['name']}: no region of its own, so it shares {regions_out[rid]['name']}")
        nations_out.append({
            "id": b["id"],
            "name": b["name"],
            "capital": {"name": b["capital"]["name"], "lat": b["capital"]["lat"], "lon": b["capital"]["lon"]},
            "population": 0, "gdp": 0, "education": 0, "inequality": 0, "cohesion": 0, "democracy": 0, "unrest": 0,
            "populationGrowth": 0, "militaryTech": 0, "armies": 0, "navies": 0, "nukes": 0, "spaceProgram": False,
            "breakaway": {"parent": b["parent"], "capitalRegion": regions_out[rid]["id"], "ti": b["ti"], **({"project": b["project"]} if b.get("project") else {})},
        })

    CONTENT.mkdir(parents=True, exist_ok=True)
    (CONTENT / "nations.json").write_text(json.dumps(nations_out, indent=1, ensure_ascii=False) + "\n")
    (CONTENT / "regions.json").write_text(json.dumps(regions_out, indent=1, ensure_ascii=False) + "\n")

    # --- Region id map, borders and art.
    MAP_OUT.mkdir(parents=True, exist_ok=True)
    rgb = np.zeros((H, W, 3), dtype=np.uint8)
    rgb[..., 0] = rid_map & 0xFF
    rgb[..., 1] = (rid_map >> 8) & 0xFF
    Image.fromarray(rgb, "RGB").save(MAP_OUT / "regions.png", optimize=True)

    nation_of = np.array([0] + [hash_nation(r["nation"]) for r in regions], dtype=np.int64)
    nat_map = nation_of[rid_map]
    borders = np.zeros((H, W, 4), dtype=np.uint8)
    for shift in ((0, 1), (1, 0)):
        other = np.roll(rid_map, -shift[1], axis=1) if shift[1] else np.vstack([rid_map[1:], rid_map[-1:]])
        other_n = nation_of[other]
        land = (rid_map > 0) & (other > 0)
        region_edge = land & (rid_map != other)
        nation_edge = land & (nat_map != other_n)
        borders[region_edge] = (210, 230, 255, 90)
        borders[nation_edge] = (255, 255, 255, 230)
    Image.fromarray(borders, "RGBA").save(MAP_OUT / "borders.png", optimize=True)

    # Antarctica belongs to no nation (no regions), but the art still shows it.
    ata_img = Image.new("L", (W, H), 0)
    ata_draw = ImageDraw.Draw(ata_img)
    for f in admin0:
        if f["properties"]["ADM0_A3"] == "ATA":
            draw_feature(ata_draw, f["geometry"], 1)
    make_art((rid_map > 0) | (np.asarray(ata_img) > 0))
    print(f"Wrote {len(nations_out)} nations and {len(regions_out)} regions")


def hash_nation(key: str) -> int:
    h = 0
    for ch in key:
        h = (h * 131 + ord(ch)) & 0x7FFFFFFF
    return h


BAYER4 = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) + 0.5) / 16 - 0.5

# Hand-picked land palette: forest, grassland, steppe, desert, rock and snow ramps.
LAND_PALETTE = np.array([
    (22, 58, 38), (30, 78, 44), (44, 102, 52), (66, 128, 58),      # forest → meadow
    (98, 146, 66), (132, 164, 78), (164, 176, 96), (124, 116, 70),  # grass, steppe, olive
    (196, 178, 116), (216, 196, 138), (232, 214, 160), (186, 140, 88),  # savanna, sand, dune
    (150, 102, 66), (110, 82, 64), (86, 76, 72), (128, 122, 116),   # rust, brown, rock
    (170, 168, 164), (206, 216, 226), (236, 242, 248), (255, 255, 255),  # scree, ice, snow
], dtype=np.float32)

# Three ocean bands from the coast outwards, plus a lighter shelf band.
SEA_BANDS = np.array([(58, 120, 178), (40, 92, 152), (28, 64, 120), (20, 44, 92)], dtype=np.float32)


def make_art(land: np.ndarray) -> None:
    """Turns Natural Earth's shaded relief into pixel art: downsample, stretch contrast,
    map onto a hand-picked palette with ordered dithering, band the ocean, outline coasts."""
    Image.MAX_IMAGE_PIXELS = None
    src = Image.open(CACHE / "ne1/NE1_50M_SR_W/NE1_50M_SR_W.tif").convert("RGB")
    img = np.asarray(src.resize((W, H), Image.Resampling.BOX), dtype=np.float32)

    raw = img.copy()
    # Stretch brightness over the land's 2nd–98th percentile (same for every channel, so
    # hues survive) and boost saturation, so the pale source raster separates into biomes.
    lum = img.mean(axis=2)
    lo, hi = np.percentile(lum[land], (2, 98))
    img = (img - lo) / max(hi - lo, 1) * 235 + 10
    grey = img.mean(axis=2, keepdims=True)
    img = np.clip(grey + (img - grey) * 2.2, 0, 255)
    # Relief shading: emphasise the raster's hillshade by contrasting with a blurred copy.
    blur = np.asarray(Image.fromarray(img.astype(np.uint8)).filter(ImageFilterGaussian(3)), dtype=np.float32)
    img = np.clip(img + (img - blur) * 1.2, 0, 255)

    tile = np.tile(BAYER4, (H // 4, W // 4))[..., None]
    dithered = img + tile * 28
    d = ((dithered[..., None, :] - LAND_PALETTE[None, None, :, :]) ** 2).sum(-1)
    # Snow and ice only where the source is genuinely white-grey (glaciers, high peaks) or
    # near the poles; bright desert sand must not turn into snow.
    raw_sat = raw.max(axis=2) - raw.min(axis=2)
    lat = (90.0 - (np.arange(H) + 0.5) * 180.0 / H)[:, None]
    # Below 40° latitude only rugged terrain (high local contrast in the hillshade) can be
    # snow-capped, which keeps salt flats in the Sahara from reading as snow.
    raw_lum = raw.mean(axis=2)
    local_mean = np.asarray(Image.fromarray(raw_lum.astype(np.uint8)).filter(ImageFilterGaussian(4)), dtype=np.float32)
    local_sq = np.asarray(Image.fromarray(np.clip((raw_lum - local_mean) ** 2, 0, 255).astype(np.uint8)).filter(ImageFilterGaussian(4)), dtype=np.float32)
    rugged = local_sq > 40
    snowy = ((raw_sat < 18) & (raw_lum > 200) & ((np.abs(lat) > 40) | rugged)) | (np.abs(lat) > 62)
    d[..., 17:] = np.where(snowy[..., None], d[..., 17:], np.inf)
    out = LAND_PALETTE[np.argmin(d, axis=-1)]

    # Ocean: distance bands with dithered edges between them.
    dist = coast_distance(land, steps=24) + np.tile(BAYER4, (H // 4, W // 4)) * 3
    band = np.digitize(dist, [3, 8, 16])
    out = np.where(land[..., None], out, SEA_BANDS[band])

    # Dark 1-px outline on the land side of every coast.
    shore = land & ~(shift_rows(land, 1) & shift_rows(land, -1) & np.roll(land, 1, 1) & np.roll(land, -1, 1))
    out[shore] = out[shore] * 0.55
    Image.fromarray(out.astype(np.uint8), "RGB").save(MAP_OUT / "earth.png", optimize=True)


def shift_rows(mask: np.ndarray, n: int) -> np.ndarray:
    """A mask moved down (n = 1) or up (n = -1) a row. Columns wrap at the antimeridian, but
    rows don't: Antarctica at the bottom edge isn't next to the Arctic at the top."""
    return np.vstack([mask[:1], mask[:-1]]) if n > 0 else np.vstack([mask[1:], mask[-1:]])


def coast_distance(land: np.ndarray, steps: int) -> np.ndarray:
    """Approximate distance from land in pixels. Alternating 4- and 8-neighbour growth gives
    octagonal rings instead of diamonds."""
    dist = np.where(land, 0, steps).astype(np.float32)
    frontier = land.copy()
    for d in range(1, steps):
        grown = frontier | shift_rows(frontier, 1) | shift_rows(frontier, -1) | np.roll(frontier, 1, 1) | np.roll(frontier, -1, 1)
        if d % 2 == 0:
            diag = shift_rows(frontier, 1)
            grown |= np.roll(diag, 1, 1) | np.roll(diag, -1, 1)
            diag = shift_rows(frontier, -1)
            grown |= np.roll(diag, 1, 1) | np.roll(diag, -1, 1)
        newly = grown & ~frontier
        dist[newly] = d
        frontier = grown
    return dist


if __name__ == "__main__":
    main()
