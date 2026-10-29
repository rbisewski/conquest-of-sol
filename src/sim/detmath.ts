// Deterministic ln, exp and pow (see the determinism rule in docs/formulas.md).
// Math.pow/exp/log may differ in the last bits between JavaScript engines; these use only
// + − × ÷ and Math.round, which IEEE 754 makes identical everywhere.

const LN2 = 0.6931471805599453;

/** Natural logarithm for x > 0. */
export function detLn(x: number): number {
  if (!(x > 0)) throw new RangeError(`detLn of non-positive value ${x}`);
  // Scale into [0.75, 1.5) by exact powers of two.
  let e = 0;
  let m = x;
  while (m >= 1.5) {
    m /= 2;
    e++;
  }
  while (m < 0.75) {
    m *= 2;
    e--;
  }
  // ln(m) = 2·atanh(t), t = (m − 1)/(m + 1), |t| < 0.2, so 20 terms is far beyond double precision.
  const t = (m - 1) / (m + 1);
  const t2 = t * t;
  let term = t;
  let sum = 0;
  for (let k = 1; k < 40; k += 2) {
    sum += term / k;
    term *= t2;
  }
  return e * LN2 + 2 * sum;
}

/** e^y. */
export function detExp(y: number): number {
  if (y > 709) return Infinity;
  if (y < -745) return 0;
  const k = Math.round(y / LN2);
  const r = y - k * LN2; // |r| ≤ ~0.35
  let term = 1;
  let sum = 1;
  for (let n = 1; n < 25; n++) {
    term = (term * r) / n;
    sum += term;
  }
  let result = sum;
  for (let i = 0; i < k; i++) result *= 2;
  for (let i = 0; i > k; i--) result /= 2;
  return result;
}

/** base^exponent for base ≥ 0. */
export function detPow(base: number, exponent: number): number {
  if (base === 0) return exponent === 0 ? 1 : 0;
  if (exponent === 0) return 1;
  return detExp(exponent * detLn(base));
}

const TWO_PI = 6.283185307179586;
const HALF_PI = 1.5707963267948966;
const PI = 3.141592653589793;

/** sin(x), by Taylor series after reducing x to [−π/2, π/2]. */
export function detSin(x: number): number {
  // Into [−π, π], then fold onto [−π/2, π/2] (sin(π − r) = sin r).
  let r = x - TWO_PI * Math.floor(x / TWO_PI + 0.5);
  if (r > HALF_PI) r = PI - r;
  else if (r < -HALF_PI) r = -PI - r;
  // |r| ≤ π/2: the 12th term is below 1e-17.
  const r2 = r * r;
  let term = r;
  let sum = r;
  for (let n = 1; n < 12; n++) {
    term = (-term * r2) / ((2 * n) * (2 * n + 1));
    sum += term;
  }
  return sum;
}

/** cos(x) = sin(x + π/2). */
export function detCos(x: number): number {
  return detSin(x + HALF_PI);
}
