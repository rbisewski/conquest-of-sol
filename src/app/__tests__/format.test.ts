import { describe, expect, it } from "vitest";
import { scientific } from "../ui/format";

describe("scientific", () => {
  it("writes a superscript power of ten", () => {
    expect(scientific(3.3734e18)).toBe("3.37 × 10¹⁸");
    expect(scientific(1.0638e16)).toBe("1.06 × 10¹⁶");
    expect(scientific(4.2e-5)).toBe("4.20 × 10⁻⁵");
    expect(scientific(0)).toBe("0");
  });
});
