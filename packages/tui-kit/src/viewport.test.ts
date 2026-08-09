import { describe, expect, it } from "vitest";
import { CHROME_ROWS, MIN_VIEWPORT, viewportRows, visibleWindow } from "./viewport.js";

describe("viewportRows", () => {
  it("subtracts the chrome from a normal terminal", () => {
    expect(viewportRows(40)).toBe(40 - CHROME_ROWS);
  });

  it("floors fractional row counts", () => {
    expect(viewportRows(40.9)).toBe(40 - CHROME_ROWS);
  });

  it("never returns less than MIN_VIEWPORT on a tiny terminal", () => {
    expect(viewportRows(CHROME_ROWS)).toBe(MIN_VIEWPORT);
    expect(viewportRows(1)).toBe(MIN_VIEWPORT);
  });

  it("falls back to a standard 24-row terminal for non-usable input", () => {
    const fallback = 24 - CHROME_ROWS;
    expect(viewportRows(Number.NaN)).toBe(fallback);
    expect(viewportRows(Number.POSITIVE_INFINITY)).toBe(fallback);
    expect(viewportRows(Number.NEGATIVE_INFINITY)).toBe(fallback);
    // stdout.rows is 0 when stdout is a pipe, not a TTY.
    expect(viewportRows(0)).toBe(fallback);
    expect(viewportRows(-10)).toBe(fallback);
  });
});

describe("visibleWindow", () => {
  const height = (w: { start: number; end: number }) => w.end - w.start;

  it("starts at the top and fills the viewport when the cursor is at 0", () => {
    const w = visibleWindow(0, 100, 10);
    expect(w).toEqual({ start: 0, end: 10 });
  });

  it("centres the cursor in the middle of a long list", () => {
    const w = visibleWindow(50, 100, 10);
    expect(w).toEqual({ start: 45, end: 55 });
    expect(height(w)).toBe(10);
  });

  it("keeps a constant height as the cursor walks the whole list", () => {
    for (let cursor = 0; cursor < 100; cursor++) {
      const w = visibleWindow(cursor, 100, 10);
      expect(height(w)).toBe(10);
      expect(w.start).toBeGreaterThanOrEqual(0);
      expect(w.end).toBeLessThanOrEqual(100);
      expect(cursor).toBeGreaterThanOrEqual(w.start);
      expect(cursor).toBeLessThan(w.end);
    }
  });

  // Regression: a shipped version clamped only the END to `total`, so near the
  // bottom the start kept advancing against a pinned end and the list shrank.
  it("does not shrink the window near the bottom (34 items, viewport 24)", () => {
    const w = visibleWindow(33, 34, 24);
    expect(height(w)).toBe(24); // the bug rendered 13
    expect(w).toEqual({ start: 10, end: 34 });
  });

  it("pins to the tail for every cursor in the bottom half", () => {
    for (let cursor = 22; cursor < 34; cursor++) {
      const w = visibleWindow(cursor, 34, 24);
      expect(height(w)).toBe(24);
      expect(w.end).toBe(34);
    }
  });

  it("shows the whole list when total is smaller than the viewport", () => {
    expect(visibleWindow(0, 3, 24)).toEqual({ start: 0, end: 3 });
    expect(visibleWindow(2, 3, 24)).toEqual({ start: 0, end: 3 });
  });

  it("returns an empty window for an empty list", () => {
    expect(visibleWindow(0, 0, 24)).toEqual({ start: 0, end: 0 });
  });

  it("tracks the cursor exactly with a viewport of 1", () => {
    expect(visibleWindow(0, 10, 1)).toEqual({ start: 0, end: 1 });
    expect(visibleWindow(7, 10, 1)).toEqual({ start: 7, end: 8 });
    expect(visibleWindow(9, 10, 1)).toEqual({ start: 9, end: 10 });
  });

  it("clamps a viewport below MIN_VIEWPORT up to one row", () => {
    expect(visibleWindow(5, 10, 0)).toEqual({ start: 5, end: 6 });
    expect(visibleWindow(5, 10, -4)).toEqual({ start: 5, end: 6 });
  });

  it("clamps a negative cursor to the top", () => {
    expect(visibleWindow(-5, 100, 10)).toEqual({ start: 0, end: 10 });
  });

  it("clamps a cursor past the end to the tail", () => {
    expect(visibleWindow(999, 100, 10)).toEqual({ start: 90, end: 100 });
  });

  it("floors fractional inputs", () => {
    expect(visibleWindow(50.9, 100.9, 10.9)).toEqual({ start: 45, end: 55 });
  });

  it("treats non-finite inputs as unknown rather than propagating NaN", () => {
    expect(visibleWindow(Number.NaN, 100, 10)).toEqual({ start: 0, end: 10 });
    expect(visibleWindow(50, 100, Number.NaN)).toEqual({ start: 50, end: 51 });
    expect(visibleWindow(50, 100, Number.POSITIVE_INFINITY)).toEqual({ start: 50, end: 51 });
    expect(visibleWindow(0, Number.NaN, 10)).toEqual({ start: 0, end: 0 });
    expect(visibleWindow(0, Number.POSITIVE_INFINITY, 10)).toEqual({ start: 0, end: 0 });
  });
});
