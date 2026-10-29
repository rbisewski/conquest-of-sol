"""Builds the pixel-art surface maps of the bodies the camera can come right down to, in public/map:
mercury.png, luna.png, mars.png and ceres.png from spacecraft data, venus.png (its clouds) made up.

Sources (public domain; downloaded by fetch.py into tools/data/.cache):
  Mercury: USGS Astrogeology's MESSENGER MDIS global colour mosaic, 665 m/px (Denevi et al.; the
    1000, 750 and 430 nm filters as red, green and blue) and USGS global DEM from MESSENGER stereo,
    665 m/px (Becker et al.; signed 16-bit metres, longitudes 0° to 360° east).
  Luna: NASA SVS's CGI Moon Kit: the LRO LROC WAC colour map (4096 × 2048) and LOLA heights at
    16 px/degree (unsigned 16-bit, half-metres).
  Mars: USGS's Viking colour mosaic, 925 m/px, and MGS MOLA's MEGDR heights at 16 px/degree (PDS
    Geosciences; big-endian signed 16-bit metres, longitudes 0° to 360° east).
  Ceres: DLR's Dawn Framing Camera global mosaic at 20 px/degree (USGS; greyscale).
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

import pathlib
import sys

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


def mosaic(name: str, mode: str = "RGB") -> np.ndarray:
    """A global mosaic from the cache, averaged down to the map's size."""
    Image.MAX_IMAGE_PIXELS = None
    return np.asarray(Image.open(CACHE / name).convert(mode).resize((W, H), Image.Resampling.BOX), dtype=np.float64)


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


BODIES = {"mercury": mercury, "luna": luna, "mars": mars, "ceres": ceres, "venus": venus}

if __name__ == "__main__":
    for name in sys.argv[1:] or BODIES:
        BODIES[name]()
