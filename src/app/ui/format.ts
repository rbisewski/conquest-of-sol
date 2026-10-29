// Number formatting in Terra Invicta's style: 31.2K, 1.4M, $29,991.

export function compact(n: number, digits = 1): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(digits)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(digits)}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(digits)}K`;
  return n.toFixed(abs >= 100 || Number.isInteger(n) ? 0 : digits);
}

export function signed(n: number, digits = 1): string {
  return `${n >= 0 ? "+" : ""}${compact(n, digits)}`;
}

const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/** Scientific notation with a superscript exponent: 3.37 × 10¹⁸. */
export function scientific(n: number, digits = 3): string {
  if (n === 0) return "0";
  const [mantissa, exponent] = n.toExponential(digits - 1).split("e") as [string, string];
  const power = [...String(Number(exponent))].map((c) => (c === "-" ? "⁻" : SUPERSCRIPT[Number(c)])).join("");
  return `${mantissa} × 10${power}`;
}

export function grouped(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Terra Invicta-style label for a 0–10 Government score. */
export function governmentLabel(score: number): string {
  if (score >= 9) return "Full Democracy";
  if (score >= 7) return "Democracy";
  if (score >= 5) return "Flawed Democracy";
  if (score >= 3) return "Hybrid Regime";
  if (score >= 1) return "Authoritarian";
  return "Totalitarian";
}

/** Terra Invicta's Inequality bands (wiki). */
export function inequalityLabel(score: number): string {
  if (score < 2) return "Very Low";
  if (score < 3) return "Low";
  if (score < 4) return "Moderate";
  if (score < 5) return "High";
  if (score < 6) return "Very High";
  return "Extreme";
}

/** Terra Invicta's Cohesion bands (wiki). */
export function cohesionLabel(score: number): string {
  const bands = ["Fragmented", "Fractured", "Sectarian", "Polarized", "Competitive", "Diverse", "Integrated", "Homogenous", "Dominated", "Hegemonic"];
  return score >= 10 ? "Monolithic" : bands[Math.max(0, Math.floor(score))]!;
}

/** Sustainability bands (0–10; 10 means the nation no longer pollutes). */
export function sustainabilityLabel(score: number): string {
  if (score < 4) return "Low";
  if (score < 8) return "Medium";
  if (score < 10) return "High";
  return "Very High";
}

/** Terra Invicta's Education bands (wiki). */
export function educationLabel(score: number): string {
  if (score < 5) return "Limited";
  if (score < 8) return "Developing";
  return "Advanced";
}
