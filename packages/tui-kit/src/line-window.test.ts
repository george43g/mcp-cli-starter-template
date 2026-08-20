import { describe, expect, it, vi } from "vitest";
import { chooseAnchor, lineWindow } from "./line-window.js";

/** Uniform heights — the browser-tab case, one line per row. */
const flat = () => 1;
/** Heterogeneous heights — the imsg case, message bubbles of different depths. */
const varied = (h: number[]) => (i: number) => h[i] ?? 1;

describe("lineWindow", () => {
  it("fills the budget by LINES, not by item count", () => {
    // 4 items of height 3 = 12 lines. A row-count window would show 6.
    const w = lineWindow({ itemCount: 20, cursor: 10, budgetLines: 12, heightOf: () => 3 });
    expect(w.end - w.start).toBe(4);
    expect(w.usedLines).toBeLessThanOrEqual(12);
  });

  it("keeps the cursor inside even when ONE item is taller than the whole budget", () => {
    // Invariant 3. A window that returns empty here clips the only thing on screen.
    const w = lineWindow({
      itemCount: 5,
      cursor: 2,
      budgetLines: 4,
      heightOf: varied([1, 1, 99, 1, 1]),
    });
    expect(w.start).toBeLessThanOrEqual(2);
    expect(w.end).toBeGreaterThan(2);
    expect(w.usedLines).toBeGreaterThan(4); // documented: may exceed the budget
  });

  it("treats cursor -1 as end-anchored, ignoring an explicit cursor anchor", () => {
    // Invariant 4: the sentinel and the anchor unify.
    const w = lineWindow({
      itemCount: 100,
      cursor: -1,
      budgetLines: 5,
      heightOf: flat,
      anchor: "cursor",
    });
    expect(w.end).toBe(100);
    expect(w.start).toBe(95);
  });

  it("end-anchored windows still contain a cursor sitting above them", () => {
    // The whole point of the anchor is that the cursor need not be at the tail.
    const w = lineWindow({
      itemCount: 50,
      cursor: 40,
      budgetLines: 5,
      heightOf: flat,
      anchor: "end",
    });
    expect(w.end).toBe(50);
    expect(w.start).toBeLessThanOrEqual(40);
  });

  it("admits one over-tall TAIL item rather than returning nothing", () => {
    const w = lineWindow({
      itemCount: 3,
      cursor: -1,
      budgetLines: 2,
      heightOf: varied([1, 1, 40]),
    });
    expect(w.start).toBe(2);
    expect(w.end).toBe(3);
  });

  it("spends roughly aboveFraction of the budget above the cursor", () => {
    const w = lineWindow({
      itemCount: 100,
      cursor: 50,
      budgetLines: 10,
      heightOf: flat,
      aboveFraction: 0.4,
    });
    expect(50 - w.start).toBe(4);
    expect(w.end - w.start).toBe(10);
  });

  it("backfills upward when the downward pass runs out of items", () => {
    // Cursor near the tail with a cursor anchor: below is short, so the
    // remaining budget must go up rather than be wasted.
    const w = lineWindow({ itemCount: 12, cursor: 11, budgetLines: 6, heightOf: flat });
    expect(w.end).toBe(12);
    expect(w.end - w.start).toBe(6);
  });

  it("memoises heightOf within a single call", () => {
    // The walk revisits indices (up, down, backfill up). Consumers should not
    // need useCallback gymnastics to make an expensive estimator affordable.
    const spy = vi.fn(() => 1);
    lineWindow({ itemCount: 40, cursor: 20, budgetLines: 20, heightOf: spy });
    const distinct = new Set(spy.mock.calls.map((c) => c[0]));
    expect(spy).toHaveBeenCalledTimes(distinct.size);
  });

  it("returns the cursor's row when the budget is non-positive (resize transient)", () => {
    const w = lineWindow({ itemCount: 10, cursor: 4, budgetLines: 0, heightOf: flat });
    expect(w).toEqual({ start: 4, end: 5, usedLines: 1 });
  });

  it("returns an empty window for an empty list", () => {
    expect(lineWindow({ itemCount: 0, cursor: -1, budgetLines: 10, heightOf: flat })).toEqual({
      start: 0,
      end: 0,
      usedLines: 0,
    });
  });

  it("never returns a window excluding the cursor, across a fuzz of heights", () => {
    // The invariant that matters most, asserted the only honest way.
    // Deterministic LCG: a failure is reproducible from the seed alone.
    let seed = 7;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let trial = 0; trial < 300; trial += 1) {
      const itemCount = 1 + Math.floor(rnd() * 40);
      const heights = Array.from({ length: itemCount }, () => 1 + Math.floor(rnd() * 8));
      const cursor = Math.floor(rnd() * itemCount);
      const w = lineWindow({
        itemCount,
        cursor,
        budgetLines: 1 + Math.floor(rnd() * 30),
        heightOf: varied(heights),
        anchor: rnd() > 0.5 ? "end" : "cursor",
      });
      expect(w.start).toBeLessThanOrEqual(cursor);
      expect(w.end).toBeGreaterThan(cursor);
      expect(w.start).toBeGreaterThanOrEqual(0);
      expect(w.end).toBeLessThanOrEqual(itemCount);
    }
  });
});

describe("chooseAnchor", () => {
  it("end-anchors the follow-tail sentinel", () => {
    expect(chooseAnchor(-1, 100)).toBe("end");
  });

  it("end-anchors within nearEnd of the tail", () => {
    expect(chooseAnchor(98, 100)).toBe("end");
    expect(chooseAnchor(99, 100)).toBe("end");
  });

  it("cursor-anchors away from the tail", () => {
    expect(chooseAnchor(50, 100)).toBe("cursor");
    expect(chooseAnchor(97, 100)).toBe("cursor");
  });

  it("end-anchors an empty list", () => {
    expect(chooseAnchor(0, 0)).toBe("end");
  });
});
