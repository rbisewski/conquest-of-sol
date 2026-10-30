"""Builds src/content/solarSystem.json from Terra Invicta's space bodies (TISpaceBodyTemplate).

The template is in the game's install (Templates/, with a UTF-8 BOM) and in
https://github.com/Pzixel/terra-invicta-techtree-update (public/gamefiles/stable):

    python3 -I tools/data/build_solar.py "<Terra Invicta>/TerraInvicta_Data/StreamingAssets/Templates" src/content

Kept: every body with a full set of orbital elements: the Sun, the planets, their moons (large
and asteroidal), the dwarf planets and their moons, asteroids and comets. Bodies whose elements
are incomplete in the game, and those it gets wrong, take published orbits from solar_overrides.json
(each entry names its source); the rest are left out (most moons of asteroids and dwarf planets),
as is Terra Invicta's hypothetical Planet Nine.

A body's composition is Terra Invicta's "Type": the mining profile most of its hab sites have
(TIHabSiteTemplate; ties go to the first listed), by its display name in
Localization/en/TIMiningProfileTemplate.en beside Templates/. Bodies without sites have none.

Moons' orbits are JPL's where it lists them (jpl_satellites.json, from build_satellites.py), as
the game's are measured from a mix of planes; every orbit here is measured from the ecliptic, so
a moon's plane tilts with its planet (see moon_orbit). A moon JPL doesn't list keeps the game's
elements; if it is near its planet and nearly in the equator's plane, they are taken to be
measured from the equator.

Orbits are Keplerian elements at an epoch: semi-major axis (in AU, converted from km for
moons), eccentricity, inclination, longitude of the ascending node, argument of periapsis and
mean anomaly. Where the game gives the longitude of periapsis and the mean longitude instead
(Jupiter's moons), the argument of periapsis and mean anomaly are worked out from them.
"""

import collections
import datetime
import json
import math
import os
import sys

AU_KM = 149597870.7
J2000_JD = 2451545.0

TYPES = {
    "Star": "star",
    "Planet": "planet",
    "PlanetaryMoon": "moon",
    "AsteroidalMoon": "asteroidalMoon",
    "DwarfPlanet": "dwarf",
    "Asteroid": "asteroid",
    "Comet": "comet",
}

# Hypothetical, not a real body.
LEFT_OUT = {"Planet9"}

OBLIQUITY_DEG = 23.4392911
# The poles the planets spin about (IAU, J2000), the way their moons go round: the IAU's own "north"
# for Uranus is the opposite end, as it turns backwards.
SPIN_POLES = {
    "Mars": (317.681, 52.887),
    "Jupiter": (268.057, 64.495),
    "Saturn": (40.589, 83.537),
    "Uranus": (77.311, 15.175),
    "Neptune": (299.36, 43.46),
    "Pluto": (132.993, -6.163),
}
# Moons whose names differ between the game and JPL (whose table misspells Megaclite).
JPL_NAMES = {"Luna": "Moon", "Megaclite": "Magaclite"}
# A moon JPL doesn't list counts as equatorial nearer than this and at less than this inclination.
EQUATORIAL_KM = 1e6
EQUATORIAL_DEG = 10


def julian_year(date):
    """A JPL epoch such as 2020-01-01.5, as a Julian year (2000.0 = J2000)."""
    day, _, fraction = date.partition(".")
    days = (datetime.date.fromisoformat(day) - datetime.date(2000, 1, 1)).days + float("0." + (fraction or "0")) - 0.5
    return round(2000 + days / 365.25, 6)


def moon_orbit(i, node, peri, pole):
    """
    Turns (i, node, argument of periapsis) in degrees, measured from the plane square to a pole
    (right ascension, declination) with the node counted from where that plane crosses the
    celestial equator going north, into the same measured from the ecliptic.
    """
    ra, dec = math.radians(pole[0]), math.radians(pole[1])
    z = (math.cos(dec) * math.cos(ra), math.cos(dec) * math.sin(ra), math.sin(dec))
    x = (-math.sin(ra), math.cos(ra), 0.0)
    y = (z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0])
    ci, si, cn, sn, cw, sw = (f(math.radians(v)) for v, f in ((i, math.cos), (i, math.sin), (node, math.cos), (node, math.sin), (peri, math.cos), (peri, math.sin)))
    # Towards periapsis, and the orbit's pole, in that plane's axes.
    local_p = (cn * cw - sn * sw * ci, sn * cw + cn * sw * ci, sw * si)
    local_h = (sn * si, -cn * si, ci)
    ce, se = math.cos(math.radians(OBLIQUITY_DEG)), math.sin(math.radians(OBLIQUITY_DEG))

    def ecliptic(v):
        c = [v[0] * x[k] + v[1] * y[k] + v[2] * z[k] for k in range(3)]
        return c[0], c[1] * ce + c[2] * se, -c[1] * se + c[2] * ce

    p, h = ecliptic(local_p), ecliptic(local_h)
    new_i = math.degrees(math.acos(max(-1, min(1, h[2]))))
    new_node = math.atan2(h[0], -h[1])
    n = (math.cos(new_node), math.sin(new_node), 0.0)
    across = (h[1] * n[2] - h[2] * n[1], h[2] * n[0] - h[0] * n[2], h[0] * n[1] - h[1] * n[0])
    new_peri = math.atan2(sum(p[k] * across[k] for k in range(3)), sum(p[k] * n[k] for k in range(3)))
    return new_i, math.degrees(new_node) % 360, math.degrees(new_peri) % 360


def radius_km(body):
    for key in ("equatorialRadius_km", "meanRadius_km"):
        if body.get(key):
            return body[key]
    return body.get("friendlyDiameter", 0) / 2


def elements(body):
    """The orbit as (a in AU, e, i, node, argument of periapsis, mean anomaly, epoch), or None if incomplete."""
    a = body.get("semiMajorAxis_AU")
    if a is None and body.get("semiMajorAxis_km") is not None:
        a = body["semiMajorAxis_km"] / AU_KM
    e = body.get("eccentricity")
    i = body.get("inclination_Deg")
    node = body.get("longAscendingNode_Deg")
    peri = body.get("argPeriapsis_Deg")
    mean = body.get("meanAnomalyAtEpoch_Deg")
    if peri is None and body.get("longPeriapsis_Deg") is not None and node is not None:
        peri = body["longPeriapsis_Deg"] - node
    if mean is None and body.get("meanLongitude_Deg") is not None and body.get("longPeriapsis_Deg") is not None:
        mean = body["meanLongitude_Deg"] - body["longPeriapsis_Deg"]
    if None in (a, e, i, node, peri, mean):
        return None
    epoch = body.get("epoch_floatJYears", 2000)
    return a, e, i, node % 360, peri % 360, mean % 360, epoch


def compositions(templates):
    """Each body's most common hab-site mining profile, by display name."""
    with open(os.path.join(templates, "TIHabSiteTemplate.json"), encoding="utf-8-sig") as f:
        sites = json.load(f)
    names = {}
    with open(os.path.join(templates, "..", "Localization", "en", "TIMiningProfileTemplate.en"), encoding="utf-8-sig") as f:
        for line in f:
            key, _, value = line.strip().partition("=")
            if key.startswith("TIMiningProfileTemplate.displayName."):
                names[key.rsplit(".", 1)[1]] = value
    profiles = collections.defaultdict(collections.Counter)
    for site in sites:
        profiles[site["parentBodyName"]][site["miningProfileName"]] += 1
    return {body: names[counts.most_common(1)[0][0]] for body, counts in profiles.items()}


def main(templates, out_dir):
    with open(os.path.join(templates, "TISpaceBodyTemplate.json"), encoding="utf-8-sig") as f:
        bodies = json.load(f)
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "solar_overrides.json"), encoding="utf-8") as f:
        overrides = json.load(f)
    for body in bodies:
        fix = overrides.get(body["dataName"])
        if fix:
            body.update({k: v for k, v in fix.items() if not k.startswith("_") and k != "epochJD"})
            if "epochJD" in fix:
                body["epoch_floatJYears"] = round(2000 + (fix["epochJD"] - J2000_JD) / 365.25, 6)
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "jpl_satellites.json"), encoding="utf-8") as f:
        # By name, those JPL has no name for by their provisional designations without the underscores.
        satellites = {(m["planet"], m["name"].replace("_", "")): m for m in json.load(f)["moons"]}
    composition = compositions(templates)
    out = []
    for body in bodies:
        kind = TYPES.get(body["objectType"])
        if not kind or body["dataName"] in LEFT_OUT:
            continue
        entry = {
            "id": body["dataName"],
            "name": body.get("friendlyName") or body["dataName"],
            "type": kind,
            "parent": body.get("barycenterName"),
            "radiusKm": round(radius_km(body), 3),
            "massKg": body.get("mass_kg", 0),
        }
        if body["dataName"] in composition:
            entry["composition"] = composition[body["dataName"]]
        if kind != "star":
            orbit = elements(body)
            if orbit is None:
                continue
            a, e, i, node, peri, mean, epoch = orbit
            local_i = None
            if kind in ("moon", "asteroidalMoon"):
                parent, name = body["barycenterName"], entry["name"]
                jpl = satellites.get((parent, JPL_NAMES.get(name, name))) or satellites.get((parent, body["dataName"]))
                if jpl and abs(jpl["a_km"] / AU_KM - a) / a > 0.1:
                    print(f"{name}: JPL's orbit is too unlike the game's to be the same moon; left as it is")
                    jpl = None
                if jpl:
                    a, e, i, node, peri, mean = jpl["a_km"] / AU_KM, jpl["e"], jpl["i"], jpl["node"], jpl["peri"], jpl["meanAnomaly"]
                    epoch = julian_year(jpl["epoch"])
                    frame = jpl["frame"]
                    pole = (jpl["poleRa"], jpl["poleDec"]) if frame == "Laplace" else SPIN_POLES.get(parent)
                else:
                    frame = "equatorial" if parent in SPIN_POLES and a * AU_KM < EQUATORIAL_KM and i < EQUATORIAL_DEG else "ecliptic"
                    pole = SPIN_POLES.get(parent)
                    print(f"{name}: not in JPL's table; the game's elements, taken as {frame}")
                if frame != "ecliptic":
                    local_i = i
                    i, node, peri = moon_orbit(i, node, peri, pole)
                    i = round(i, 6)
            entry["orbit"] = {
                "a": round(a, 10),
                "e": e,
                "i": i,
                "node": round(node, 6),
                "peri": round(peri, 6),
                "meanAnomaly": round(mean, 6),
                "epoch": epoch,
            }
            if local_i is not None:
                entry["orbit"]["localI"] = local_i
        out.append(entry)
    # Parents before their moons, so a body's parent is always known when it is placed.
    order = {"star": 0, "planet": 1, "dwarf": 2, "moon": 3, "asteroidalMoon": 4, "asteroid": 5, "comet": 6}
    out.sort(key=lambda b: order[b["type"]])
    with open(os.path.join(out_dir, "solarSystem.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    counts = {}
    for b in out:
        counts[b["type"]] = counts.get(b["type"], 0) + 1
    print(f"{len(out)} bodies: {counts}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
