"""Builds tools/data/jpl_satellites.json from JPL's planetary satellite mean elements.

    python3 -I tools/data/build_satellites.py

https://ssd.jpl.nasa.gov/sats/elem/ gives, for each moon, its elements at an epoch and the plane
they are measured from: the ecliptic (the irregular moons), the planet's equator, or the moon's
local Laplace plane, whose pole it also gives. build_solar.py turns them all into the ecliptic.
"""

import html
import json
import os
import re
import urllib.request

URL = "https://ssd.jpl.nasa.gov/sats/elem/"


def main():
    request = urllib.request.Request(URL, headers={"User-Agent": "conquest-of-sol-data/1.0"})
    page = urllib.request.urlopen(request, timeout=60).read().decode()
    table = page[page.index("<tbody>") : page.index("</tbody>")]
    rows = []
    for row in re.findall(r"<tr>(.*?)</tr>", table, re.S):
        cells = [html.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)]
        if len(cells) < 20:
            continue
        rows.append({
            "planet": cells[1],
            "name": cells[2],
            "frame": cells[5],
            "epoch": cells[6],
            "a_km": float(cells[7]),
            "e": float(cells[8]),
            "peri": float(cells[9]),
            "meanAnomaly": float(cells[10]),
            "i": float(cells[11]),
            "node": float(cells[12]),
            "poleRa": float(cells[16]) if cells[16] else None,
            "poleDec": float(cells[17]) if cells[17] else None,
        })
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "jpl_satellites.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"_source": URL, "moons": rows}, f, ensure_ascii=False, indent=0)
        f.write("\n")
    print(f"{len(rows)} moons")


if __name__ == "__main__":
    main()
