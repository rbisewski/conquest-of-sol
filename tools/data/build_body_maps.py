"""Builds the pixel-art surface maps of the bodies the camera can come right down to, in public/map:
Mercury, Luna, Mars, Ceres, Jupiter, its four great moons, seven of Saturn's, five of Uranus's,
Triton, Pluto, Charon, Vesta (its shape too), Phobos and Deimos from spacecraft data; Venus, Saturn, Uranus and Neptune (their clouds) and Eris,
Haumea and Makemake (never seen close) made up.

Sources (public domain; downloaded by fetch.py into tools/data/.cache):
  Mercury: USGS Astrogeology's MESSENGER MDIS global colour mosaic, 665 m/px (Denevi et al.; the
    1000, 750 and 430 nm filters as red, green and blue) and USGS global DEM from MESSENGER stereo,
    665 m/px (Becker et al.; signed 16-bit metres, longitudes 0° to 360° east).
  Luna: NASA SVS's CGI Moon Kit: the LRO LROC WAC colour map (4096 × 2048) and LOLA heights at
    16 px/degree (unsigned 16-bit, half-metres).
  Mars: USGS's Viking colour mosaic, 925 m/px, and MGS MOLA's MEGDR heights at 16 px/degree (PDS
    Geosciences; big-endian signed 16-bit metres, longitudes 0° to 360° east).
  Ceres: DLR's Dawn Framing Camera global mosaic at 20 px/degree (USGS; greyscale).
  Jupiter: NASA/JPL/Space Science Institute's Cassini cylindrical colour map, PIA07782.
  Io, Europa, Ganymede, Callisto: USGS's Voyager–Galileo SSI global mosaics (Io's and Ganymede's
    in colour; west-positive longitudes from −180° to 180°, drawn east to the right as ours are).
  Saturn's moons: USGS's Cassini (and Voyager) global mosaics, Mimas's DLR basemap inside its zip.
  Miranda, Ariel, Umbriel, Titania, Oberon: USGS's Voyager 2 mosaics at 4 px/degree, from NASA/JPL's
    Solar System Simulator (greyscale; southern hemispheres only, the rest made up from them).
  Charon: USGS's New Horizons LORRI mosaic, greyscale (south of about 30°S made up).
  Vesta: DLR's Dawn Framing Camera mosaic (HAMO, 74 px/degree) and DLR's HAMO shape model (48
    px/degree, the radius in metres), both via USGS.
  Phobos: DLR's Viking mosaic at 40 px/degree (USGS; greyscale). Deimos: USGS's Viking map at
    4 px/degree, from NASA/JPL's Solar System Simulator (greyscale; its unimaged parts flat grey).
  Triton: USGS's Voyager 2 colour mosaic, gaps filled from lower-resolution views (the far north
    made up). Pluto: USGS's New Horizons LORRI mosaic, greyscale, 0° to 360° east (south of about
    30°S made up).
  Venus: no source; its cloud tops after Mariner 10's view (NASA/JPL-Caltech PIA23791): cream
    white, a mottled peach band across the low latitudes, white streaks sweeping poleward in
    chevrons, brighter towards the poles.

Run: python3 -I tools/data/build_body_maps.py [body ...]   (all of them by default)

Every map is equirectangular, 1024 × 512, longitude −180° to 180° east left to right, like
earth.png. Where a mosaic is photometrically flattened (Mercury's, the Moon's) the relief comes
from the DEM, a hillshade lit from the north-west as in shaded-relief maps, mixed into its
brightness; Mars's and Ceres's mosaics are made of sunlit images, so they carry their own
shading (Mars gets a little of MOLA's on top). Colour is pulled back from the mosaics' stretch to
each body's real tones, keeping the regional differences; gaps and noisy poles are filled from
around them. Then each map is put onto a hand-picked palette with ordered dithering.
"""

from io import BytesIO
import pathlib
import sys
import zipfile

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE = ROOT / "tools/data/.cache"
MAP_OUT = ROOT / "public/map"

W, H = 1024, 512
LAT = (90.0 - (np.arange(H) + 0.5) * 180.0 / H)[:, None] * np.ones((1, W))
LON = (-180.0 + (np.arange(W) + 0.5) * 360.0 / W)[None, :] * np.ones((H, 1))

BAYER4 = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) + 0.5) / 16 - 0.5


def blur(a: np.ndarray, radius: float) -> np.ndarray:
    """Gaussian blur of a float array (sigma = radius), wrapping in longitude, clamped at the poles."""
    pad = int(radius * 3) + 1
    x = np.arange(-pad, pad + 1)
    kernel = np.exp(-0.5 * (x / radius) ** 2)
    kernel /= kernel.sum()
    wide = np.concatenate([a[:, -pad:], a, a[:, :pad]], axis=1)
    rows = np.stack([np.convolve(row, kernel, mode="valid") for row in wide])
    tall = np.concatenate([np.repeat(rows[:1], pad, 0), rows, np.repeat(rows[-1:], pad, 0)], axis=0)
    return np.stack([np.convolve(col, kernel, mode="valid") for col in tall.T]).T


def fill(values: np.ndarray, valid: np.ndarray) -> np.ndarray:
    """Fills invalid cells from the valid ones around them (normalised convolution, widening)."""
    out = values.copy()
    for radius in (2, 4, 8, 16, 32, 64):
        weight = blur(valid.astype(np.float64), radius)
        smooth = blur(np.where(valid, values, 0), radius) / np.maximum(weight, 1e-6)
        take = ~valid & (weight > 0.05)
        out[take] = smooth[take]
        values = np.where(take, smooth, values)
        valid = valid | take
    return out


def hillshade(height: np.ndarray, radius_m: float, exaggeration: float) -> np.ndarray:
    """Lambertian hillshade over the flat-ground value (1 on flat ground), lit from the north-west at 35°."""
    metres = 2 * np.pi * radius_m / W
    dzdx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * metres * np.maximum(np.cos(np.radians(LAT)), 0.05))
    dzdy = (np.vstack([height[:1], height[:-1]]) - np.vstack([height[1:], height[-1:]])) / (2 * metres)
    dzdx, dzdy = dzdx * exaggeration, dzdy * exaggeration
    az, alt = np.radians(315), np.radians(35)
    lx, ly, lz = np.cos(alt) * np.sin(az), np.cos(alt) * np.cos(az), np.sin(alt)
    n = np.sqrt(dzdx**2 + dzdy**2 + 1)
    return np.clip((-dzdx * lx - dzdy * ly + lz) / n, 0, 1) / lz


def mosaic(name: str, mode: str = "RGB", member: str | None = None) -> np.ndarray:
    """A global mosaic from the cache (or a file inside a zip there, read without unpacking it), averaged down to the map's size."""
    Image.MAX_IMAGE_PIXELS = None
    source = BytesIO(zipfile.ZipFile(CACHE / name).read(member)) if member else CACHE / name
    return np.asarray(Image.open(source).convert(mode).resize((W, H), Image.Resampling.BOX), dtype=np.float64)


def heights(grid: np.ndarray, roll_half: bool) -> np.ndarray:
    """A height grid sampled at twice the map's size and averaged down; longitudes 0–360° rolled to −180–180°."""
    rows = ((np.arange(2 * H) + 0.5) * grid.shape[0] / (2 * H)).astype(int)
    cols = ((np.arange(2 * W) + 0.5) * grid.shape[1] / (2 * W)).astype(int)
    h = np.asarray(grid[rows][:, cols], dtype=np.float64)
    if roll_half:
        h = np.roll(h, W, axis=1)
    return h.reshape(H, 2, W, 2).mean(axis=(1, 3))


def stretch(a: np.ndarray, valid: np.ndarray, lo_pct: float, hi_pct: float) -> np.ndarray:
    lo, hi = np.percentile(a[valid], (lo_pct, hi_pct))
    return np.clip((a - lo) / (hi - lo), 0, 1)


def colour_index(rgb: np.ndarray, valid: np.ndarray) -> np.ndarray:
    """Red against blue, −1 (bluest few percent) to 1 (reddest)."""
    c = (rgb[..., 0] - rgb[..., 2]) / np.maximum(rgb.sum(axis=2), 1)
    lo, hi = np.percentile(c[valid], (3, 97))
    return np.clip((c - (lo + hi) / 2) / ((hi - lo) / 2), -1, 1)


def save(name: str, rgb: np.ndarray, palette: list[tuple[int, int, int]], dither: float) -> None:
    """Puts a map onto a palette with ordered dithering and writes it."""
    pal = np.array(palette, dtype=np.float32)
    dithered = rgb + np.tile(BAYER4, (H // 4, W // 4))[..., None] * dither
    d = ((dithered[..., None, :] - pal[None, None, :, :]) ** 2).sum(-1)
    out = pal[np.argmin(d, axis=-1)]
    MAP_OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(out.astype(np.uint8), "RGB").save(MAP_OUT / name, optimize=True)
    print(f"{name} {W}x{H}, {len(np.unique(out.reshape(-1, 3), axis=0))} colours")


def kmeans_palette(rgb: np.ndarray, k: int) -> list[tuple[int, int, int]]:
    """A palette of k colours that fits a map (k-means, seeded deterministically along its brightness)."""
    pixels = rgb.reshape(-1, 3)[::7].astype(np.float64)
    order = np.argsort(pixels.sum(axis=1))
    centres = pixels[order[np.linspace(0, len(order) - 1, k).astype(int)]].copy()
    for _ in range(25):
        label = np.argmin(((pixels[:, None, :] - centres[None]) ** 2).sum(-1), axis=1)
        for j in range(k):
            members = pixels[label == j]
            if len(members):
                centres[j] = members.mean(axis=0)
    return [tuple(int(round(v)) for v in c) for c in centres]


def ramp(value: np.ndarray, stops: list[tuple[float, tuple[int, int, int]]]) -> np.ndarray:
    """Colours along a ramp of (value, colour) stops, for a greyscale mosaic."""
    xs = [s[0] for s in stops]
    return np.stack([np.interp(value, xs, [s[1][i] for s in stops]) for i in range(3)], axis=-1)


def tinted(grey: np.ndarray, tint: np.ndarray, base: tuple[float, float, float], warm: tuple[float, float, float]) -> np.ndarray:
    """A grey turned to a body's tone (base multipliers), warmed by positive tint and cooled by negative."""
    return np.stack([grey * (base[i] + warm[i] * tint) for i in range(3)], axis=-1)


def mercury() -> None:
    # The mosaic's colour is noise below 68°S; towards the poles (north of 78°, a gap; south of
    # 72°S) brightness and colour fade to the average so the relief alone shows; the DEM,
    # poorer in the south, is smoothed a little beyond 74°S.
    rgb = mosaic("Mercury_MESSENGER_ClrMosaic_global_665m_v3.tif")
    # Gaps are black, and averaging down blends their edges, so they are widened a little.
    valid = blur((rgb.min(axis=2) > 4).astype(np.float64), 1) > 0.98
    lum = fill(rgb.mean(axis=2), valid)
    colour = (rgb[..., 0] - rgb[..., 2]) / np.maximum(rgb.sum(axis=2), 1)
    colour = fill(colour, valid & (LAT > -68))
    albedo = stretch(lum, valid, 2, 99.5)
    c_lo, c_hi = np.percentile(colour[valid], (3, 97))
    tint = np.clip((colour - (c_lo + c_hi) / 2) / ((c_hi - c_lo) / 2), -1, 1)
    polar = np.clip(np.maximum((LAT - 78) / 6, (-72 - LAT) / 6), 0, 1)
    albedo = albedo * (1 - polar) + np.median(albedo[valid]) * polar
    tint = tint * (1 - polar)

    # The DEM, read straight: Pillow mistakes its signed 16-bit samples for 32-bit.
    dem = np.memmap(CACHE / "Mercury_Messenger_USGS_DEM_Global_665m_v2.tif", dtype="<i2", mode="r", offset=92981, shape=(11520, 23040))
    height = heights(dem, roll_half=True)
    south = np.clip((-74 - LAT) / 10, 0, 1)
    height = height * (1 - south) + blur(height, 1.2) * south
    relief = hillshade(height, 2439400, 6)

    value = np.clip((0.22 + 0.7 * albedo) * (0.55 + 0.315 * relief) * 1.05, 0, 1.1)
    grey = 26 + value * 214
    # Brownish grey; the bluish low-reflectance material and the warmer smooth plains kept.
    save("mercury.png", tinted(grey, tint, (1.03, 1.0, 0.95), (0.05, 0.01, -0.055)), [
        (30, 30, 34), (46, 47, 52),                                   # shadow
        (62, 65, 72), (84, 87, 95), (108, 111, 118), (134, 137, 143),  # cool
        (72, 68, 63), (96, 91, 84), (122, 116, 107), (148, 141, 130), (172, 165, 153),  # neutral
        (118, 104, 88), (146, 129, 108), (174, 156, 130),             # warm
        (196, 196, 194), (220, 222, 224), (242, 244, 246),            # bright
    ], dither=9)


def luna() -> None:
    # LROC's colour map is normalised reflectance (no shadows), so the relief comes from LOLA.
    rgb = mosaic("lroc_color_poles_4k.tif")
    valid = rgb.min(axis=2) > 2
    albedo = stretch(fill(rgb.mean(axis=2), valid), valid, 1, 99.7)
    tint = colour_index(rgb, valid)
    Image.MAX_IMAGE_PIXELS = None
    lola = np.asarray(Image.open(CACHE / "ldem_16_uint.tif"), dtype=np.float64) * 0.5
    relief = hillshade(heights(lola, roll_half=False), 1737400, 5)
    value = np.clip((0.12 + 0.82 * albedo) * (0.5 + 0.5 * relief), 0, 1.1)
    grey = 22 + value * 220
    # Neutral grey: the maria a touch bluer and darker, the highlands a touch warmer.
    save("luna.png", tinted(grey, tint, (1.0, 0.995, 0.985), (0.03, 0.005, -0.04)), [
        (24, 24, 27), (40, 40, 44),                                    # shadow
        (56, 58, 63), (74, 76, 81), (94, 96, 101),                     # maria
        (66, 64, 62), (88, 86, 83), (112, 110, 106), (136, 134, 129),  # dusky
        (160, 158, 152), (182, 180, 174), (204, 202, 196),             # highlands
        (224, 223, 219), (244, 244, 241),                              # bright rays
    ], dither=9)


def mars() -> None:
    # The Viking mosaic is made of sunlit images, so it has its own shading (and its own polar
    # caps); MOLA's relief on top sharpens the volcanoes, Valles Marineris and the craters.
    rgb = mosaic("Mars_Viking_ClrMosaic_global_925m.tif")
    valid = rgb.min(axis=2) > 2
    for k in range(3):
        rgb[..., k] = fill(rgb[..., k], valid)
    mola = np.fromfile(CACHE / "megt90n000eb.img", dtype=">i2").reshape(2880, 5760)
    relief = hillshade(heights(mola, roll_half=True), 3396190, 4)
    lum = rgb.mean(axis=2, keepdims=True)
    albedo = stretch(lum[..., 0], valid, 1, 99.5)[..., None]
    # The mosaic's hue, its saturation trimmed a little, at the stretched brightness.
    hue = (rgb - lum) * 0.85
    out = (24 + albedo * 200) * (0.62 + 0.38 * relief[..., None]) + hue
    # The mosaic's polar caps are messy (swirls of seams), so they become clean ice, shaded by MOLA.
    cap = np.clip(np.maximum((LAT - 81) / 3, (-84 - LAT) / 3), 0, 1)[..., None]
    out = out * (1 - cap) + np.array([236, 232, 232]) * (0.8 + 0.2 * relief[..., None]) * cap
    save("mars.png", out, [
        (34, 24, 20), (52, 36, 28), (72, 48, 36), (94, 60, 42),         # dark basalt
        (74, 62, 56), (100, 84, 74),                                   # grey-brown
        (118, 72, 48), (142, 86, 54), (164, 102, 62), (184, 120, 76),  # rust
        (200, 140, 94), (214, 162, 116), (226, 186, 146),              # dust, ochre
        (206, 196, 196), (230, 224, 224), (248, 246, 246),             # ice
    ], dither=9)


def ceres() -> None:
    # Dawn's mosaic is greyscale and sunlit; Ceres is very dark, with Occator's bright faculae.
    # Beyond 80° (unlit or missing) it fades to the average.
    grey = mosaic("Ceres_Dawn_FC_DLR_global_20ppd_Oct2015.tif", "L")
    valid = blur((grey > 2).astype(np.float64), 1) > 0.98
    value = stretch(fill(grey, valid), valid & (np.abs(LAT) < 80), 1, 99.8)
    polar = np.clip((np.abs(LAT) - 76) / 6, 0, 1)
    value = value * (1 - polar) + np.median(value[valid]) * polar
    g = 20 + value * 200
    save("ceres.png", np.stack([g * 0.99, g * 0.99, g * 1.02], axis=-1), [
        (22, 22, 25), (36, 36, 40), (52, 52, 57), (68, 68, 73), (86, 86, 91),
        (104, 104, 109), (124, 124, 128), (146, 146, 150), (170, 170, 173),
        (200, 202, 205), (236, 238, 240), (255, 255, 255),
    ], dither=9)


def fbm(seed: int, scales: list[tuple[int, int, float]]) -> np.ndarray:
    """Value noise, 0–1: random grids of (columns, rows) wrapping in longitude, bilinearly upsampled and summed by weight."""
    rng = np.random.default_rng(seed)
    total = np.zeros((H, W))
    weights = 0.0
    for cols, rows, weight in scales:
        grid = rng.random((rows + 1, cols))
        y = (np.arange(H) + 0.5) / H * rows
        x = (np.arange(W) + 0.5) / W * cols
        y0 = np.floor(y).astype(int)
        x0 = np.floor(x).astype(int)
        fy = (y - y0)[:, None]
        fx = (x - x0)[None, :]
        fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
        g = lambda yy, xx: grid[np.clip(yy, 0, rows)][:, xx % cols]  # noqa: E731
        top = g(y0, x0) * (1 - fx) + g(y0, x0 + 1) * fx
        bottom = g(y0 + 1, x0) * (1 - fx) + g(y0 + 1, x0 + 1) * fx
        total += (top * (1 - fy) + bottom * fy) * weight
        weights += weight
    return total / weights


def sphere_noise(seed: int, scales: list[tuple[float, float]]) -> np.ndarray:
    """Value noise on the sphere, 0–1, so it neither pinches at the poles nor seams at 180°: random 3D lattices sampled (trilinear, smoothed) at each map point's direction times a frequency, summed by (frequency, weight)."""
    rng = np.random.default_rng(seed)
    lat, lon = np.radians(LAT), np.radians(LON)
    xyz = np.stack([np.cos(lat) * np.cos(lon), np.sin(lat), np.cos(lat) * np.sin(lon)], axis=-1)
    total = np.zeros((H, W))
    weights = 0.0
    for freq, weight in scales:
        n = int(2 * freq) + 3
        grid = rng.random((n, n, n))
        q = (xyz + 1) * freq
        i = np.floor(q).astype(int)
        f = q - i
        f = f * f * (3 - 2 * f)
        acc = np.zeros((H, W))
        for corner in range(8):
            o = [(corner >> k) & 1 for k in range(3)]
            w = np.prod([f[..., k] if o[k] else 1 - f[..., k] for k in range(3)], axis=0)
            acc += w * grid[i[..., 0] + o[0], i[..., 1] + o[1], i[..., 2] + o[2]]
        total += acc * weight
        weights += weight
    return total / weights


def venus() -> None:
    # Cloud tops as Mariner 10 saw them: a cream-white globe, a soft, mottled peach haze across
    # the low latitudes, white wisps sweeping poleward in chevrons (mirrored across the equator)
    # and breaking up along their length, and brighter, smoother towards the poles.
    a = np.abs(LAT)
    haze = fbm(11, [(10, 5, 1.0), (24, 12, 0.7), (56, 28, 0.4)])
    mottle = fbm(17, [(80, 40, 1.0), (160, 80, 0.6)])
    wisp = fbm(23, [(8, 4, 1.0), (28, 14, 0.5)])
    breaks = fbm(31, [(18, 6, 1.0), (40, 14, 0.4)])
    cream = np.array([238, 231, 218], dtype=np.float64)
    peach = np.array([224, 184, 146], dtype=np.float64)
    white = np.array([251, 249, 245], dtype=np.float64)
    mix = lambda base, colour, k: base * (1 - k[..., None]) + colour * k[..., None]  # noqa: E731
    out = np.broadcast_to(cream, (H, W, 3)).copy()
    # The peach haze: broad, wavering with longitude, patchy within.
    band = np.exp(-((LAT + 6 * (haze - 0.5) * 2) / 38) ** 2)
    out = mix(out, peach, np.clip(band * (haze - 0.2) * 1.1 * (0.8 + 0.4 * (mottle - 0.5)), 0, 0.6))
    # Wisps: soft lines slanting poleward as they run west, wobbled, broken, strongest at mid-latitudes.
    along = LON / 360 * 7 + (a / 90) * 2.4 + (wisp - 0.5) * 0.8
    streak = np.exp(-(((along - np.round(along)) / 0.14) ** 2))
    streak *= np.clip((breaks - 0.3) * 2.2, 0, 1) * np.clip((a - 6) / 16, 0, 1) * np.clip((80 - a) / 22, 0, 1)
    out = mix(out, white, streak * 0.7)
    # A faint greyer collar where the wisps curl in towards the poles, then the bright polar hoods.
    out = mix(out, np.array([214, 213, 212]), np.exp(-((a - 63) / 6) ** 2) * (0.1 + 0.15 * wisp))
    out = mix(out, white, np.clip((a - 62) / 20, 0, 1) * 0.75)
    save("venus.png", out, [
        (214, 213, 212), (226, 225, 222),                                    # collar greys
        (218, 182, 146), (225, 194, 162), (230, 205, 177), (234, 214, 190), (237, 222, 203),  # peach
        (232, 225, 212), (238, 231, 218), (243, 238, 228), (247, 244, 237), (252, 251, 248),  # cream, white
    ], dither=4)


def jupiter() -> None:
    # Cassini's cylindrical colour map (December 2000; 750 and 451 nm, balanced to what the eye
    # would see): the belts and zones, festoons and the Great Red Spot. Warmed a little, to the
    # cream zones and tan belts of Cassini's and Juno's true-colour views, and given a palette of
    # its own colours.
    rgb = mosaic("PIA07782.tif")
    lum = rgb.mean(axis=2, keepdims=True)
    valid = lum[..., 0] > 4
    albedo = stretch(lum[..., 0], valid, 0.3, 99.9)[..., None]
    out = (40 + albedo * 196) + (rgb - lum) * 0.95 + np.array([12, 4, -14])
    save("jupiter.png", out, kmeans_palette(np.clip(out, 0, 255), 18), dither=6)


def io() -> None:
    # The Galileo–Voyager colour merge: sulphur yellows and oranges, white SO₂ frost, the dark
    # calderas and Pele's red ring. A palette of its own colours.
    rgb = mosaic("Io_GalileoSSI-Voyager_Global_Mosaic_ClrMerge_1km.tif")
    valid = rgb.min(axis=2) > 2
    for k in range(3):
        rgb[..., k] = fill(rgb[..., k], valid)
    lum = rgb.mean(axis=2, keepdims=True)
    albedo = stretch(lum[..., 0], valid, 0.5, 99.8)[..., None]
    out = (20 + albedo * 225) + (rgb - lum) * 1.05
    save("io.png", out, kmeans_palette(np.clip(out, 0, 255), 18), dither=6)


def europa() -> None:
    # Greyscale Voyager–Galileo mosaic: bright water ice, the reddish-brown lineae and chaos
    # (salts and radiation-darkened material) a ramp of Europa's real tones; the poles, poorly
    # imaged, fade to the average.
    grey = mosaic("Europa_Voyager_GalileoSSI_global_mosaic_500m.tif", "L")
    valid = blur((grey > 2).astype(np.float64), 1) > 0.98
    value = stretch(fill(grey, valid), valid, 1, 99.7)
    polar = np.clip((np.abs(LAT) - 76) / 8, 0, 1)
    value = value * (1 - polar) + np.median(value[valid]) * polar
    out = ramp(value, [(0, (118, 80, 58)), (0.35, (172, 136, 104)), (0.6, (212, 198, 178)), (0.8, (232, 226, 212)), (1, (248, 246, 240))])
    save("europa.png", out, [
        (118, 80, 58), (140, 100, 74), (160, 122, 92), (180, 148, 116),   # lineae, chaos
        (192, 166, 138), (208, 190, 166), (222, 210, 192), (234, 228, 216), (246, 244, 238),  # ice
    ], dither=9)


def ganymede() -> None:
    # The Voyager–Galileo colour mosaic: dark, ancient terrain (Galileo Regio), lighter grooved
    # terrain, bright young craters and frosty polar caps. A palette of its own colours.
    rgb = mosaic("Ganymede_Voyager_GalileoSSI_Global_ClrMosaic_1435m.tif")
    valid = rgb.min(axis=2) > 2
    for k in range(3):
        rgb[..., k] = fill(rgb[..., k], valid)
    lum = rgb.mean(axis=2, keepdims=True)
    albedo = stretch(lum[..., 0], valid, 0.5, 99.8)[..., None]
    # Warmer, browner in the dark terrain, as in Galileo's and Juno's colour views.
    warm = (1 - albedo) * np.array([10, 2, -12])
    out = (24 + albedo * 215) + (rgb - lum) * 0.9 + warm
    save("ganymede.png", out, kmeans_palette(np.clip(out, 0, 255), 14), dither=8)


def callisto() -> None:
    # Greyscale Voyager–Galileo mosaic: dark, brownish, saturated with craters, their ejecta and
    # Valhalla's rings bright with ice; the poles, poorly imaged, fade to the average.
    grey = mosaic("Callisto_Voyager_GalileoSSI_global_mosaic_1km.tif", "L")
    valid = blur((grey > 2).astype(np.float64), 1) > 0.98
    value = stretch(fill(grey, valid), valid, 1, 99.7)
    polar = np.clip((np.abs(LAT) - 76) / 8, 0, 1)
    value = (value * (1 - polar) + np.median(value[valid]) * polar) ** 0.7
    out = ramp(value, [(0, (52, 46, 40)), (0.35, (98, 88, 76)), (0.65, (146, 136, 122)), (0.88, (196, 192, 184)), (1, (238, 238, 234))])
    save("callisto.png", out, [
        (52, 46, 40), (68, 60, 52), (84, 75, 65), (100, 90, 78), (118, 108, 95),
        (138, 128, 115), (158, 150, 138), (180, 174, 164), (204, 201, 194), (236, 236, 232),
    ], dither=9)


def saturn() -> None:
    # No public-domain global map of Saturn exists, so it is made up after Cassini's natural-
    # colour views: a pale butterscotch globe, the bright cream equatorial zone, soft tan belts
    # and zones alternating to mid-latitudes, greyer high latitudes, the bluish-grey north polar
    # region inside its hexagonal jet stream (at 75°–78°N) with a dark vortex at the pole, and a
    # darker south polar vortex. Belts ripple a little with longitude.
    ripple = fbm(41, [(64, 128, 1.0), (128, 256, 0.5)])
    swirl = fbm(43, [(16, 32, 1.0), (40, 80, 0.5)])
    lat = LAT + (swirl - 0.5) * 2.4
    # (latitude, colour) down the globe, north to south.
    profile = [
        (90, (112, 118, 124)), (86, (128, 136, 144)), (79, (150, 158, 166)), (77, (118, 120, 122)),
        (74, (170, 166, 150)), (64, (184, 176, 152)), (55, (204, 190, 156)), (47, (192, 172, 132)),
        (40, (214, 198, 160)), (33, (198, 174, 128)), (26, (222, 206, 166)), (20, (204, 178, 130)),
        (12, (226, 208, 166)), (7, (238, 226, 192)), (0, (242, 232, 200)), (-7, (238, 226, 192)),
        (-12, (226, 206, 160)), (-20, (200, 172, 124)), (-27, (220, 202, 160)), (-35, (196, 170, 124)),
        (-43, (212, 194, 154)), (-52, (190, 172, 136)), (-62, (182, 172, 148)), (-75, (168, 160, 142)),
        (-84, (150, 140, 124)), (-90, (106, 98, 88)),
    ]
    xs = [-p[0] for p in profile]
    out = np.stack([np.interp(-lat, xs, [p[1][i] for p in profile]) for i in range(3)], axis=-1)
    out *= (0.96 + 0.08 * ripple)[..., None]
    # The hexagon: the polar region's edge follows a six-sided wave in longitude.
    hexagon = 76.5 + 1.6 * np.cos(np.radians(6 * LON))
    edge = np.exp(-((LAT - hexagon) / 0.9) ** 2)
    inside = np.clip((LAT - hexagon) / 1.5, 0, 1)
    out = out * (1 - inside[..., None] * 0.4) + np.array([142, 152, 162]) * inside[..., None] * 0.4
    out = out * (1 - edge[..., None] * 0.35) + np.array([110, 112, 114]) * edge[..., None] * 0.35
    save("saturn.png", out, [
        (106, 100, 92), (120, 122, 124), (142, 150, 158), (160, 164, 160),
        (172, 166, 150), (186, 176, 150), (194, 170, 126), (204, 184, 140), (212, 196, 158),
        (222, 206, 166), (230, 216, 180), (238, 226, 194), (244, 234, 204),
    ], dither=6)


def titan() -> None:
    # Cassini's near-infrared (938 nm) map sees the surface through the haze: Xanadu bright, the
    # dune seas dark. Seen in visible light, Titan is a smooth orange-tan ball, so the surface only
    # shades the haze a little. The map is centred on 180° (0° to 360° east), so it is turned half
    # a turn.
    grey = np.roll(mosaic("Titan_ISS_P19658_Mosaic_Global_4km.tif", "L"), W // 2, axis=1)
    valid = grey > 2
    value = stretch(fill(grey, valid), valid, 1, 99.5)
    # The haze: pale yellow-orange, deeper towards the poles, the north polar hood a little darker.
    a = np.abs(LAT)
    haze = np.stack([
        np.interp(a, [0, 50, 90], [234, 224, 204]),
        np.interp(a, [0, 50, 90], [190, 174, 146]),
        np.interp(a, [0, 50, 90], [112, 98, 80]),
    ], axis=-1)
    hood = np.clip((LAT - 60) / 20, 0, 1)[..., None]
    out = haze * (0.94 + 0.12 * (value[..., None] - 0.5)) * (1 - 0.1 * hood)
    save("titan.png", out, [
        (180, 140, 90), (194, 154, 100), (206, 166, 108), (214, 176, 116),
        (222, 184, 122), (228, 192, 130), (234, 200, 138),
    ], dither=6)


def icy_moon(file: str, out_name: str, stops: list[tuple[float, tuple[int, int, int]]], palette: list[tuple[int, int, int]],
             member: str | None = None, gamma: float = 1.0) -> None:
    """A greyscale Cassini (and Voyager) mosaic, its gaps filled, coloured along a ramp of the moon's real tones; the poles, smeared in the mosaics, fade to the average beyond 80°."""
    grey = mosaic(file, "L", member)
    valid = blur((grey > 2).astype(np.float64), 1) > 0.98
    value = stretch(fill(grey, valid), valid, 1, 99.7) ** gamma
    polar = np.clip((np.abs(LAT) - 78) / 8, 0, 1)
    value = value * (1 - polar) + np.median(value[valid]) * polar
    save(out_name, ramp(value, stops), palette, dither=9)


def mimas() -> None:
    # DLR's Cassini basemap (inside its zip): grey, cratered, Herschel's great crater on the leading face.
    icy_moon("Cassini_DLR_Mimas.zip", "mimas.png",
             [(0, (44, 44, 46)), (0.5, (132, 132, 132)), (1, (232, 232, 230))],
             [(44, 44, 46), (66, 66, 68), (88, 88, 90), (110, 110, 111), (132, 132, 132), (156, 156, 155), (182, 182, 180), (208, 208, 206), (232, 232, 230)],
             member="Cassini_DLR/MI_170630_DLR_basemap_degrees.tif")


def enceladus() -> None:
    # The brightest body in the Solar System: almost pure white ice, a little blue in its fractures
    # (the south pole's tiger stripes among them).
    icy_moon("Enceladus_Cassini_mosaic_global_110m.tif", "enceladus.png",
             [(0, (118, 132, 142)), (0.45, (198, 208, 214)), (1, (252, 252, 252))],
             [(118, 132, 142), (146, 160, 168), (172, 184, 192), (196, 206, 212), (216, 224, 228), (234, 238, 240), (248, 249, 250)],
             gamma=0.8)


def tethys() -> None:
    # Bright grey ice, Odysseus's great basin and the Ithaca Chasma canyon.
    icy_moon("Tethys_Cassini_mosaic_global_293m.tif", "tethys.png",
             [(0, (70, 72, 76)), (0.5, (162, 164, 166)), (1, (242, 242, 240))],
             [(70, 72, 76), (94, 96, 100), (118, 120, 123), (142, 144, 146), (166, 168, 169), (192, 193, 193), (218, 218, 217), (242, 242, 240)])


def dione() -> None:
    # Grey, cratered on its leading face; bright wispy ice cliffs across the trailing face.
    icy_moon("Dione_Cassini_Voyager_mosaic_global_154m.tif", "dione.png",
             [(0, (58, 58, 60)), (0.5, (146, 145, 144)), (1, (238, 238, 236))],
             [(58, 58, 60), (80, 80, 82), (102, 102, 103), (124, 124, 124), (146, 145, 144), (170, 169, 168), (196, 195, 194), (220, 220, 218), (240, 240, 238)])


def rhea() -> None:
    # Grey and heavily cratered, a little warmer than Dione, with Inktomi's bright rays.
    icy_moon("Rhea_Cassini_Voyager_mosaic_global_417m.tif", "rhea.png",
             [(0, (56, 54, 52)), (0.5, (144, 140, 134)), (1, (236, 234, 230))],
             [(56, 54, 52), (78, 75, 72), (100, 97, 93), (122, 118, 113), (144, 140, 134), (168, 164, 158), (192, 189, 184), (216, 214, 210), (236, 234, 230)])


def iapetus() -> None:
    # Two-faced: the leading hemisphere's Cassini Regio coated dark reddish-brown, the trailing
    # one bright ice.
    icy_moon("Iapetus_Cassini_Voyager_mosaic_global_783m.tif", "iapetus.png",
             [(0, (38, 26, 20)), (0.25, (82, 58, 42)), (0.5, (148, 132, 116)), (1, (238, 236, 230))],
             [(38, 26, 20), (56, 38, 28), (76, 54, 40), (98, 74, 56), (126, 108, 92), (156, 144, 130), (188, 182, 172), (216, 214, 208), (238, 236, 230)])


def uranus() -> None:
    # No public-domain global map of Uranus exists either, and there is little to map: made up
    # after Voyager 2's, Hubble's and JWST's views of its northern summer. A pale cyan globe
    # (methane soaking up the red), faint bands, a bright, whitish north polar cap edged by a thin
    # darker lane near 60°N, a fainter bright collar round the south pole (as Voyager saw it), and
    # a few small bright methane-ice clouds at northern mid-latitudes.
    ripple = fbm(51, [(48, 96, 1.0), (96, 192, 0.4)])
    swirl = fbm(53, [(12, 24, 1.0), (32, 64, 0.5)])
    lat = LAT + (swirl - 0.5) * 1.6
    profile = [
        (90, (214, 238, 240)), (72, (206, 234, 237)), (64, (190, 226, 230)), (60, (150, 198, 206)),
        (56, (166, 212, 218)), (45, (176, 220, 225)), (32, (170, 214, 220)), (20, (176, 219, 224)),
        (8, (164, 208, 215)), (0, (160, 205, 213)), (-8, (164, 208, 215)), (-22, (170, 214, 220)),
        (-40, (174, 216, 222)), (-62, (172, 214, 220)), (-70, (186, 224, 228)), (-76, (172, 214, 220)),
        (-90, (178, 218, 224)),
    ]
    xs = [-p[0] for p in profile]
    out = np.stack([np.interp(-lat, xs, [p[1][i] for p in profile]) for i in range(3)], axis=-1)
    out *= (0.975 + 0.05 * ripple)[..., None]
    # Bright clouds: small patches where fine noise peaks, only at 25°–50°N, stretched east–west.
    clouds = fbm(57, [(96, 48, 1.0), (192, 96, 0.5)])
    belt = np.clip(1 - np.abs(LAT - 37) / 13, 0, 1)
    cloud = np.clip((clouds - 0.76) / 0.06, 0, 1) * belt
    out = out * (1 - cloud[..., None]) + np.array([236, 248, 248]) * cloud[..., None]
    save("uranus.png", out, [
        (146, 194, 202), (156, 202, 210), (164, 208, 215), (170, 213, 219), (176, 218, 223),
        (184, 223, 227), (196, 230, 233), (208, 236, 238), (222, 243, 244), (236, 248, 248),
    ], dither=5)


def quilt(detail: np.ndarray, donor: np.ndarray, rows: int, cols: int, rng: np.random.Generator, wrap: bool) -> np.ndarray:
    """
    New terrain of rows × cols from a map's detail: square patches from wholly donor ground,
    picked at random and laid overlapping by half, each under a raised-cosine window (the windows
    sum to one), the overlaps' dulling (unrelated patches averaged) given back. Wrapping in
    columns when asked, as a map does in longitude.
    """
    size, step = 48, 24
    clear = blur(donor.astype(np.float64), size / 4) > 0.999
    ys, xs = np.where(clear[size // 2:H - size // 2, size // 2:W - size // 2])
    window = np.outer(*[np.sin(np.pi * (np.arange(size) + 0.5) / size) ** 2] * 2)
    out = np.zeros((rows + 2 * size, cols + (0 if wrap else 2 * size)))
    for top in range(-step, rows, step):
        for left in range(-step if not wrap else 0, cols, step):
            i = rng.integers(len(ys))
            patch = detail[ys[i]:ys[i] + size, xs[i]:xs[i] + size]
            at = np.arange(left, left + size) % cols if wrap else np.arange(left + size, left + 2 * size)
            out[top + size:top + 2 * size, at] += patch * window
    out = out[size:size + rows]
    return (out if wrap else out[:, size:size + cols]) * 1.25


def unseen(value: np.ndarray, valid: np.ndarray, donor: np.ndarray, seed: int, flatten: float = 0.5,
           extend: bool = False) -> tuple[np.ndarray, np.ndarray]:
    """
    Makes up the ground a spacecraft never saw: the body's average tone with terrain borrowed from
    its own donor ground (its broad tone taken out, so no landmark is copied whole), quilted from
    random patches (fixed seed); round the poles, where the map squeezes them, the patches are
    laid on polar maps instead. The imaged part's broad swings of brightness are scaled by flatten
    (lighting more than ground, in old mosaics), and its edge is feathered into the made-up part.
    With extend, the made-up ground starts from the tone along that edge, easing to the average
    over some 20°, for a body whose edge is far from its average.
    Returns the whole map and the made-up layer alone.
    """
    average = np.median(value[valid])
    broad = blur(value, 14)
    detail = value - broad
    value = average + (broad - average) * flatten + detail
    rng = np.random.default_rng(seed)
    base = average
    if extend:
        near = blur(valid.astype(np.float64), 24)
        base = fill(average + (broad - average) * flatten, valid) * near + average * (1 - near)
    made_up = base + quilt(detail, donor, H, W, rng, wrap=True)
    # The polar caps, on polar maps (azimuthal equidistant, the map's own scale at the equator)
    # out to 28° from each pole, blended in from 62° to 70°.
    reach = int(28 * W / 360) + 2
    cap = np.clip((np.abs(LAT) - 62) / 8, 0, 1)
    rho = (90 - np.abs(LAT)) * W / 360
    for pole in (1, -1):
        polar_map = quilt(detail, donor, 2 * reach, 2 * reach, rng, wrap=False)
        px = np.clip(reach + rho * np.cos(np.radians(LON)), 0, 2 * reach - 1).astype(int)
        py = np.clip(reach + rho * np.sin(np.radians(LON)), 0, 2 * reach - 1).astype(int)
        here = cap * (np.sign(LAT) == pole)
        made_up = made_up * (1 - here) + (base + polar_map[py, px]) * here
    weight = blur(valid.astype(np.float64), 6) * valid
    return value * weight + made_up * (1 - weight), made_up


def voyager_moon(file: str, out_name: str, stops: list[tuple[float, tuple[int, int, int]]], palette: list[tuple[int, int, int]],
                 gamma: float = 1.0) -> None:
    """
    A greyscale Voyager 2 mosaic of a moon of Uranus, coloured along a ramp of its real tones.
    Voyager flew by in 1986 with the system's south pole towards the Sun, so only the southern
    hemispheres were imaged: the rest is made up (unseen()) from the moon's best-imaged ground,
    62°S to 18°S. The mosaics' broad swings of brightness (lighting, not ground) are halved. The
    shadowed edge of the imaged part is trimmed; the smeared south pole fades into the made-up
    ground beyond 78°S.
    """
    grey = mosaic(file, "L")
    valid = blur((grey > 2).astype(np.float64), 4) > 0.995
    value = stretch(fill(grey, valid), valid, 1, 99.7) ** gamma
    donor = valid & (LAT > -62) & (LAT < -18) & (np.abs(LON) < 176)
    value, made_up = unseen(value, valid, donor, 61)
    polar = np.clip((-LAT - 78) / 8, 0, 1)
    value = value * (1 - polar) + made_up * polar
    save(out_name, ramp(np.clip(value, 0, 1), stops), palette, dither=9)


def miranda() -> None:
    # Neutral grey, a patchwork: old cratered rolling terrain and the three great grooved coronae
    # (Arden, Elsinore and the chevron of Inverness), the cliffs of Verona Rupes.
    voyager_moon("ura5vuu2.tif", "miranda.png",
                 [(0, (46, 46, 48)), (0.5, (138, 138, 138)), (1, (230, 230, 228))],
                 [(46, 46, 48), (68, 68, 70), (92, 92, 93), (115, 115, 116), (138, 138, 138), (162, 162, 161), (186, 186, 185), (208, 208, 207), (230, 230, 228)])


def ariel() -> None:
    # The brightest of Uranus's moons: grey-white ice, a little bluish, cut by long fault valleys
    # (chasmata) with smooth floors, and bright young craters.
    voyager_moon("ura1vuu2.tif", "ariel.png",
                 [(0, (66, 70, 74)), (0.5, (158, 162, 166)), (1, (242, 244, 244))],
                 [(66, 70, 74), (88, 92, 96), (112, 116, 120), (135, 139, 143), (158, 162, 166), (182, 186, 189), (206, 209, 211), (226, 228, 229), (242, 244, 244)])


def umbriel() -> None:
    # The darkest: an even, sooty grey, old and cratered, but for Wunda's bright ring near the
    # equator and the bright-centred crater Vuver.
    voyager_moon("ura2vuu2.tif", "umbriel.png",
                 [(0, (24, 24, 26)), (0.45, (70, 70, 72)), (0.85, (112, 111, 110)), (1, (208, 204, 196))],
                 [(24, 24, 26), (38, 38, 40), (52, 52, 54), (66, 66, 68), (80, 80, 81), (96, 95, 95), (114, 113, 112), (150, 148, 144), (208, 204, 196)])


def titania() -> None:
    # The largest: grey with a faint warm tint, cratered, crossed by huge canyons (Messina
    # Chasmata) and with Ursula's and Gertrude's great craters.
    voyager_moon("ura3vuu2.tif", "titania.png",
                 [(0, (50, 46, 44)), (0.5, (146, 140, 134)), (1, (236, 232, 226))],
                 [(50, 46, 44), (72, 68, 65), (96, 91, 87), (120, 115, 110), (146, 140, 134), (170, 165, 159), (194, 190, 184), (216, 212, 207), (236, 232, 226)])


def oberon() -> None:
    # Darker and a little redder: old, heavily cratered, many craters (Hamlet, Othello) floored
    # with dark material, with bright ray craters.
    voyager_moon("ura4vuu2.tif", "oberon.png",
                 [(0, (34, 30, 28)), (0.5, (112, 104, 97)), (1, (222, 216, 208))],
                 [(34, 30, 28), (52, 47, 44), (72, 66, 62), (92, 85, 80), (112, 104, 97), (136, 128, 121), (162, 156, 149), (192, 186, 179), (222, 216, 208)],
                 gamma=0.9)


def phobos() -> None:
    # DLR's Viking mosaic (USGS, controlled to their shape model): dark grey, heavily cratered,
    # scored by long grooves, Stickney's great crater on the leading face. Coloured along a ramp of
    # Phobos's dark, slightly reddish grey; the bluer unit round Stickney (Mars Express's and MRO's
    # colour views) a cooler grey.
    grey = mosaic("Phobos_Viking_Mosaic_40ppd_DLRcontrol.tif", "L")
    valid = grey > 2
    value = stretch(fill(grey, valid), valid, 0.5, 99.7)
    out = ramp(value, [(0, (40, 36, 34)), (0.5, (104, 97, 92)), (1, (178, 171, 164))])
    # Stickney (1°N, 49.7°W) and the blue unit round it.
    d = np.degrees(np.arccos(np.clip(np.sin(np.radians(LAT)) * np.sin(np.radians(1.0))
                                     + np.cos(np.radians(LAT)) * np.cos(np.radians(1.0)) * np.cos(np.radians(LON + 49.7)), -1, 1)))
    blue = np.clip(1 - (d - 18) / 16, 0, 1)[..., None]
    out = out * (1 - 0.35 * blue) + (out.mean(axis=2, keepdims=True) * np.array([0.9, 0.98, 1.12])) * 0.35 * blue
    save("phobos.png", out, kmeans_palette(np.clip(out, 0, 255), 10), dither=8)


def deimos() -> None:
    # USGS's Viking map (from JPL's Solar System Simulator): smooth, its craters half buried under
    # a blanket of regolith, bright streaks down its slopes. Its unimaged parts are flat grey in
    # the map, much lighter than any ground, so they are found by that (smoothed, so bright streaks
    # stay) and made up (unseen()) from the imaged ground. A little warmer and redder than Phobos.
    grey = mosaic("mar2kuu2.tif", "L")
    valid = blur((blur(grey, 3) < 140).astype(np.float64), 4) > 0.98
    value = stretch(grey, valid, 0.5, 99.7)
    donor = valid & (np.abs(LAT) < 60)
    value, _ = unseen(value, valid, donor, 97, flatten=0.7, extend=True)
    out = ramp(np.clip(value, 0, 1), [(0, (48, 42, 38)), (0.5, (116, 106, 98)), (1, (186, 178, 168))])
    save("deimos.png", out, kmeans_palette(np.clip(out, 0, 255), 9), dither=8)


def save_relief(name: str, radius: np.ndarray) -> None:
    """Writes <name>_shape.png, a body's radius (in its radii) in every direction, at half the map's size: 0 to 2 radii in 16 bits, the high byte in red and the low in green (bodyArt.ts bodyRelief)."""
    level = np.round(np.clip(radius.reshape(H // 2, 2, W // 2, 2).mean(axis=(1, 3)) / 2, 0, 1) * 65535).astype(np.uint32)
    packed = np.stack([level >> 8, level & 255, np.zeros_like(level)], axis=-1).astype(np.uint8)
    Image.fromarray(packed, "RGB").save(MAP_OUT / f"{name}_shape.png", optimize=True)


def sunpoint_xyz(lat: float, lon: float) -> np.ndarray:
    """A direction from latitude and longitude in degrees, in the maps' frame (cos lat cos lon, sin lat, −cos lat sin lon)."""
    la, lo = np.radians(lat), np.radians(lon)
    return np.array([np.cos(la) * np.cos(lo), np.sin(la), -np.cos(la) * np.sin(lo)])


def asteroid(name: str, seed: int, axes: tuple[float, float, float], lumps: float, waist: float, craters: int,
             stops: list[tuple[float, tuple[int, int, int]]], palette: list[tuple[int, int, int]], mean: float = 1.0,
             basin: tuple[float, float, float, float] | None = None, depth: float = 1.0) -> None:
    """
    A made-up small asteroid: no spacecraft has seen it, so both its shape and its surface are
    invented, after what its light curve and spectrum say. Writes two maps: <name>.png, the
    surface's colour, and <name>_shape.png, how far the surface lies from the centre in each
    direction, at half the size: 0 to 2 radii in 16 bits, the high byte in red and the low in
    green (a browser reads only 8 bits a channel, and 8 would terrace the slopes); bodyArt.ts
    ray-casts it.

    The shape: an ellipsoid of the given semi-axes (along longitude 0°, the pole and 90°W), pinched
    at the middle of its long axis for a two-lobed body (waist), made lumpy with value noise on the
    sphere at two scales, then cratered: bowls with raised rims, a few big and many small (sizes
    by a power law). Scaled so its mean radius is mean (Terra Invicta's radius, unless measured
    dimensions say otherwise), with a great basin if given (latitude, longitude, angular radius in
    degrees, depth in radii) flattening one side; depth scales the craters' (a big body's are far
    shallower for its size than a small rubble pile's). The surface: a
    space-weathered regolith tone mottled at two scales, the youngest craters' floors and ejecta
    brighter and fresher, on a ramp of its tones, with ordered dithering.
    """
    rng = np.random.default_rng(seed)
    lat, lon = np.radians(LAT), np.radians(LON)
    u = np.stack([np.cos(lat) * np.cos(lon), np.sin(lat), -np.cos(lat) * np.sin(lon)], axis=-1)
    a, c, b = axes
    radius = 1 / np.sqrt((u[..., 0] / a) ** 2 + (u[..., 1] / c) ** 2 + (u[..., 2] / b) ** 2)
    radius *= 1 - waist * np.exp(-((u[..., 0] / 0.32) ** 2))
    big = sphere_noise(seed + 1, [(1.2, 1.0), (2.2, 0.5)])
    small = sphere_noise(seed + 2, [(5, 1.0), (9, 0.5)])
    radius *= 1 + lumps * (big - 0.5) + 0.06 * (small - 0.5)
    if basin:
        lat0, lon0, size, sink = basin
        q = np.degrees(np.arccos(np.clip(u @ sunpoint_xyz(lat0, lon0), -1, 1))) / size
        radius *= 1 - sink * np.where(q < 1, np.cos(q * np.pi / 2) ** 2, 0) + 0.25 * sink * np.exp(-(((q - 1.05) / 0.12) ** 2))
    fresh = np.zeros((H, W))
    for k in range(craters):
        centre = rng.normal(size=3)
        centre /= np.linalg.norm(centre)
        # Sizes by a power law: angular radius 4° to 38°, most of them small.
        rho = np.radians(4 + 34 * rng.random() ** 3.2)
        theta = np.arccos(np.clip(u @ centre, -1, 1))
        q = theta / rho
        bowl = np.where(q < 1, -(1 - q * q), 0) * 0.32 * rho * depth
        rim = 0.1 * rho * depth * np.exp(-(((q - 1.05) / 0.22) ** 2))
        radius *= 1 + bowl + rim
        # A few are young: brighter floors and ejecta.
        if rng.random() < 0.25:
            fresh = np.maximum(fresh, np.clip(1.6 - q, 0, 1) * (0.6 + 0.4 * rng.random()))
    radius *= mean / radius.mean()
    print(f"{name}: shape reaches {radius.max():.3f} radii")
    save_relief(name, radius)
    mottle = sphere_noise(seed + 3, [(2.5, 1.0), (7, 0.6), (18, 0.35)])
    value = 0.45 + (mottle - 0.5) * 0.9 + 0.35 * fresh
    save(f"{name}.png", ramp(np.clip(value, 0, 1), stops), palette, dither=8)


def lick() -> None:
    # 1951 Lick: about 5.6 km across, turning in 5.30 hours; its light curve (0.25–0.33 mag) says
    # about 1.35 times as long as it is wide. An A-type: olivine-rich, a reddish grey-tan, darkish
    # (albedo about 0.09).
    asteroid("lick", 101, (1.35, 0.82, 1.0), 0.32, 0.0, 34,
             [(0, (52, 42, 36)), (0.45, (112, 92, 78)), (0.75, (150, 128, 110)), (1, (196, 178, 160))],
             [(52, 42, 36), (72, 59, 50), (92, 76, 64), (112, 92, 78), (132, 110, 94), (156, 136, 118), (196, 178, 160)])


def cruithne() -> None:
    # 3753 Cruithne, the Earth's quasi-satellite: about 2 km across, turning in 27.31 hours; its
    # large light-curve swing (0.67 mag) says nearly twice as long as wide, so it is made two-
    # lobed. A Q-type, fresh and unweathered, bright for an asteroid (albedo about 0.37): light grey.
    asteroid("cruithne", 103, (1.85, 0.85, 1.0), 0.26, 0.22, 26,
             [(0, (78, 76, 74)), (0.45, (150, 147, 142)), (0.75, (186, 183, 178)), (1, (226, 224, 220))],
             [(78, 76, 74), (102, 100, 97), (126, 123, 119), (150, 147, 142), (170, 167, 162), (190, 187, 182), (226, 224, 220)])


def khonsu() -> None:
    # 52762 Khonsu (1998 MT24): about 6.7 km across, turning in 12.08 hours, on a comet-like orbit
    # out to 4 AU. Its shape and make-up are unknown: a blocky, lumpy stony body, S-type grey-brown.
    asteroid("khonsu", 107, (1.2, 0.88, 1.0), 0.42, 0.0, 40,
             [(0, (50, 46, 42)), (0.45, (118, 108, 96)), (0.75, (154, 142, 128)), (1, (202, 192, 178))],
             [(50, 46, 42), (70, 64, 58), (94, 86, 77), (118, 108, 96), (138, 127, 114), (160, 148, 134), (202, 192, 178)])


def arend_rigaux() -> None:
    # 49P/Arend-Rigaux, a nearly spent comet: a nucleus about 8.5 km across, turning backwards in
    # 13.45 hours (Eisner et al. 2017); its light curve (up to 0.4 mag) says about 1.45 times as long
    # as wide. One of the darkest things in the Solar System (albedo 0.028): coal-black, faintly
    # reddish, pitted rather than cratered, with a few paler patches of exposed ice. A little
    # lighter than life, so its shape still reads in the game's shade steps.
    asteroid("arendrigaux", 109, (1.45, 0.86, 1.0), 0.3, 0.06, 16,
             [(0, (22, 20, 20)), (0.45, (58, 53, 50)), (0.78, (86, 79, 74)), (1, (140, 148, 154))],
             [(22, 20, 20), (34, 31, 30), (46, 42, 40), (58, 53, 50), (72, 66, 62), (88, 80, 75), (140, 148, 154)])


def mesh_radius(file: str, radius_km: float) -> np.ndarray:
    """
    A published shape model (a Wavefront OBJ of triangles, in km, in the body's own frame: x
    towards longitude 0°, z the north pole) as a radius map in Terra Invicta's radius: how far
    the outermost surface lies from the centre in each direction. Points are scattered over every
    triangle (a grid of them on the small models, the vertices alone on the dense ones), each map
    cell keeps the farthest that falls in it, and cells none fell in are filled from around them.
    Overhangs and caves (Hyperion's) give way to the outer surface.
    """
    v: list[list[float]] = []
    f: list[list[int]] = []
    with open(CACHE / "shapes" / file) as obj:
        for line in obj:
            if line.startswith("v "):
                v.append([float(x) for x in line.split()[1:4]])
            elif line.startswith("f "):
                f.append([int(x.split("/")[0]) - 1 for x in line.split()[1:4]])
    verts = np.array(v)
    faces = np.array(f)
    if len(faces) > 400_000:
        points = verts
    else:
        a, b, c = verts[faces[:, 0]], verts[faces[:, 1]], verts[faces[:, 2]]
        n = 7
        points = np.concatenate([a * (i / n) + b * (j / n) + c * ((n - i - j) / n) for i in range(n + 1) for j in range(n + 1 - i)])
    r = np.linalg.norm(points, axis=1)
    lat = np.degrees(np.arcsin(np.clip(points[:, 2] / r, -1, 1)))
    lon = np.degrees(np.arctan2(points[:, 1], points[:, 0]))
    h, w = H // 2, W // 2
    y = np.clip(((90 - lat) / 180 * h).astype(int), 0, h - 1)
    x = np.clip(((lon + 180) / 360 * w).astype(int), 0, w - 1)
    grid = np.zeros(h * w)
    np.maximum.at(grid, y * w + x, r)
    grid = grid.reshape(h, w)
    full = np.repeat(np.repeat(grid, 2, axis=0), 2, axis=1)
    full = fill(full, full > 0)
    return full / radius_km


def shaped(name: str, file: str, radius_km: float, seed: int, stops: list[tuple[float, tuple[int, int, int]]],
           palette: list[tuple[int, int, int]], hollows: float, mottle: float = 0.8) -> None:
    """
    A small body drawn from its published shape model (mesh_radius), saved as its relief; its
    surface made up, as no global map of it exists, but from its real ground: a ramp of its tones,
    mottled with value noise on the sphere, and darkened in its hollows (hollows > 0, as dust and
    dark material gather there) or brightened in them (< 0), taken from the shape itself.
    """
    radius = mesh_radius(file, radius_km)
    print(f"{name}: shape reaches {radius.max():.3f} radii, nearest {radius.min():.3f}")
    save_relief(name, radius)
    hollow = blur(radius, 10) - radius
    hollow = hollow / max(1e-6, np.percentile(np.abs(hollow), 98))
    noise = sphere_noise(seed, [(2.5, 1.0), (7, 0.6), (18, 0.35)])
    value = 0.55 + (noise - 0.5) * mottle - hollows * 0.3 * np.clip(hollow, -1, 1)
    save(f"{name}.png", ramp(np.clip(value, 0, 1), stops), palette, dither=8)


def grey_steps(stops: list[tuple[float, tuple[int, int, int]]], n: int) -> list[tuple[int, int, int]]:
    """n palette colours evenly along a ramp."""
    out = ramp(np.linspace(0, 1, n), stops)
    return [tuple(int(round(c)) for c in row) for row in out]


# The bodies with published shape models (PDS Small Bodies Node: Gaskell's for Eros and Phoebe,
# Thomas's for Saturn's small moons, the Rosetta and Deep Impact teams' for Lutetia and Tempel 1),
# with their tones: (file, Terra Invicta's radius, seed, ramp, hollows, mottle).
SHAPED = {
    # NEAR's Eros: an S-type, ochre-tan, its crater walls brighter, its hollows ponded with dust.
    "eros": ("ver64q.tab.obj", 17.0, 131, [(0, (64, 54, 42)), (0.5, (150, 130, 104)), (1, (214, 198, 170))], -0.6, 0.6),
    # Rosetta's Lutetia: a neutral grey, faintly bluish, old and cratered.
    "lutetia": ("lutetia_003k_cart.obj", 61.0, 137, [(0, (54, 55, 58)), (0.5, (126, 127, 130)), (1, (198, 198, 198))], 0.4, 0.6),
    # Deep Impact's and Stardust's Tempel 1: dark, faintly red, its smooth flows and layered scarps.
    "tempel1": ("tempel1_2012_cart.obj", 5.3, 139, [(0, (26, 23, 22)), (0.5, (66, 60, 56)), (1, (120, 116, 112))], 0.5, 0.7),
    # Cassini's Phoebe: a dark captured body, its crater walls and ridges showing bright ice.
    "phoebe": ("phoebe_ver512q.tab.obj", 109.5, 149, [(0, (28, 26, 24)), (0.55, (70, 64, 58)), (0.85, (104, 100, 98)), (1, (176, 182, 188))], -0.9, 0.7),
    # Hyperion: reddish-tan sponge, its deep pits floored with dark red-brown material.
    "hyperion": ("hyperion_30k_plt.tab.obj", 180.0, 151, [(0, (58, 40, 30)), (0.4, (122, 94, 72)), (0.7, (172, 146, 116)), (1, (216, 198, 172))], 1.6, 0.5),
    # The co-orbitals and shepherds: bright, faintly cream ice.
    "janus": ("janus_30k_plt.tab.obj", 101.5, 157, [(0, (92, 90, 86)), (0.5, (178, 174, 166)), (1, (236, 232, 224))], 0.5, 0.6),
    "epimetheus": ("epimetheus_30k_plt.tab.obj", 65.0, 163, [(0, (92, 90, 86)), (0.5, (178, 174, 166)), (1, (236, 232, 224))], 0.5, 0.6),
    "prometheus": ("prometheus_30k_plt.tab.obj", 68.0, 167, [(0, (96, 90, 84)), (0.5, (182, 172, 160)), (1, (238, 230, 218))], 0.4, 0.6),
    "pandora": ("pandora_30k_plt.tab.obj", 52.0, 173, [(0, (96, 90, 84)), (0.5, (182, 172, 160)), (1, (238, 230, 218))], 0.4, 0.6),
    # The ring moons, coated in ring dust: smooth, cream, faintly red; Pan's and Atlas's equatorial ridges.
    "atlas": ("atlas_30k_plt.tab.obj", 20.5, 179, [(0, (110, 100, 90)), (0.5, (190, 178, 162)), (1, (240, 232, 220))], 0.3, 0.4),
    "pan": ("pan_30k_plt.tab.obj", 17.0, 181, [(0, (110, 100, 90)), (0.5, (190, 178, 162)), (1, (240, 232, 220))], 0.3, 0.4),
    "daphnis": ("daphnis_30k_plt.tab.obj", 4.9, 191, [(0, (110, 100, 90)), (0.5, (190, 178, 162)), (1, (240, 232, 220))], 0.3, 0.4),
    # The Trojans of Tethys and Dione: among the brightest things known, smooth white ice.
    "calypso": ("calypso_30k_plt.tab.obj", 15.1, 193, [(0, (140, 140, 140)), (0.5, (214, 214, 212)), (1, (250, 250, 248))], 0.3, 0.4),
    "telesto": ("telesto_30k_plt.tab.obj", 16.3, 197, [(0, (140, 140, 140)), (0.5, (214, 214, 212)), (1, (250, 250, 248))], 0.3, 0.4),
    "helene": ("helene_30k_plt.tab.obj", 21.7, 199, [(0, (130, 130, 132)), (0.5, (206, 206, 206)), (1, (246, 246, 244))], 0.3, 0.5),
}


def shaped_body(name: str):
    file, radius_km, seed, stops, hollows, mottle = SHAPED[name]
    return lambda: shaped(name, file, radius_km, seed, stops, grey_steps(stops, 9), hollows, mottle)


# The bodies whose shape models only Stooke's collection has (or none: Nix and Hydra), made up
# like the small asteroids but at their measured sizes: (semi-axes along longitude 0°, the pole
# and 90°W, in Terra Invicta's radius; mean radius in it), with their tones.
def measured(name: str, seed: int, axes_km: tuple[float, float, float], radius_km: float, lumps: float, waist: float, craters: int,
             stops: list[tuple[float, tuple[int, int, int]]]):
    a, c, b = axes_km
    mean = (a * b * c) ** (1 / 3) / radius_km
    return lambda: asteroid(name, seed, (a / radius_km, c / radius_km, b / radius_km), lumps, waist, craters, stops, grey_steps(stops, 7), mean)


MEASURED = {
    # NEAR's Mathilde, 66 × 48 × 44 km: coal-dark, battered by five craters as wide as itself.
    "mathilde": measured("mathilde", 211, (33, 22, 24), 33.0, 0.35, 0.0, 44, [(0, (18, 17, 16)), (0.5, (48, 45, 42)), (1, (96, 92, 88))]),
    # Giotto's Halley, about 15 × 8 × 7.5 km: a dark, peanut-like nucleus.
    "halley": measured("halley", 223, (7.6, 3.75, 4.0), 7.5, 0.3, 0.12, 14, [(0, (20, 18, 17)), (0.5, (50, 46, 43)), (1, (110, 112, 116))]),
    # Galileo's Amalthea, 250 × 146 × 128 km: the reddest thing in the Solar System, long axis to Jupiter.
    "amalthea": measured("amalthea", 227, (125, 64, 73), 125.0, 0.3, 0.0, 28, [(0, (58, 26, 18)), (0.5, (132, 64, 42)), (1, (200, 128, 96))]),
    # Galileo's Thebe, 116 × 98 × 84 km: dark and reddish.
    "thebe": measured("thebe", 229, (58, 42, 49), 58.0, 0.3, 0.0, 30, [(0, (40, 26, 22)), (0.5, (102, 70, 56)), (1, (170, 132, 110))]),
    # Voyager's Proteus, 420 × 416 × 402 km: dark grey, nearly as big as a body can be and stay unrounded.
    "proteus": measured("proteus", 233, (210, 201, 208), 218.0, 0.22, 0.0, 34, [(0, (34, 33, 32)), (0.5, (82, 80, 78)), (1, (148, 146, 144))]),
    # Voyager's Larissa, 216 × 204 × 168 km: dark, irregular, cratered.
    "larissa": measured("larissa", 239, (108, 84, 102), 108.0, 0.3, 0.0, 30, [(0, (34, 33, 32)), (0.5, (82, 80, 78)), (1, (148, 146, 144))]),
    # Voyager's Puck, about 162 km across, roughly round: dark grey, cratered.
    "puck": measured("puck", 241, (81, 77, 79), 81.0, 0.18, 0.0, 30, [(0, (36, 36, 36)), (0.5, (86, 86, 86)), (1, (150, 150, 150))]),
    # New Horizons' Nix, 49.8 × 33.2 × 31.1 km: bright neutral ice (albedo 0.56).
    "nix": measured("nix", 251, (24.9, 15.55, 16.6), 25.0, 0.3, 0.0, 16, [(0, (90, 90, 92)), (0.5, (176, 176, 178)), (1, (236, 236, 236))]),
    # New Horizons' Hydra, 50.9 × 36.1 × 30.9 km: brighter still (albedo 0.83), perhaps two-lobed.
    "hydra": measured("hydra", 257, (25.45, 15.45, 18.05), 32.5, 0.28, 0.12, 16, [(0, (110, 110, 112)), (0.5, (196, 196, 198)), (1, (246, 246, 246))]),
}


# Main-belt and near-Earth asteroids with no shape model or map, made up at their measured sizes
# (JPL's Small-Body Database: diameter, albedo, spectral type), as elongated as their light
# curves suggest where known: (seed, semi-axes in km along longitude 0°, the pole and 90°W,
# Terra Invicta's radius, lumps, waist, craters, tones, basin, and optionally crater depth).
DARK = [(0, (18, 17, 17)), (0.5, (52, 49, 47)), (1, (104, 100, 97))]
S_TYPE = [(0, (58, 50, 42)), (0.5, (138, 122, 102)), (1, (204, 190, 166))]
MADE_UP_ASTEROIDS = {
    # Pallas, 568 × 532 × 448 km: a B-type, bluish grey (albedo 0.155), so battered by large
    # craters (Marsset et al. 2020) that it looks like a golf ball, its south flattened as if by
    # an old basin, like Vesta's Rheasilvia.
    "pallas": (271, (284, 224, 266), 284.0, 0.05, 0.0, 90, [(0, (50, 54, 60)), (0.5, (118, 124, 132)), (1, (186, 192, 198))], (-75, 30, 55, 0.07), 0.4),
    # Ingeborg, about 16 km: a bright S-type (albedo 0.29), turning slowly (26.4 hours).
    "ingeborg": (277, (9.0, 6.8, 7.8), 9.815, 0.3, 0.0, 30, [(0, (70, 62, 52)), (0.5, (156, 140, 118)), (1, (222, 210, 188))], None),
    # Sisyphus, about 8.5 km, a fast rotator (2.4 hours) with a light curve hardly varying: nearly
    # round, a little squat, perhaps with a small moon.
    "sisyphus": (281, (4.4, 3.9, 4.35), 4.45, 0.16, 0.0, 26, S_TYPE, None),
    # Eric, about 11 km: an S-type, turning in 12.06 hours (Hanuš et al. 2013's model period).
    "eric": (283, (6.4, 4.4, 5.0), 5.4, 0.3, 0.0, 30, S_TYPE, None),
    # Öpik, about 5 km: dark (albedo 0.056), carbonaceous, turning in 6.44 hours.
    "opik": (293, (3.0, 2.2, 2.6), 2.59, 0.3, 0.0, 22, [(0, (22, 21, 20)), (0.5, (60, 57, 54)), (1, (116, 112, 108))], None),
    # Zeus, Napier and 2014 MQ18 (Terra Invicta's "Awilix"), each about 5 km, on long,
    # comet-like orbits: as dark as coal (albedo 0.03–0.04), perhaps spent comets.
    "zeus": (307, (3.1, 2.1, 2.5), 2.615, 0.32, 0.05, 18, DARK, None),
    "napier": (311, (3.2, 2.4, 2.8), 2.795, 0.3, 0.0, 20, DARK, None),
    "awilix": (313, (3.3, 2.2, 2.4), 2.636, 0.34, 0.1, 16, DARK, None),
}


def made_up_asteroid(name: str):
    seed, (a, c, b), radius_km, lumps, waist, craters, stops, basin, *depth = MADE_UP_ASTEROIDS[name]
    mean = (a * b * c) ** (1 / 3) / radius_km
    return lambda: asteroid(name, seed, (a / radius_km, c / radius_km, b / radius_km), lumps, waist, craters, stops, grey_steps(stops, 7), mean, basin, *depth)


def neptune() -> None:
    # Made up, as Uranus: no public-domain global map exists. After Voyager 2's, Hubble's and
    # JWST's views: a deeper, bluer globe than Uranus (true colour, as Irwin et al. 2024 rebalanced
    # Voyager's, not Voyager's published royal blue), faint bands, a darker collar round the south
    # pole near 60°–70°S, a dark spot at 22°N (as Hubble saw in 2018) with bright methane clouds at
    # its poleward edge, white cloud streaks at 20°–30°S and 25°–45°N, and the small bright
    # "Scooter" at 42°S.
    ripple = fbm(71, [(48, 96, 1.0), (96, 192, 0.4)])
    swirl = fbm(73, [(12, 24, 1.0), (32, 64, 0.5)])
    lat = LAT + (swirl - 0.5) * 2.0
    profile = [
        (90, (112, 150, 208)), (70, (104, 144, 206)), (50, (96, 136, 204)), (35, (104, 146, 210)),
        (20, (96, 138, 206)), (8, (110, 152, 214)), (0, (114, 156, 216)), (-8, (110, 152, 214)),
        (-22, (98, 140, 208)), (-38, (104, 146, 210)), (-55, (90, 128, 198)), (-63, (70, 104, 178)),
        (-70, (74, 108, 182)), (-78, (100, 140, 204)), (-90, (116, 156, 212)),
    ]
    xs = [-q[0] for q in profile]
    out = np.stack([np.interp(-lat, xs, [q[1][i] for q in profile]) for i in range(3)], axis=-1)
    out *= (0.97 + 0.06 * ripple)[..., None]
    # The dark spot, and its companion clouds on the poleward side.
    spot = ((LAT - 22) / 5.5) ** 2 + (((LON + 40 + 180) % 360 - 180) / 13) ** 2
    out = np.where((spot < 1)[..., None], out * 0.62 + np.array([20, 34, 80]) * 0.38, out)
    companion = ((LAT - 29) / 2.2) ** 2 + (((LON + 36 + 180) % 360 - 180) / 11) ** 2
    # White streaks: noise peaks in two belts, stretched east–west, and the Scooter.
    clouds = fbm(77, [(128, 64, 1.0), (256, 128, 0.5)])
    belts = np.clip(1 - np.abs(LAT + 25) / 6, 0, 1) + np.clip(1 - np.abs(LAT - 35) / 10, 0, 1)
    cloud = np.clip((clouds - 0.7) / 0.07, 0, 1) * np.clip(belts, 0, 1)
    cloud = np.maximum(cloud, (companion < 1).astype(float))
    scooter = ((LAT + 42) / 2) ** 2 + (((LON - 70 + 180) % 360 - 180) / 4) ** 2
    cloud = np.maximum(cloud, (scooter < 1).astype(float))
    out = out * (1 - cloud[..., None]) + np.array([236, 244, 250]) * cloud[..., None]
    save("neptune.png", out, [
        (52, 82, 154), (70, 104, 178), (84, 120, 192), (94, 134, 202), (102, 144, 208),
        (110, 152, 214), (120, 160, 218), (160, 190, 230), (236, 244, 250),
    ], dither=5)


def triton() -> None:
    # Voyager 2's colour mosaic, its gaps filled from lower-resolution views ("GlobalFill"); the
    # pinkish south polar cap with its dark wind streaks, the "cantaloupe" terrain to the west and
    # the frozen smooth plains. Voyager's filters give it a green cast, so its brightness goes on
    # a ramp of Triton's real tones (greyish to pale peach-pink), with a little of the mosaic's
    # own colour, the cast taken out. Voyager came by in 1989 with the south pole towards the
    # Sun, so the north beyond the coverage, roughly 10°–45°N, is made up (unseen()) from the
    # imaged ground between 35°S and 25°N.
    rgb = mosaic("Triton_Voyager2_ClrMosaic_GlobalFill_600m.tif")
    valid = blur((rgb.max(axis=2) > 4).astype(np.float64), 4) > 0.995
    for k in range(3):
        rgb[..., k] = fill(rgb[..., k], valid)
    lum = rgb.mean(axis=2)
    chroma = rgb - lum[..., None]
    chroma -= chroma[valid].mean(axis=0)
    value = stretch(lum, valid, 1, 99.7)
    donor = valid & (LAT > -35) & (LAT < 25)
    value, _ = unseen(value, valid, donor, 79, flatten=0.8, extend=True)
    weight = blur(valid.astype(np.float64), 6) * valid
    out = ramp(np.clip(value, 0, 1), [(0, (84, 76, 76)), (0.45, (178, 160, 154)), (0.8, (226, 212, 204)), (1, (248, 240, 234))])
    out += chroma * 0.5 * weight[..., None]
    save("triton.png", out, kmeans_palette(np.clip(out, 0, 255), 12), dither=8)


def pluto() -> None:
    # New Horizons' greyscale mosaic (LORRI, with the far side from lower-resolution approach
    # views), coloured along a ramp of Pluto's tones in its MVIC colour views: the tholin-dark,
    # reddish-brown Cthulhu, tan-orange uplands, and the pale cream nitrogen ice of Sputnik
    # Planitia; the north polar Lowell Regio greyer. Its longitudes run 0° to 360° east, so it is
    # turned half a turn. New Horizons came by in 2015 with the south in polar night, so south of
    # about 30°S is made up (unseen()) from the imaged ground between 20°S and 55°N.
    grey = np.roll(mosaic("Pluto_NewHorizons_Global_Mosaic_300m_Jul2017_8bit.tif", "L"), W // 2, axis=1)
    valid = blur((grey > 2).astype(np.float64), 4) > 0.995
    value = stretch(fill(grey, valid), valid, 0.5, 99.8)
    donor = valid & (LAT > -20) & (LAT < 55) & (np.abs(LON) > 4)
    value, _ = unseen(value, valid, donor, 83, flatten=1.0, extend=True)
    out = ramp(np.clip(value, 0, 1), [
        (0, (66, 38, 28)), (0.22, (108, 64, 44)), (0.45, (170, 122, 88)), (0.62, (206, 170, 132)),
        (0.8, (230, 212, 186)), (1, (248, 242, 230)),
    ])
    north = np.clip((LAT - 60) / 15, 0, 1)[..., None] * 0.35
    out = out * (1 - north) + out.mean(axis=2, keepdims=True) * np.array([1.0, 1.0, 1.02]) * north
    save("pluto.png", out, kmeans_palette(np.clip(out, 0, 255), 14), dither=8)


def vesta() -> None:
    # Dawn's Framing Camera mosaic (DLR, from the High Altitude Mapping Orbit) for its surface, and
    # DLR's shape model from the same orbit for its form: Vesta is no sphere but a lumpy, flattened
    # body, 212 to 293 km from its centre, its south blasted flat by the Rheasilvia basin (with
    # its great central peak) over the older Veneneia, its equator ringed by the Divalia Fossae
    # troughs. The shape model gives the radius itself (metres), here in Terra Invicta's radius
    # (286.3 km, the long semi-axis). The mosaic is lit by a low Sun, so its broad swings of
    # brightness are halved (the shape model shades it now); its far north, in winter darkness
    # when Dawn mapped it, is made up (unseen()) from the ground between 50°S and 40°N. Grey, a
    # little warm, with Vesta's brighter and darker (carbonaceous) materials.
    Image.MAX_IMAGE_PIXELS = None
    radius = np.asarray(Image.open(CACHE / "Vesta_Dawn_HAMO_DTM_DLR_Global_48ppd.tif").resize((W, H), Image.Resampling.BOX), dtype=np.float64) / 1000 / 286.3
    print(f"vesta: shape reaches {radius.max():.3f} radii, nearest {radius.min():.3f}")
    save_relief("vesta", radius)
    grey = mosaic("Vesta_Dawn_FC_HAMO_Mosaic_Global_74ppd.tif", "L")
    lit = blur(grey, 8)
    valid = blur(((grey > 2) & ~((LAT > 50) & (lit < np.percentile(lit[LAT > 0], 12)))).astype(np.float64), 4) > 0.995
    value = stretch(fill(grey, valid), valid, 0.5, 99.7)
    donor = valid & (LAT > -50) & (LAT < 40)
    value, _ = unseen(value, valid, donor, 117, flatten=0.5, extend=True)
    out = ramp(np.clip(value, 0, 1), [(0, (54, 51, 48)), (0.5, (150, 144, 136)), (0.8, (194, 188, 178)), (1, (230, 224, 214))])
    save("vesta.png", out, [
        (54, 51, 48), (76, 72, 68), (98, 94, 89), (122, 117, 111), (150, 144, 136), (172, 166, 157), (194, 188, 178), (230, 224, 214),
    ], dither=8)


def charon() -> None:
    # New Horizons' greyscale mosaic: Charon's neutral grey water ice, the cratered north cut by
    # the Serenity and Mandjet chasmata, the smooth plains of Vulcan Planitia, and the reddish-brown
    # tholin cap of Mordor Macula round the north pole (tinted here from its darkness there, as in
    # the MVIC colour views). The south was in polar night in 2015, so south of about 30°S is made
    # up (unseen()) from the imaged ground between 25°S and 50°N.
    grey = mosaic("Charon_NewHorizons_Global_Mosaic_300m_Jul2017_8bit.tif", "L")
    valid = blur((grey > 2).astype(np.float64), 4) > 0.995
    value = stretch(fill(grey, valid), valid, 0.5, 99.8)
    donor = valid & (LAT > -25) & (LAT < 50)
    value, _ = unseen(value, valid, donor, 113, flatten=0.8, extend=True)
    value = np.clip(value, 0, 1)
    out = ramp(value, [(0, (52, 52, 54)), (0.5, (138, 138, 140)), (0.8, (190, 190, 190)), (1, (232, 232, 230))])
    # Mordor: a soft reddish cap, strongest where darkest, its texture kept.
    mordor = (np.clip((LAT - 55) / 20, 0, 1) ** 1.5 * np.clip((0.62 - value) / 0.35, 0, 1) * 0.75)[..., None]
    out = out * (1 - mordor) + out * np.array([1.35, 0.9, 0.7]) * mordor
    save("charon.png", out, [
        (52, 52, 54), (74, 74, 76), (98, 98, 100), (122, 122, 124), (146, 146, 147), (170, 170, 170),
        (194, 194, 193), (216, 216, 214), (234, 234, 232),       # the grey ice
        (66, 47, 38), (92, 66, 52), (120, 92, 76),                # Mordor's tholins
    ], dither=8)


def eris() -> None:
    # Made up: no spacecraft has been there and no telescope resolves it. Eris is about the
    # brightest thing in the Solar System (albedo 0.96), probably fresh methane frost condensed
    # from its atmosphere as it fell towards aphelion, and its light hardly varies as it turns:
    # an almost white globe with the faintest grey-cream mottling.
    mottle = sphere_noise(87, [(2.5, 1.0), (6, 0.6), (15, 0.3)])
    value = 0.5 + (mottle - 0.5) * 2.2
    out = ramp(np.clip(value, 0, 1), [(0, (204, 202, 196)), (0.5, (232, 231, 226)), (1, (250, 250, 248))])
    save("eris.png", out, [(204, 202, 196), (216, 214, 209), (228, 227, 222), (238, 237, 233), (248, 248, 246)], dither=6)


def haumea() -> None:
    # Made up. Haumea is coated with crystalline water ice, bright and faintly bluish white, and
    # its light curve shows a darker, redder region (Lacerda et al. 2008's "dark red spot"), put
    # here on the equator at 0°, on the long axis.
    mottle = sphere_noise(89, [(2.5, 1.0), (6, 0.6), (15, 0.3)])
    value = 0.5 + (mottle - 0.5) * 2.0
    out = ramp(np.clip(value, 0, 1), [(0, (182, 186, 190)), (0.5, (216, 220, 224)), (1, (244, 246, 248))])
    # The spot: soft, its edge ragged with noise.
    d = np.degrees(np.arccos(np.clip(np.cos(np.radians(LAT)) * np.cos(np.radians(LON)), -1, 1)))
    ragged = sphere_noise(90, [(5, 1.0), (12, 0.5)])
    spot = np.clip(1 - (d + (ragged - 0.5) * 22 - 10) / 18, 0, 1)[..., None]
    out = out * (1 - spot * 0.7) + np.array([150, 100, 88]) * spot * 0.7
    save("haumea.png", out, [
        (150, 100, 88), (168, 122, 110), (188, 152, 144), (182, 186, 190), (198, 202, 206), (214, 218, 222),
        (228, 231, 234), (242, 244, 246),
    ], dither=6)


def makemake() -> None:
    # Made up. Bright (albedo 0.82) methane and ethane ice tinged reddish-tan by tholins, patchy
    # (its light curve varies a little), with a few redder, darker regions.
    broad = sphere_noise(91, [(1.6, 1.0), (4, 0.6)])
    fine = sphere_noise(93, [(10, 1.0), (20, 0.5)])
    value = 0.6 + (broad - 0.5) * 1.6 + (fine - 0.5) * 0.4
    out = ramp(np.clip(value, 0, 1), [
        (0, (148, 92, 64)), (0.3, (190, 134, 98)), (0.55, (222, 178, 140)), (0.8, (238, 214, 186)), (1, (250, 244, 234)),
    ])
    save("makemake.png", out, [
        (148, 92, 64), (172, 114, 82), (194, 140, 104), (212, 164, 126), (226, 186, 150),
        (236, 206, 176), (244, 226, 204), (250, 244, 234),
    ], dither=7)


# Dwarf planets no spacecraft has seen and no telescope resolves, too big to be lumpy: round globes
# (drawn as ellipsoids in bodyArt.ts where they are measurably not), made up after their colours and
# albedos (the tones) and water ice or tholins (the patches): (seed, tones, how patchy, craters,
# and a great dark hollow where an occultation found one: latitude, longitude, angular radius).
LESSER_DWARFS = {
    # Very red (V−R 0.86), methane frost on water ice; albedo 0.14.
    "gonggong": (401, [(0, (84, 38, 28)), (0.5, (150, 76, 52)), (1, (206, 128, 92))], 1.5, 20, None),
    # Red, albedo 0.11: crystalline water ice under methane and ethane.
    "quaoar": (409, [(0, (62, 40, 32)), (0.5, (128, 88, 70)), (1, (186, 144, 118))], 1.4, 40, None),
    # Neutral grey, water ice, albedo 0.10; a depression seen by occultation (Dias-Oliveira et al. 2017).
    "achlys": (419, [(0, (52, 52, 54)), (0.5, (112, 112, 114)), (1, (170, 170, 172))], 1.2, 50, (15, 60, 32)),
    # Neutral, albedo 0.23: water ice and perhaps ammonia, brighter patches on grey.
    "orcus": (421, [(0, (92, 96, 104)), (0.5, (156, 160, 166)), (1, (214, 218, 222))], 1.8, 30, None),
    # Among the reddest things in the Solar System, tholins over methane and nitrogen ice; albedo 0.41; hardly cratered in the distant dark.
    "sedna": (431, [(0, (120, 52, 36)), (0.5, (186, 92, 62)), (1, (234, 150, 112))], 1.2, 8, None),
    # Very dark, albedo 0.04.
    "salacia": (433, [(0, (22, 21, 21)), (0.5, (52, 49, 47)), (1, (92, 88, 84))], 1.1, 60, None),
    # Dark grey, water ice, albedo 0.10; a depression some 320 km across seen by occultation (Rommel et al. 2023).
    "mani": (439, [(0, (44, 42, 40)), (0.5, (96, 90, 84)), (1, (150, 144, 136))], 1.1, 55, (-20, 100, 25)),
    # Moderately red, albedo 0.10.
    "aya": (443, [(0, (60, 46, 38)), (0.5, (122, 98, 82)), (1, (178, 150, 130))], 1.3, 45, None),
    # Moderately red and rather bright, albedo 0.17.
    "chiminigagua": (449, [(0, (78, 60, 50)), (0.5, (144, 118, 100)), (1, (198, 174, 154))], 1.5, 35, None),
    # Moderately red, carbon-oxide ices, albedo 0.10.
    "varda": (457, [(0, (58, 42, 36)), (0.5, (118, 90, 76)), (1, (172, 142, 124))], 1.3, 45, None),
    # Dark and moderately red, albedo 0.08.
    "goibniu": (461, [(0, (44, 38, 34)), (0.5, (94, 80, 70)), (1, (146, 128, 114))], 1.2, 55, None),
    # Moderately red, carbon-oxide ices, albedo 0.11.
    "ritona": (463, [(0, (62, 46, 38)), (0.5, (122, 96, 80)), (1, (176, 148, 128))], 1.3, 45, None),
    # Moderately red (V−R 0.62), water ice, albedo 0.13.
    "varuna": (467, [(0, (62, 50, 42)), (0.5, (124, 102, 86)), (1, (180, 156, 136))], 1.3, 45, None),
    # Nothing is measured of its colour: made up, a dull tan.
    "izanagi": (479, [(0, (70, 62, 56)), (0.5, (130, 118, 108)), (1, (186, 174, 162))], 1.3, 40, None),
    # Moderately red, carbon-oxide ices, albedo 0.13.
    "uni": (487, [(0, (60, 48, 42)), (0.5, (120, 100, 90)), (1, (174, 152, 140))], 1.3, 45, None),
    # "Farout": a pinkish hue, as its discoverers saw it (Sheppard et al. 2018).
    "farout": (491, [(0, (110, 72, 72)), (0.5, (174, 126, 124)), (1, (224, 184, 180))], 1.2, 20, None),
    # Red (V−I 1.8).
    "gkun": (499, [(0, (76, 44, 36)), (0.5, (138, 90, 72)), (1, (192, 146, 124))], 1.3, 35, None),
    # DeeDee: reddish (g−r 0.77), albedo 0.13.
    "deedee": (503, [(0, (70, 50, 42)), (0.5, (130, 100, 84)), (1, (184, 156, 136))], 1.3, 35, None),
    # Neutral (g−r 0.59); its albedo is only assumed.
    "rr245": (509, [(0, (72, 72, 72)), (0.5, (128, 128, 126)), (1, (182, 182, 178))], 1.2, 40, None),
    # Moderately red (V−R 0.61), albedo 0.11.
    "ixion": (521, [(0, (66, 46, 36)), (0.5, (130, 98, 78)), (1, (186, 154, 130))], 1.3, 45, None),
}


def lesser_dwarf(name: str):
    """A made-up round dwarf planet: a surface of its tones, mottled at two scales, with faint craters, dark floors and bright rims."""
    seed, stops, patchy, craters, hollow = LESSER_DWARFS[name]

    def build() -> None:
        value = 0.5 + (sphere_noise(seed, [(1.6, 1.0), (4, 0.6)]) - 0.5) * patchy + (sphere_noise(seed + 1, [(10, 1.0), (20, 0.5)]) - 0.5) * 0.5
        rng = np.random.default_rng(seed + 2)
        la, lo = np.radians(LAT), np.radians(LON)
        u = np.stack([np.cos(la) * np.cos(lo), np.sin(la), -np.cos(la) * np.sin(lo)], axis=-1)
        for _ in range(craters):
            centre = rng.normal(size=3)
            q = np.degrees(np.arccos(np.clip(u @ (centre / np.linalg.norm(centre)), -1, 1))) / (2 + 12 * rng.random() ** 3)
            value += np.where(q < 1, -0.16 * (1 - q * q), 0) + 0.1 * np.exp(-(((q - 1.05) / 0.2) ** 2))
        if hollow:
            q = np.degrees(np.arccos(np.clip(u @ sunpoint_xyz(hollow[0], hollow[1]), -1, 1))) / hollow[2]
            value += np.where(q < 1, -0.3 * np.cos(q * np.pi / 2) ** 2, 0) + 0.14 * np.exp(-(((q - 1.03) / 0.1) ** 2))
        save(f"{name}.png", ramp(np.clip(value, 0, 1), stops), grey_steps(stops, 7), dither=6)

    return build


BODIES = {
    "mercury": mercury, "luna": luna, "mars": mars, "ceres": ceres, "venus": venus,
    "jupiter": jupiter, "io": io, "europa": europa, "ganymede": ganymede, "callisto": callisto,
    "saturn": saturn, "titan": titan, "mimas": mimas, "enceladus": enceladus, "tethys": tethys,
    "dione": dione, "rhea": rhea, "iapetus": iapetus,
    "uranus": uranus, "miranda": miranda, "ariel": ariel, "umbriel": umbriel, "titania": titania, "oberon": oberon,
    "lick": lick, "cruithne": cruithne, "khonsu": khonsu, "arendrigaux": arend_rigaux, "phobos": phobos, "deimos": deimos, "neptune": neptune, "triton": triton, "pluto": pluto, "charon": charon, "vesta": vesta, "eris": eris, "haumea": haumea, "makemake": makemake,
    **{name: shaped_body(name) for name in SHAPED}, **MEASURED,
    **{name: made_up_asteroid(name) for name in MADE_UP_ASTEROIDS},
    **{name: lesser_dwarf(name) for name in LESSER_DWARFS},
}

if __name__ == "__main__":
    for name in sys.argv[1:] or BODIES:
        BODIES[name]()
