"""Builds public/map/mercury.png, a pixel-art map of Mercury, from NASA's MESSENGER data.

Sources (public domain, USGS Astrogeology; downloaded by fetch.py into tools/data/.cache):
  Mercury MESSENGER MDIS global colour mosaic, 665 m/px (Denevi et al.): the 1000, 750 and
    430 nm filters as red, green and blue, longitudes −180° to 180° east.
  Mercury MESSENGER USGS global DEM, 665 m/px (Becker et al.): heights in metres from
    2439.4 km, signed 16-bit, longitudes 0° to 360° east.

Run: python3 -I tools/data/build_mercury.py

The map is equirectangular, longitude −180° to 180° east left to right, like earth.png. The
mosaic is photometrically flattened, so the relief comes from the DEM: a hillshade lit from
the north-west, as in shaded-relief maps, mixed into the mosaic's brightness. The mosaic's
colour is strongly stretched; it is pulled back to Mercury's real brownish grey, keeping the
differences that matter: the bluish low-reflectance material, the warmer smooth plains, the
bright young craters, rays and hollows. Gaps in the mosaic and its noisy far south are filled
from the surroundings. The result is mapped onto a hand-picked palette with ordered dithering.
"""

import pathlib

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE = ROOT / "tools/data/.cache"
MAP_OUT = ROOT / "public/map"

W, H = 1024, 512
MOSAIC = CACHE / "Mercury_MESSENGER_ClrMosaic_global_665m_v3.tif"
DEM = CACHE / "Mercury_Messenger_USGS_DEM_Global_665m_v2.tif"
# The DEM's layout (read straight, as Pillow mistakes its signed 16-bit samples for 32-bit).
DEM_OFFSET, DEM_SHAPE = 92981, (11520, 23040)
# The mosaic's colour is noise below this latitude, so it is taken from the surroundings.
SOUTH_COLOUR_LIMIT = -68
# Towards the poles (beyond these latitudes) the mosaic has a gap in the north and noise in the
# south, so its brightness and colour fade to the average there and the relief alone shows;
# the DEM, poorer in the south, is smoothed beyond the last.
NORTH_FADE, SOUTH_FADE, SOUTH_SMOOTH = 78, -72, -74

BAYER4 = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) + 0.5) / 16 - 0.5

# Hand-picked palette: a cool ramp (low-reflectance material), a neutral brownish-grey ramp
# (intercrater plains), a warm ramp (smooth plains, the reddish pyroclastic spots) and the bright
# ray and hollow material, with deep shadow.
PALETTE = np.array([
    (30, 30, 34), (46, 47, 52),                                   # shadow
    (62, 65, 72), (84, 87, 95), (108, 111, 118), (134, 137, 143),  # cool
    (72, 68, 63), (96, 91, 84), (122, 116, 107), (148, 141, 130), (172, 165, 153),  # neutral
    (118, 104, 88), (146, 129, 108), (174, 156, 130),             # warm
    (196, 196, 194), (220, 222, 224), (242, 244, 246),            # bright
], dtype=np.float32)


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


def hillshade(height: np.ndarray, lat: np.ndarray) -> np.ndarray:
    """Lambertian hillshade, 0–1, lit from the north-west at 35° above the horizon."""
    metres = 2 * np.pi * 2439400 / W
    dzdx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * metres * np.maximum(np.cos(np.radians(lat)), 0.05))
    dzdy = (np.vstack([height[:1], height[:-1]]) - np.vstack([height[1:], height[-1:]])) / (2 * metres)
    # Exaggerated, so relief reads at this scale.
    dzdx, dzdy = dzdx * 6, dzdy * 6
    az, alt = np.radians(315), np.radians(35)
    lx, ly, lz = np.cos(alt) * np.sin(az), np.cos(alt) * np.cos(az), np.sin(alt)
    n = np.sqrt(dzdx**2 + dzdy**2 + 1)
    return np.clip((-dzdx * lx - dzdy * ly + lz) / n, 0, 1)


def main() -> None:
    Image.MAX_IMAGE_PIXELS = None
    lat = (90.0 - (np.arange(H) + 0.5) * 180.0 / H)[:, None] * np.ones((1, W))

    # Colour mosaic: brightness and a red–blue colour index, gaps and the far south filled.
    mosaic = np.asarray(Image.open(MOSAIC).convert("RGB").resize((W, H), Image.Resampling.BOX), dtype=np.float64)
    lum = mosaic.mean(axis=2)
    # Gaps are black, and averaging down blends their edges, so they are widened a little.
    valid = blur((mosaic.min(axis=2) > 4).astype(np.float64), 1) > 0.98
    colour = (mosaic[..., 0] - mosaic[..., 2]) / np.maximum(mosaic.sum(axis=2), 1)
    lum = fill(lum, valid)
    colour = fill(colour, valid & (lat > SOUTH_COLOUR_LIMIT))
    lo, hi = np.percentile(lum[valid], (2, 99.5))
    albedo = np.clip((lum - lo) / (hi - lo), 0, 1)
    c_lo, c_hi = np.percentile(colour[valid], (3, 97))
    tint = np.clip((colour - (c_lo + c_hi) / 2) / ((c_hi - c_lo) / 2), -1, 1)
    polar = np.clip(np.maximum((lat - NORTH_FADE) / 6, (SOUTH_FADE - lat) / 6), 0, 1)
    albedo = albedo * (1 - polar) + np.median(albedo[valid]) * polar
    tint = tint * (1 - polar)

    # Relief from the DEM, at twice the map's size and then averaged down; longitude 0–360° rolled to −180–180°.
    dem = np.memmap(DEM, dtype="<i2", mode="r", offset=DEM_OFFSET, shape=DEM_SHAPE)
    rows = ((np.arange(2 * H) + 0.5) * DEM_SHAPE[0] / (2 * H)).astype(int)
    cols = ((np.arange(2 * W) + 0.5) * DEM_SHAPE[1] / (2 * W)).astype(int)
    height = np.asarray(dem[rows][:, cols], dtype=np.float64)
    height = np.roll(height, height.shape[1] // 2, axis=1)
    height = height.reshape(H, 2, W, 2).mean(axis=(1, 3))
    south = np.clip((SOUTH_SMOOTH - lat) / 10, 0, 1)
    height = height * (1 - south) + blur(height, 1.2) * south
    shade = hillshade(height, lat)
    flat = np.cos(np.radians(35))
    relief = shade / flat

    # Brightness: the mosaic's albedo, darkened in shadow and lifted on sunward slopes.
    value = (0.22 + 0.7 * albedo) * (0.55 + 0.45 * relief)
    value = np.clip(value * 1.05, 0, 1.1)
    grey = 26 + value * 214
    # Mercury's brownish grey, warmed or cooled a little by the colour index.
    rgb = np.stack([grey * (1.03 + 0.05 * tint), grey * (1.0 + 0.01 * tint), grey * (0.95 - 0.055 * tint)], axis=-1)

    dithered = rgb + np.tile(BAYER4, (H // 4, W // 4))[..., None] * 9
    d = ((dithered[..., None, :] - PALETTE[None, None, :, :]) ** 2).sum(-1)
    out = PALETTE[np.argmin(d, axis=-1)]
    MAP_OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(out.astype(np.uint8), "RGB").save(MAP_OUT / "mercury.png", optimize=True)
    print(f"mercury.png {W}x{H}, {len(np.unique(out.reshape(-1, 3), axis=0))} colours")


if __name__ == "__main__":
    main()
