// Sea routes for navies on the Globe View. The region id map (0 = sea) is halved into a grid
// of sea cells, grouped into connected bodies of water. A route goes overland from the region
// centre to the nearest coast of a body of water both ends touch, sails along it (A* over its
// cells, then pulled taut wherever a straight line stays on the water) and lands at the coast
// nearest the destination. Straits and canals narrower than a cell are carved in (PASSAGES),
// and ships keep out of the polar ice where they can.

import type { LatLon } from "./Globe";

/** The region id map: R + G·256 = region index + 1, 0 = sea. */
export interface IdMap {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface SeaMap {
  width: number;
  height: number;
  /** Body of water per cell, from 1; 0 = land. */
  component: Int32Array;
  /** Cells in each body of water, by its id. */
  sizes: number[];
}

/** A sea route: points[embark] to points[disembark] are on the water, the rest overland. */
export interface SeaRoute {
  points: LatLon[];
  embark: number;
  disembark: number;
}

/** Lakes smaller than this (in cells) aren't sailed. */
const MIN_SEA = 50;
/** How far from a region centre, in cells, to look for the coast. */
const COAST_SEARCH = 48;

/** Straits and canals too narrow for the grid, as [lat, lon] lines from open water to open water. */
const PASSAGES: [number, number][][] = [
  // Strait of Gibraltar
  [[36.0, -6.6], [35.95, -5.6], [36.1, -4.6]],
  // Dardanelles, Sea of Marmara and Bosphorus
  [[39.9, 25.9], [40.1, 26.3], [40.45, 26.75], [40.7, 27.6], [40.85, 28.9], [41.05, 29.05], [41.35, 29.2]],
  // Kerch Strait
  [[44.9, 36.3], [45.3, 36.55], [45.6, 36.7]],
  // Øresund
  [[56.7, 11.6], [56.0, 12.6], [55.5, 12.8], [55.1, 13.2]],
  // Suez Canal and the Gulf of Suez
  [[31.6, 32.3], [31.2, 32.35], [30.4, 32.35], [29.9, 32.55], [29.0, 32.9], [27.8, 33.7]],
  // Panama Canal
  [[9.6, -79.9], [9.2, -79.85], [9.0, -79.6], [8.8, -79.5], [8.4, -79.4]],
];
/** Beyond this latitude sailing costs ICE_COST times as much, so routes keep south of the Arctic ice. */
const ICE_LAT = 66;
const ICE_COST = 4;

/** Builds the sea grid: a cell is sea if any id-map texel in it is, so narrow straits stay open. */
export function buildSeaMap(idMap: IdMap, factor = 2): SeaMap {
  const width = Math.floor(idMap.width / factor);
  const height = Math.floor(idMap.height / factor);
  const component = new Int32Array(width * height);
  const sea = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let k = 0; k < factor * factor && !sea[y * width + x]; k++) {
        const o = ((y * factor + Math.floor(k / factor)) * idMap.width + x * factor + (k % factor)) * 4;
        if (idMap.data[o] === 0 && idMap.data[o + 1] === 0) sea[y * width + x] = 1;
      }
    }
  }
  for (const line of PASSAGES) {
    for (let i = 1; i < line.length; i++) {
      const [lat0, lon0] = line[i - 1]!;
      const [lat1, lon1] = line[i]!;
      const x0 = ((lon0 + 180) / 360) * width;
      const y0 = ((90 - lat0) / 180) * height;
      const x1 = ((lon1 + 180) / 360) * width;
      const y1 = ((90 - lat1) / 180) * height;
      const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 4);
      for (let k = 0; k <= steps; k++) sea[Math.floor(y0 + ((y1 - y0) * k) / steps) * width + Math.floor(x0 + ((x1 - x0) * k) / steps)] = 1;
    }
  }
  const sizes = [0];
  const stack = new Int32Array(width * height);
  for (let start = 0; start < sea.length; start++) {
    if (!sea[start] || component[start]) continue;
    const id = sizes.length;
    let size = 0;
    let top = 0;
    stack[top++] = start;
    component[start] = id;
    while (top > 0) {
      const i = stack[--top]!;
      size++;
      const x = i % width;
      const y = (i - x) / width;
      for (const [dx, dy] of NEIGHBOURS) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        const n = ny * width + ((x + dx + width) % width);
        if (sea[n] && !component[n]) {
          component[n] = id;
          stack[top++] = n;
        }
      }
    }
    sizes.push(size);
  }
  return { width, height, component, sizes };
}

const NEIGHBOURS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

const latOf = (map: SeaMap, y: number) => 90 - ((y + 0.5) * 180) / map.height;
const lonOf = (map: SeaMap, x: number) => -180 + ((x + 0.5) * 360) / map.width;

function cellOf(map: SeaMap, p: LatLon): [number, number] {
  const x = Math.floor(((p.lon + 180) / 360) * map.width);
  const y = Math.floor(((90 - p.lat) / 180) * map.height);
  return [((x % map.width) + map.width) % map.width, Math.min(map.height - 1, Math.max(0, y))];
}

/** The nearest cell of each body of water within reach of a point, with its distance in cells. */
function coasts(map: SeaMap, p: LatLon): Map<number, { cell: number; distance: number }> {
  const out = new Map<number, { cell: number; distance: number }>();
  const [cx, cy] = cellOf(map, p);
  for (let dy = -COAST_SEARCH; dy <= COAST_SEARCH; dy++) {
    const y = cy + dy;
    if (y < 0 || y >= map.height) continue;
    const squeeze = Math.cos((latOf(map, y) * Math.PI) / 180);
    for (let dx = -COAST_SEARCH; dx <= COAST_SEARCH; dx++) {
      const cell = y * map.width + ((cx + dx + map.width) % map.width);
      const id = map.component[cell]!;
      if (!id || map.sizes[id]! < MIN_SEA) continue;
      const distance = Math.hypot(dx * squeeze, dy);
      const best = out.get(id);
      if (!best || distance < best.distance) out.set(id, { cell, distance });
    }
  }
  return out;
}

/** A sea route between two points on land, or null if no body of water joins them. */
export function seaRoute(map: SeaMap, from: LatLon, to: LatLon): SeaRoute | null {
  const a = coasts(map, from);
  const b = coasts(map, to);
  let best: { start: number; goal: number; distance: number } | null = null;
  for (const [id, x] of a) {
    const y = b.get(id);
    if (y && (!best || x.distance + y.distance < best.distance)) best = { start: x.cell, goal: y.cell, distance: x.distance + y.distance };
  }
  if (!best) return null;
  const path = search(map, best.start, best.goal);
  if (!path) return null;
  const water = taut(map, path).map((i) => ({ lat: latOf(map, Math.floor(i / map.width)), lon: lonOf(map, i % map.width) }));
  return { points: [from, ...water, to], embark: 1, disembark: water.length };
}

/** A* over one body of water, from cell to cell. */
function search(map: SeaMap, start: number, goal: number): number[] | null {
  const { width, height, component } = map;
  const body = component[start]!;
  const rowCos = Float32Array.from({ length: height }, (_, y) => Math.max(0.01, Math.cos((latOf(map, y) * Math.PI) / 180)));
  const rowIce = Float32Array.from({ length: height }, (_, y) => (Math.abs(latOf(map, y)) > ICE_LAT ? ICE_COST : 1));
  const goalLat = (latOf(map, Math.floor(goal / width)) * Math.PI) / 180;
  const goalLon = (lonOf(map, goal % width) * Math.PI) / 180;
  // Great-circle distance to the goal, in cell heights.
  const cellAngle = Math.PI / height;
  const heuristic = (i: number) => {
    const lat = (latOf(map, Math.floor(i / width)) * Math.PI) / 180;
    const lon = (lonOf(map, i % width) * Math.PI) / 180;
    const h = Math.sin((goalLat - lat) / 2) ** 2 + Math.cos(lat) * Math.cos(goalLat) * Math.sin((goalLon - lon) / 2) ** 2;
    return (2 * Math.asin(Math.min(1, Math.sqrt(h)))) / cellAngle;
  };
  const cost = new Float32Array(width * height).fill(Infinity);
  const parent = new Int32Array(width * height).fill(-1);
  const closed = new Uint8Array(width * height);
  const heap = new Heap();
  cost[start] = 0;
  heap.push(heuristic(start), start);
  while (heap.size > 0) {
    const i = heap.pop();
    if (closed[i]) continue;
    if (i === goal) {
      const path = [i];
      while (path[path.length - 1] !== start) path.push(parent[path[path.length - 1]!]!);
      return path.reverse();
    }
    closed[i] = 1;
    const x = i % width;
    const y = (i - x) / width;
    for (const [dx, dy] of NEIGHBOURS) {
      const ny = y + dy;
      if (ny < 0 || ny >= height) continue;
      const nx = (x + dx + width) % width;
      const n = ny * width + nx;
      if (component[n] !== body || closed[n]) continue;
      const next = cost[i]! + Math.hypot((dx * (rowCos[y]! + rowCos[ny]!)) / 2, dy) * rowIce[ny]!;
      if (next >= cost[n]!) continue;
      cost[n] = next;
      parent[n] = i;
      heap.push(next + heuristic(n), n);
    }
  }
  return null;
}

/** Drops the cells of a path that a straight line over the water can skip. */
function taut(map: SeaMap, path: number[]): number[] {
  const out = [path[0]!];
  let anchor = 0;
  while (anchor < path.length - 1) {
    let j = anchor + 1;
    while (j + 1 < path.length && clear(map, path[anchor]!, path[j + 1]!)) j++;
    out.push(path[j]!);
    anchor = j;
  }
  return out;
}

/** Whether the straight line between two cells (in map space, across the date line if shorter) stays on their water. */
function clear(map: SeaMap, a: number, b: number): boolean {
  const { width, component } = map;
  const ax = a % width;
  const ay = Math.floor(a / width);
  let dx = (b % width) - ax;
  const dy = Math.floor(b / width) - ay;
  if (dx > width / 2) dx -= width;
  if (dx < -width / 2) dx += width;
  const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 2);
  for (let k = 1; k < steps; k++) {
    const x = (((Math.round(ax + (dx * k) / steps)) % width) + width) % width;
    const y = Math.round(ay + (dy * k) / steps);
    if (component[y * width + x] !== component[a]) return false;
  }
  return true;
}

/** A binary min-heap of cells by priority. */
class Heap {
  private readonly keys: number[] = [];
  private readonly items: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(key: number, item: number): void {
    let i = this.items.length;
    this.keys.push(key);
    this.items.push(item);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (this.keys[up]! <= key) break;
      this.keys[i] = this.keys[up]!;
      this.items[i] = this.items[up]!;
      i = up;
    }
    this.keys[i] = key;
    this.items[i] = item;
  }

  pop(): number {
    const top = this.items[0]!;
    const key = this.keys.pop()!;
    const item = this.items.pop()!;
    const n = this.items.length;
    if (n === 0) return top;
    let i = 0;
    for (;;) {
      let child = 2 * i + 1;
      if (child >= n) break;
      if (child + 1 < n && this.keys[child + 1]! < this.keys[child]!) child++;
      if (this.keys[child]! >= key) break;
      this.keys[i] = this.keys[child]!;
      this.items[i] = this.items[child]!;
      i = child;
    }
    this.keys[i] = key;
    this.items[i] = item;
    return top;
  }
}
