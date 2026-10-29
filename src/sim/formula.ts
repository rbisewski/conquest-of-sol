// Pillar 2 ("show the formula behind every number"): derived values are built as a list
// of labelled terms, so the UI can show exactly how a number was reached.

export interface Term {
  label: string;
  value: number;
  /** "add" terms are summed; "mul" terms multiply the running total. */
  op: "add" | "mul";
}

export interface Breakdown {
  value: number;
  terms: Term[];
  /** Set when the final value was clamped, e.g. to a stat's allowed range. */
  clamped?: { min: number; max: number };
}

export class FormulaBuilder {
  private readonly terms: Term[] = [];
  private total = 0;

  add(label: string, value: number): this {
    this.terms.push({ label, value, op: "add" });
    this.total += value;
    return this;
  }

  mul(label: string, factor: number): this {
    this.terms.push({ label, value: factor, op: "mul" });
    this.total *= factor;
    return this;
  }

  build(clampTo?: { min: number; max: number }): Breakdown {
    if (!clampTo) return { value: this.total, terms: this.terms };
    const value = Math.min(clampTo.max, Math.max(clampTo.min, this.total));
    return value === this.total ? { value, terms: this.terms } : { value, terms: this.terms, clamped: clampTo };
  }
}

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
