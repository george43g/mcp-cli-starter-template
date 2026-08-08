/**
 * Palette helpers.
 *
 * `brighten` is the interesting one: it used to set an ABSOLUTE lightness
 * derived from `stops` alone, ignoring the input colour. These tests are
 * written so that the old implementation fails them — a test that only
 * asserted "returns a hex string" would have passed against the bug.
 */

import { describe, expect, it } from "vitest";
import { hexToHsl } from "./color.js";
import { brighten } from "./palette.js";

const L = (hex: string) => hexToHsl(hex).l;

describe("brighten", () => {
  it("raises lightness relative to the input", () => {
    const dark = "#101010";
    const out = brighten(dark);
    expect(L(out)).toBeGreaterThan(L(dark));
    expect(L(out)).toBeCloseTo(L(dark) + 0.05, 2);
  });

  it("gives different results for different inputs", () => {
    // The old absolute formula returned the same lightness for both, which is
    // what made every hover state in a palette look identical.
    const a = brighten("#101010");
    const b = brighten("#c0c0c0");
    expect(L(a)).not.toBeCloseTo(L(b), 2);
  });

  it("never darkens a light colour", () => {
    // The old formula pinned one stop at L=0.55, so anything lighter than that
    // came back DARKER from a function called "brighten".
    const light = "#e8e8e8";
    expect(L(brighten(light))).toBeGreaterThanOrEqual(L(light));
  });

  it("scales with the number of stops", () => {
    const base = "#404040";
    expect(L(brighten(base, 3))).toBeGreaterThan(L(brighten(base, 1)));
  });

  it("clamps at 0.95 rather than running to pure white", () => {
    expect(L(brighten("#f0f0f0", 20))).toBeLessThanOrEqual(0.95);
  });

  it("preserves hue", () => {
    const blue = "#1982fc";
    expect(hexToHsl(brighten(blue)).h).toBeCloseTo(hexToHsl(blue).h, 0);
  });
});
