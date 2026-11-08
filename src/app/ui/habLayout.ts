// Where a hab's modules sit in its picture (HabScene), in cells (one module each), the core at
// the origin, y down. Slots come in Terra Invicta's sectors: the core's sector holds it and the
// next four slots (a base's mining slot first), each further sector four more. A base is laid out
// as a grid of pads joined by corridors: the core's sector round it in a cross, each other sector
// a square of four in a corner, reached along a corridor. A station's core sector sits on short
// spokes, the other sectors spread along a ring round it.

export interface Point {
  x: number;
  y: number;
}

export interface HabLayout {
  /** Each slot's centre, the core first. */
  slots: Point[];
  /** Corridors (a base) or trusses (a station), as polylines. */
  links: Point[][];
  /** A station's ring arcs: radius and angles in radians (y down). */
  arcs: { r: number; from: number; to: number }[];
  /** The corners of what the layout covers, slots' half-cells included. */
  min: Point;
  max: Point;
}

/** Corners, in the order further sectors take them: NE, SW, NW, SE (y down). */
const CORNERS: [number, number][] = [
  [1, -1],
  [-1, 1],
  [-1, -1],
  [1, 1],
];
/** A station's ring radius and its core sector's spoke length, in cells. */
const RING = 3;
const SPOKE = 1.3;

export function habLayout(kind: "base" | "station", slotCount: number): HabLayout {
  const sectors = Math.max(1, Math.ceil((slotCount - 1) / 4));
  const slots: Point[] = [{ x: 0, y: 0 }];
  const links: Point[][] = [];
  const arcs: HabLayout["arcs"] = [];
  const near = kind === "base" ? 1 : SPOKE;
  // The core's sector: north (a base's mining slot), east, south, west.
  for (const [x, y] of [[0, -near], [near, 0], [0, near], [-near, 0]] as const) {
    slots.push({ x, y });
    links.push([{ x: 0, y: 0 }, { x, y }]);
  }
  for (let s = 1; s < sectors; s++) {
    const [dx, dy] = CORNERS[(s - 1) % CORNERS.length]!;
    if (kind === "base") {
      const block = [
        { x: 2 * dx, y: 2 * dy },
        { x: 3 * dx, y: 2 * dy },
        { x: 2 * dx, y: 3 * dy },
        { x: 3 * dx, y: 3 * dy },
      ];
      slots.push(...block);
      // From the core sector's east or west pad out to the corner, then a loop round the four.
      links.push([{ x: dx, y: 0 }, { x: 2 * dx, y: 0 }, block[0]!]);
      links.push([block[0]!, block[1]!, block[3]!, block[2]!, block[0]!]);
    } else {
      const centre = Math.atan2(dy, dx);
      for (const off of [-33.75, -11.25, 11.25, 33.75]) {
        const a = centre + (off * Math.PI) / 180;
        slots.push({ x: RING * Math.cos(a), y: RING * Math.sin(a) });
      }
      links.push([{ x: 0, y: 0 }, { x: RING * Math.cos(centre), y: RING * Math.sin(centre) }]);
      arcs.push({ r: RING, from: centre - Math.PI / 4, to: centre + Math.PI / 4 });
    }
  }
  const all = slots.slice(0, slotCount);
  const min = { x: Math.min(...all.map((p) => p.x)) - 0.5, y: Math.min(...all.map((p) => p.y)) - 0.5 };
  const max = { x: Math.max(...all.map((p) => p.x)) + 0.5, y: Math.max(...all.map((p) => p.y)) + 0.5 };
  if (arcs.length > 0) {
    const reach = RING + 0.5;
    Object.assign(min, { x: Math.min(min.x, -reach), y: Math.min(min.y, -reach) });
    Object.assign(max, { x: Math.max(max.x, reach), y: Math.max(max.y, reach) });
  }
  return { slots: all, links, arcs, min, max };
}

/** The slots of a sector: the core's (0) holds the core and the next four. */
export function sectorOf(slot: number): number {
  return slot === 0 ? 0 : Math.floor((slot - 1) / 4);
}
