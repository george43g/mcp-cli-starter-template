/**
 * Non-finite input must FAIL CLOSED, everywhere.
 *
 * These are regression pins for a defect shipped in 0.5.0 and found within the
 * hour by the eqstack session adopting it. `lineWindow`'s guard was
 * `budgetLines <= 0`, which is FALSE for NaN, so a non-TTY render environment
 * producing a NaN row count walked an entire 5,000-item list — 64MB of retained
 * React fiber in their memory test.
 *
 * The bitter detail worth keeping: their hand-rolled predecessor failed CLOSED
 * under the same input BY ACCIDENT, because `x <= NaN` is also always false, so
 * its loops never ran and it rendered one item. Extracting it into a shared
 * primitive inverted an accidental safety into a fail-open — which is a hazard
 * of lifting generally, not of this lift.
 *
 * Rule, theirs: any numeric parameter feeding a loop's break condition must be
 * validated with a POSITIVE predicate. `x <= 0` silently admits NaN.
 */

import { describe, expect, it } from "vitest";
import { lineWindow } from "./line-window.js";
import { navReduce } from "./nav-reduce.js";
import { scrollbarThumb } from "./scrollbar.js";
import { fitToWidth } from "./visual-width.js";
import { allocateWidths } from "./width-alloc.js";

const NON_FINITE = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

describe("lineWindow fails closed on non-finite input", () => {
  it("does not walk the whole list when budgetLines is NaN", () => {
    // The exact reported repro.
    const w = lineWindow({
      itemCount: 5000,
      cursor: -1,
      budgetLines: Number.NaN,
      heightOf: () => 2,
    });
    expect(w.end - w.start).toBe(1);
    expect(w.end).toBe(5000);
  });

  it("bounds the window for every non-finite budget", () => {
    for (const budget of NON_FINITE) {
      const w = lineWindow({
        itemCount: 5000,
        cursor: 100,
        budgetLines: budget,
        heightOf: () => 2,
      });
      expect(w.end - w.start, `budget=${budget}`).toBeLessThanOrEqual(1);
      expect(w.start).toBeLessThanOrEqual(100);
      expect(w.end).toBeGreaterThan(100);
    }
  });

  it("survives a heightOf that returns NaN, even with a finite budget", () => {
    // The second ingress: one poisoned height made every later break condition
    // false, so a good budget did not save you.
    const w = lineWindow({
      itemCount: 5000,
      cursor: 10,
      budgetLines: 20,
      heightOf: (i) => (i === 12 ? Number.NaN : 1),
    });
    expect(w.end - w.start).toBeLessThanOrEqual(25);
    expect(Number.isFinite(w.usedLines)).toBe(true);
  });

  it("survives a heightOf that returns NaN for EVERY item", () => {
    const w = lineWindow({
      itemCount: 5000,
      cursor: 10,
      budgetLines: 20,
      heightOf: () => Number.NaN,
    });
    expect(Number.isFinite(w.usedLines)).toBe(true);
    expect(w.start).toBeLessThanOrEqual(10);
    expect(w.end).toBeGreaterThan(10);
  });

  it("treats a non-finite cursor as follow-tail rather than producing NaN bounds", () => {
    const w = lineWindow({
      itemCount: 500,
      cursor: Number.NaN,
      budgetLines: 10,
      heightOf: () => 1,
    });
    expect(Number.isInteger(w.start)).toBe(true);
    expect(Number.isInteger(w.end)).toBe(true);
    expect(w.end).toBe(500);
  });

  it("treats a non-finite itemCount as an empty list", () => {
    expect(
      lineWindow({ itemCount: Number.NaN, cursor: 0, budgetLines: 10, heightOf: () => 1 }),
    ).toEqual({ start: 0, end: 0, usedLines: 0 });
  });

  it("ignores a non-finite aboveFraction rather than propagating it", () => {
    const w = lineWindow({
      itemCount: 500,
      cursor: 250,
      budgetLines: 10,
      heightOf: () => 1,
      aboveFraction: Number.NaN,
    });
    expect(w.end - w.start).toBe(10);
  });
});

describe("allocateWidths fails closed on non-finite input", () => {
  const cols = [
    { id: "list", min: 24, preferred: 60, priority: 10, collapse: "min" as const },
    { id: "detail", min: 30, preferred: 40, priority: 0, collapse: "drop" as const },
  ];

  it("never emits a NaN width for a non-finite total", () => {
    // It failed open the OTHER way: shedding every droppable column and then
    // handing the survivor a NaN width.
    for (const total of NON_FINITE) {
      const { widths } = allocateWidths(total, cols);
      for (const [id, w] of Object.entries(widths)) {
        expect(Number.isInteger(w), `${id} @ total=${total}`).toBe(true);
      }
    }
  });

  it("degrades a NaN total to floors-only rather than to nothing", () => {
    const { widths } = allocateWidths(Number.NaN, cols);
    expect(widths.list).toBe(24);
  });

  it("never emits a NaN width when a SPEC field is non-finite", () => {
    const { widths } = allocateWidths(200, [
      { id: "a", min: Number.NaN, preferred: 40, priority: 1 },
      { id: "b", min: 10, preferred: Number.NaN, priority: 2 },
      { id: "c", min: 10, preferred: 20, max: Number.NaN, priority: 3 },
      { id: "d", min: 10, preferred: 20, priority: Number.NaN },
    ]);
    for (const [id, w] of Object.entries(widths)) {
      expect(Number.isInteger(w), id).toBe(true);
      expect(w).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("navReduce holds position rather than teleporting", () => {
  const start = { cursor: 5, count: null, touched: false };

  it("does not jump to 0 when pageSize is non-finite", () => {
    // "cursor jumped 3,000 messages" is a real bug report shape. A movement
    // that cannot be evaluated must not look like a deliberate one.
    for (const pageSize of NON_FINITE) {
      const s = navReduce(start, { kind: "pageDown" }, { itemCount: 100, pageSize });
      expect(s.cursor, `pageSize=${pageSize}`).toBe(5);
    }
  });

  it("holds position when a remap returns NaN", () => {
    const s = navReduce(
      start,
      { kind: "itemsReplaced", remap: () => Number.NaN },
      {
        itemCount: 100,
        pageSize: 10,
      },
    );
    expect(s.cursor).toBe(5);
  });

  it("ignores a `set` to a non-finite index", () => {
    const s = navReduce(
      start,
      { kind: "set", index: Number.NaN },
      { itemCount: 100, pageSize: 10 },
    );
    expect(s.cursor).toBe(5);
  });

  it("still clamps a FINITE out-of-range index, which is a different case", () => {
    // Out of range means "nearest end"; NaN means "your arithmetic broke".
    expect(
      navReduce(start, { kind: "set", index: 9999 }, { itemCount: 100, pageSize: 10 }).cursor,
    ).toBe(99);
    expect(
      navReduce(
        start,
        { kind: "itemsReplaced", remap: () => 9999 },
        { itemCount: 20, pageSize: 10 },
      ).cursor,
    ).toBe(19);
  });
});

describe("the remaining primitives", () => {
  it("scrollbarThumb emits no NaN geometry", () => {
    for (const n of NON_FINITE) {
      const a = scrollbarThumb({ start: 0, end: 10, total: 100 }, n);
      const b = scrollbarThumb({ start: n, end: n, total: n }, 10);
      for (const t of [a, b]) {
        expect(Number.isInteger(t.thumbStart)).toBe(true);
        expect(Number.isInteger(t.thumbRows)).toBe(true);
      }
    }
  });

  it("fitToWidth returns empty for a non-finite width instead of throwing", () => {
    for (const n of NON_FINITE) {
      expect(() => fitToWidth("hello", n)).not.toThrow();
    }
  });
});
