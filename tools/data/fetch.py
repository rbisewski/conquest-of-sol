"""Downloads the public source data for the map and nation generator into tools/data/.cache.

Sources (all free to use):
  Natural Earth (public domain): country and province borders, populated places, shaded-relief raster.
  World Bank Open Data (CC BY 4.0): population projections, GDP, Gini, governance, military spending.
  Our World in Data (CC BY 4.0): V-Dem electoral democracy index, UNDP mean years of schooling,
    Global Carbon Project annual CO2 emissions.
  USGS Astrogeology (public domain): MESSENGER MDIS global colour mosaic of Mercury (665 m/px,
    about 800 MB; Denevi et al.) and the USGS global DEM from MESSENGER stereo (665 m/px,
    about 500 MB; Becker et al.), for build_body_maps.py; the Viking colour mosaic of Mars (925 m/px,
    about 800 MB) and Dawn's DLR mosaic of Ceres (20 px/degree), for build_body_maps.py.
  NASA SVS CGI Moon Kit (public domain): the LRO LROC WAC colour map and LOLA heights, for build_body_maps.py.
  NASA PDS Geosciences (public domain): MGS MOLA MEGDR heights of Mars (16 px/degree), for build_body_maps.py.
  USGS Astrogeology (public domain): Voyager and Galileo SSI global mosaics of Io (colour), Europa,
    Ganymede (colour) and Callisto, and NASA/JPL's Cassini colour map of Jupiter (PIA07782); the
    Cassini (and Voyager) global mosaics of Mimas (DLR), Enceladus, Tethys, Dione, Rhea, Titan
    (ISS near-infrared, the surface through the haze) and Iapetus; all for build_body_maps.py.
  NASA/JPL Solar System Simulator (public domain): USGS's Voyager 2 mosaics of Miranda, Ariel,
    Umbriel, Titania and Oberon (4 px/degree, greyscale; southern hemispheres only), for
    build_body_maps.py.
  USGS Astrogeology (public domain): Voyager 2's colour mosaic of Triton and New Horizons' mosaic
    of Pluto, New Horizons' of Charon, Dawn's Framing Camera mosaic of Vesta with DLR's shape
    model of it, and DLR's Viking mosaic of Phobos; USGS's Viking map of Deimos via JPL's Solar System
    Simulator; all for build_body_maps.py.
  PDS Small Bodies Node (public domain), the converted copies its shape-model catalogue serves:
    Gaskell's models of Eros and Phoebe, the Rosetta team's of Lutetia, Thomas's of Tempel 1 and
    of Saturn's small moons, into .cache/shapes, for build_body_maps.py.

Run: python3 tools/data/fetch.py
"""

import json
import pathlib
import shutil
import urllib.request

CACHE = pathlib.Path(__file__).parent / ".cache"
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
WB = "https://api.worldbank.org/v2/country/all/indicator/{ind}?format=json&per_page=20000&date={date}{source}"

FILES = {
    "ne_50m_admin_0_countries.geojson": NE + "ne_50m_admin_0_countries.geojson",
    "ne_10m_admin_1_states_provinces.geojson": NE + "ne_10m_admin_1_states_provinces.geojson",
    "ne_10m_populated_places_simple.geojson": NE + "ne_10m_populated_places_simple.geojson",
    "NE1_50M_SR_W.zip": "https://naciscdn.org/naturalearth/50m/raster/NE1_50M_SR_W.zip",
    "owid_democracy.csv": "https://ourworldindata.org/grapher/electoral-democracy-index.csv",
    "owid_schooling.csv": "https://ourworldindata.org/grapher/mean-years-of-schooling-long-run.csv",
    "owid_co2.csv": "https://ourworldindata.org/grapher/annual-co2-emissions-per-country.csv",
    "Mercury_MESSENGER_ClrMosaic_global_665m_v3.tif": "https://planetarymaps.usgs.gov/mosaic/Mercury_MESSENGER_ClrMosaic_global_665m_v3.tif",
    "Mercury_Messenger_USGS_DEM_Global_665m_v2.tif": "https://planetarymaps.usgs.gov/mosaic/Mercury_Messenger_USGS_DEM_Global_665m_v2.tif",
    "lroc_color_poles_4k.tif": "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_4k.tif",
    "ldem_16_uint.tif": "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16_uint.tif",
    "Mars_Viking_ClrMosaic_global_925m.tif": "https://planetarymaps.usgs.gov/mosaic/Mars_Viking_ClrMosaic_global_925m.tif",
    "megt90n000eb.img": "https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/megt90n000eb.img",
    "Ceres_Dawn_FC_DLR_global_20ppd_Oct2015.tif": "https://planetarymaps.usgs.gov/mosaic/Ceres_Dawn_FC_DLR_global_20ppd_Oct2015.tif",
    "PIA07782.tif": "https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia07/pia07782/PIA07782.tif",
    "Io_GalileoSSI-Voyager_Global_Mosaic_ClrMerge_1km.tif": "https://planetarymaps.usgs.gov/mosaic/Io_GalileoSSI-Voyager_Global_Mosaic_ClrMerge_1km.tif",
    "Europa_Voyager_GalileoSSI_global_mosaic_500m.tif": "https://planetarymaps.usgs.gov/mosaic/Europa_Voyager_GalileoSSI_global_mosaic_500m.tif",
    "Ganymede_Voyager_GalileoSSI_Global_ClrMosaic_1435m.tif": "https://planetarymaps.usgs.gov/mosaic/Ganymede_Voyager_GalileoSSI_Global_ClrMosaic_1435m.tif",
    "Callisto_Voyager_GalileoSSI_global_mosaic_1km.tif": "https://planetarymaps.usgs.gov/mosaic/Callisto_Voyager_GalileoSSI_global_mosaic_1km.tif",
    "Cassini_DLR_Mimas.zip": "https://planetarymaps.usgs.gov/mosaic/Mimas/Cassini_DLR_Mimas.zip",
    "Enceladus_Cassini_mosaic_global_110m.tif": "https://planetarymaps.usgs.gov/mosaic/Enceladus_Cassini_mosaic_global_110m.tif",
    "Tethys_Cassini_mosaic_global_293m.tif": "https://planetarymaps.usgs.gov/mosaic/Tethys_Cassini_mosaic_global_293m.tif",
    "Dione_Cassini_Voyager_mosaic_global_154m.tif": "https://planetarymaps.usgs.gov/mosaic/Dione_Cassini_Voyager_mosaic_global_154m.tif",
    "Rhea_Cassini_Voyager_mosaic_global_417m.tif": "https://planetarymaps.usgs.gov/mosaic/Rhea_Cassini_Voyager_mosaic_global_417m.tif",
    "Titan_ISS_P19658_Mosaic_Global_4km.tif": "https://planetarymaps.usgs.gov/mosaic/Titan_ISS_P19658_Mosaic_Global_4km.tif",
    "Iapetus_Cassini_Voyager_mosaic_global_783m.tif": "https://planetarymaps.usgs.gov/mosaic/Iapetus_Cassini_Voyager_mosaic_global_783m.tif",
    "ura1vuu2.tif": "https://space.jpl.nasa.gov/tmaps/pix/ura1vuu2.tif",  # Ariel
    "ura2vuu2.tif": "https://space.jpl.nasa.gov/tmaps/pix/ura2vuu2.tif",  # Umbriel
    "ura3vuu2.tif": "https://space.jpl.nasa.gov/tmaps/pix/ura3vuu2.tif",  # Titania
    "ura4vuu2.tif": "https://space.jpl.nasa.gov/tmaps/pix/ura4vuu2.tif",  # Oberon
    "ura5vuu2.tif": "https://space.jpl.nasa.gov/tmaps/pix/ura5vuu2.tif",  # Miranda
    "Triton_Voyager2_ClrMosaic_GlobalFill_600m.tif": "https://planetarymaps.usgs.gov/mosaic/Triton_Voyager2_ClrMosaic_GlobalFill_600m.tif",
    "Pluto_NewHorizons_Global_Mosaic_300m_Jul2017_8bit.tif": "https://planetarymaps.usgs.gov/mosaic/Pluto_NewHorizons_Global_Mosaic_300m_Jul2017_8bit.tif",
    "Charon_NewHorizons_Global_Mosaic_300m_Jul2017_8bit.tif": "https://planetarymaps.usgs.gov/mosaic/Charon_NewHorizons_Global_Mosaic_300m_Jul2017_8bit.tif",
    "Vesta_Dawn_FC_HAMO_Mosaic_Global_74ppd.tif": "https://planetarymaps.usgs.gov/mosaic/Vesta_Dawn_FC_HAMO_Mosaic_Global_74ppd.tif",
    "Vesta_Dawn_HAMO_DTM_DLR_Global_48ppd.tif": "https://planetarymaps.usgs.gov/mosaic/Vesta_Dawn_HAMO_DTM_DLR_Global_48ppd.tif",
    "Phobos_Viking_Mosaic_40ppd_DLRcontrol.tif": "https://planetarymaps.usgs.gov/mosaic/Phobos_Viking_Mosaic_40ppd_DLRcontrol.tif",
    "mar2kuu2.tif": "https://space.jpl.nasa.gov/tmaps/pix/mar2kuu2.tif",  # Deimos
    "shapes/ver64q.tab.obj": "https://sbn.psi.edu/pds/shape-models/files/eros/ver64q.tab.obj",
    "shapes/phoebe_ver512q.tab.obj": "https://sbn.psi.edu/pds/shape-models/files/phoebe/phoebe_ver512q.tab.obj",
    "shapes/lutetia_003k_cart.obj": "https://sbn.psi.edu/pds/shape-models/files/lutetia/lutetia_003k_cart.obj",
    "shapes/tempel1_2012_cart.obj": "https://sbn.psi.edu/pds/shape-models/files/tempel1/tempel1_2012_cart.obj",
    "shapes/hyperion_30k_plt.tab.obj": "https://sbn.psi.edu/pds/shape-models/files/SATURN_SMALL_MOONS/hyperion_30k_plt.tab.obj",
    "shapes/janus_30k_plt.tab.obj": "https://sbn.psi.edu/pds/shape-models/files/SATURN_SMALL_MOONS/janus_30k_plt.tab.obj",
    "shapes/epimetheus_30k_plt.tab.obj": "https://sbn.psi.edu/pds/shape-models/files/SATURN_SMALL_MOONS/epimetheus_30k_plt.tab.obj",
    "shapes/prometheus_30k_plt.tab.obj": "https://sbn.psi.edu/pds/shape-models/files/SATURN_SMALL_MOONS/prometheus_30k_plt.tab.obj",
    "shapes/pandora_30k_plt.tab.obj": "https://sbn.psi.edu/pds/shape-models/files/SATURN_SMALL_MOONS/pandora_30k_plt.tab.obj",
    "shapes/atlas_30k_plt.tab.obj": "https://sbn.psi.edu/pds/shape-models/files/SATURN_SMALL_MOONS/atlas_30k_plt.tab.obj",
    "shapes/pan_30k_plt.tab.obj": "https://sbn.psi.edu/pds/shape-models/files/SATURN_SMALL_MOONS/pan_30k_plt.tab.obj",
    "shapes/daphnis_30k_plt.tab.obj": "https://sbn.psi.edu/pds/shape-models/files/SATURN_SMALL_MOONS/daphnis_30k_plt.tab.obj",
    "shapes/calypso_30k_plt.tab.obj": "https://sbn.psi.edu/pds/shape-models/files/SATURN_SMALL_MOONS/calypso_30k_plt.tab.obj",
    "shapes/telesto_30k_plt.tab.obj": "https://sbn.psi.edu/pds/shape-models/files/SATURN_SMALL_MOONS/telesto_30k_plt.tab.obj",
    "shapes/helene_30k_plt.tab.obj": "https://sbn.psi.edu/pds/shape-models/files/SATURN_SMALL_MOONS/helene_30k_plt.tab.obj",
}

# indicator -> (date range, extra query)
WORLD_BANK = {
    "SP.POP.TOTL": ("2025:2030", "&source=40"),  # UN-based projections for 2025–2030
    "NY.GDP.MKTP.CD": ("2015:2025", ""),
    "SI.POV.GINI": ("2005:2025", ""),
    "GOV_WGI_PV.EST": ("2015:2025", "&source=3"),  # WGI political stability
    "MS.MIL.XPND.CD": ("2015:2025", ""),
    "SP.URB.TOTL.IN.ZS": ("2015:2025", ""),
}


def download(name: str, url: str) -> None:
    target = CACHE / name
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.stat().st_size > 0:
        print(f"cached  {name}")
        return
    print(f"fetch   {name}")
    request = urllib.request.Request(url, headers={"User-Agent": "conquest-of-sol-data/1.0"})
    partial = target.with_suffix(target.suffix + ".part")
    with urllib.request.urlopen(request, timeout=600) as response, open(partial, "wb") as out:
        shutil.copyfileobj(response, out, 1 << 20)
    partial.rename(target)


def main() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    for name, url in FILES.items():
        download(name, url)
    for indicator, (date, source) in WORLD_BANK.items():
        download(f"wb_{indicator}.json", WB.format(ind=indicator, date=date, source=source))
    # Sanity check the World Bank responses are JSON arrays with data.
    for indicator in WORLD_BANK:
        data = json.loads((CACHE / f"wb_{indicator}.json").read_text())
        print(f"{indicator}: {len(data[1]) if len(data) > 1 and data[1] else 0} rows")


if __name__ == "__main__":
    main()
