// Seeded random number generator (sfc32). Its state is four uint32s stored in the game
// state, so saving and loading continues the exact same random sequence (SPEC 2.3).

export type RngState = [number, number, number, number];

export function seedRng(seed: number): RngState {
  // splitmix32 spreads a single seed across the four state words.
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  const state: RngState = [next(), next(), next(), next()];
  // Warm up so similar seeds diverge quickly.
  for (let i = 0; i < 12; i++) nextUint32(state);
  return state;
}

export function nextUint32(state: RngState): number {
  let [a, b, c, d] = state;
  const t = (((a + b) >>> 0) + d) >>> 0;
  d = (d + 1) >>> 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) >>> 0;
  c = ((c << 21) | (c >>> 11)) >>> 0;
  c = (c + t) >>> 0;
  state[0] = a >>> 0;
  state[1] = b;
  state[2] = c;
  state[3] = d;
  return t;
}

/** A float in [0, 1). */
export function nextFloat(state: RngState): number {
  return nextUint32(state) / 4294967296;
}

/** An integer in [min, max], inclusive. */
export function nextInt(state: RngState, min: number, max: number): number {
  return min + Math.floor(nextFloat(state) * (max - min + 1));
}

/** An item chosen with odds proportional to its weight. */
export function weightedPick<T>(state: RngState, items: readonly T[], weight: (item: T) => number): T {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  let r = nextFloat(state) * total;
  for (const item of items) {
    r -= weight(item);
    if (r < 0) return item;
  }
  return items[items.length - 1]!;
}

export function pick<T>(state: RngState, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pick from empty list");
  return items[nextInt(state, 0, items.length - 1)]!;
}
