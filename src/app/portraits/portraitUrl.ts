// Portrait images for the UI: the pure renderer in portrait.ts, drawn to a canvas and
// cached as data URLs.

import type { Gender } from "../../sim/index";
import { HEAD_CROP, PORTRAIT_HEIGHT as H, PORTRAIT_WIDTH as W, renderPortrait } from "./portrait";

const cache = new Map<string, string>();

/**
 * A PNG data URL of the portrait at native size (128×150, or a square head crop).
 * Scale the full portrait by whole numbers with `image-rendering: pixelated`.
 */
export function portraitUrl(
  seed: number,
  gender: Gender,
  professionId: string,
  accent: string,
  crop: "full" | "head" = "full",
  skin: number | null = null,
  hairSeed: number | null = null,
): string {
  const key = `${seed}:${gender}:${professionId}:${accent}:${crop}:${skin}:${hairSeed}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(W, H);
  image.data.set(renderPortrait(seed, gender, professionId, accent, crop === "full", skin, hairSeed));
  ctx.putImageData(image, 0, 0);
  let url: string;
  if (crop === "head") {
    const head = document.createElement("canvas");
    head.width = HEAD_CROP.size;
    head.height = HEAD_CROP.size;
    head.getContext("2d")!.drawImage(canvas, HEAD_CROP.x, HEAD_CROP.y, HEAD_CROP.size, HEAD_CROP.size, 0, 0, HEAD_CROP.size, HEAD_CROP.size);
    url = head.toDataURL();
  } else url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}

