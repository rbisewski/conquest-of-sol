// Pixel art for the space layer (SPEC 2.10.2, decision D18), drawn from character grids: each
// character is a pixel in its palette's colour, "." is clear. SVG icons and canvas portraits draw
// the same grids, so a sprite looks the same everywhere, at whole-pixel scales.

export type Palette = Record<string, string>;

/**
 * A prospecting probe, Voyager-like: its dish seen from the side, the bus beneath in gold foil,
 * the magnetometer boom out to the right, the power unit's boom down to the left and the science
 * boom down to the right. "a" is the icon's colour, "b" a darker shade of it, "c" the foil.
 */
export const PROBE = [
  "................",
  "...aaaaaaaaa....",
  "..abbbbbbbbba...",
  ".abbbbbbbbbbba..",
  "..aabbbbbbbaa...",
  "....aaaaaaa.....",
  ".......a........",
  "......aaa.......",
  ".....acccaaaaaaa",
  ".....acccaa.....",
  "....aaaaa.a.....",
  "...a.......a....",
  "..ab........a...",
  ".abb.........a..",
  ".aa...........a.",
  "................",
];

/** A hab site's marker on a body's portrait: a diamond, ringed in black to stand out on any ground. */
export const SITE_MARKER = ["...k...", "..kok..", ".kofok.", "kofffok", ".kofok.", "..kok..", "...k..."];

/** Site markers by what we know: not prospected, prospected, and the site picked in the list. */
export const SITE_PALETTES: Record<"unknown" | "prospected" | "selected", Palette> = {
  unknown: { k: "rgba(0,0,0,0.75)", o: "#9aa7b3", f: "#3b4652" },
  prospected: { k: "rgba(0,0,0,0.75)", o: "#d6f4f6", f: "#3aa6b0" },
  selected: { k: "rgba(0,0,0,0.85)", o: "#ffffff", f: "#ffd37a" },
};

/** The sprite as runs of same-coloured pixels along each row, for SVG rects. */
export function spriteRuns(rows: string[]): { x: number; y: number; width: number; key: string }[] {
  const runs: { x: number; y: number; width: number; key: string }[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const key = row[x]!;
      let end = x + 1;
      while (end < row.length && row[end] === key) end++;
      if (key !== ".") runs.push({ x, y, width: end - x, key });
      x = end;
    }
  });
  return runs;
}

/** Draws a sprite centred on (cx, cy), one canvas pixel per sprite pixel. */
export function drawSprite(ctx: CanvasRenderingContext2D, rows: string[], palette: Palette, cx: number, cy: number): void {
  const left = Math.round(cx - rows[0]!.length / 2);
  const top = Math.round(cy - rows.length / 2);
  for (const run of spriteRuns(rows)) {
    ctx.fillStyle = palette[run.key]!;
    ctx.fillRect(left + run.x, top + run.y, run.width, 1);
  }
}
