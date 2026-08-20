import { describe, expect, it } from "vitest";
import { hiddenCounts, scrollbarThumb } from "./scrollbar.js";

describe("scrollbarThumb", () => {
  it("reports nothing to indicate when everything is visible", () => {
    expect(scrollbarThumb({ start: 0, end: 50, total: 50 }, 20)).toEqual({
      thumbStart: 0,
      thumbRows: 0,
    });
  });

  it("sits at the top when scrolled to the top", () => {
    expect(scrollbarThumb({ start: 0, end: 10, total: 100 }, 20).thumbStart).toBe(0);
  });

  it("reaches the bottom of the track when scrolled to the end", () => {
    const t = scrollbarThumb({ start: 90, end: 100, total: 100 }, 20);
    expect(t.thumbStart + t.thumbRows).toBe(20);
  });

  it("never renders a zero-height thumb while scrolling is possible", () => {
    // A sub-row thumb rounds to invisible, which is the same as no indicator.
    const t = scrollbarThumb({ start: 0, end: 1, total: 100_000 }, 10);
    expect(t.thumbRows).toBe(1);
  });

  it("never overflows the track", () => {
    for (let start = 0; start <= 90; start += 3) {
      const t = scrollbarThumb({ start, end: start + 10, total: 100 }, 7);
      expect(t.thumbStart).toBeGreaterThanOrEqual(0);
      expect(t.thumbStart + t.thumbRows).toBeLessThanOrEqual(7);
    }
  });

  it("degrades safely on a zero-height track or empty list", () => {
    expect(scrollbarThumb({ start: 0, end: 5, total: 100 }, 0).thumbRows).toBe(0);
    expect(scrollbarThumb({ start: 0, end: 0, total: 0 }, 10).thumbRows).toBe(0);
  });
});

describe("hiddenCounts", () => {
  it("counts what an '↑ N more' indicator needs", () => {
    expect(hiddenCounts({ start: 20, end: 30, total: 100 })).toEqual({ above: 20, below: 70 });
  });

  it("is zero on both sides when nothing is hidden", () => {
    expect(hiddenCounts({ start: 0, end: 10, total: 10 })).toEqual({ above: 0, below: 0 });
  });

  it("never reports a negative remainder when end overshoots total", () => {
    expect(hiddenCounts({ start: 0, end: 99, total: 10 }).below).toBe(0);
  });
});
