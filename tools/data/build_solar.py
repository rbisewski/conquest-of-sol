"""Builds src/content/solarSystem.json from Terra Invicta's space bodies (TISpaceBodyTemplate).

The template is in the game's install (Templates/, with a UTF-8 BOM) and in
https://github.com/Pzixel/terra-invicta-techtree-update (public/gamefiles/stable):

    python3 -I tools/data/build_solar.py "<Terra Invicta>/TerraInvicta_Data/StreamingAssets/Templates" src/content

Kept: the Sun, the planets, their moons, the dwarf planets, asteroids and comets that have a
full set of orbital elements. Left out: the moons of asteroids and dwarf planets, Terra
Invicta's hypothetical Planet Nine, and bodies whose elements are incomplete.

Orbits are Keplerian elements at an epoch: semi-major axis (in AU, converted from km for
moons), eccentricity, inclination, longitude of the ascending node, argument of periapsis and
mean anomaly. Where the game gives the longitude of periapsis and the mean longitude instead
(Jupiter's moons), the argument of periapsis and mean anomaly are worked out from them.
"""

import json
import os
import sys

AU_KM = 149597870.7

TYPES = {
    "Star": "star",
    "Planet": "planet",
    "PlanetaryMoon": "moon",
    "DwarfPlanet": "dwarf",
    "Asteroid": "asteroid",
    "Comet": "comet",
}

# Hypothetical, not a real body.
LEFT_OUT = {"Planet9"}


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


def main(templates, out_dir):
    with open(os.path.join(templates, "TISpaceBodyTemplate.json"), encoding="utf-8-sig") as f:
        bodies = json.load(f)
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
        if kind != "star":
            orbit = elements(body)
            if orbit is None:
                continue
            a, e, i, node, peri, mean, epoch = orbit
            entry["orbit"] = {
                "a": round(a, 10),
                "e": e,
                "i": i,
                "node": round(node, 6),
                "peri": round(peri, 6),
                "meanAnomaly": round(mean, 6),
                "epoch": epoch,
            }
        out.append(entry)
    # Parents before their moons, so a body's parent is always known when it is placed.
    order = {"star": 0, "planet": 1, "dwarf": 2, "moon": 3, "asteroid": 4, "comet": 5}
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
