import { describe, expect, it } from "vitest";
import { allocateWidths, type ColumnSpec } from "./width-alloc.js";

/** browser-tab's shape: a list that must survive, a detail pane that may not. */
const browserTab: ColumnSpec[] = [
  { id: "list", min: 24, preferred: 60, priority: 10, collapse: "min" },
  { id: "detail", min: 30, preferred: 40, priority: 0, collapse: "drop" },
];

/** EQStack's shape: ancestors carry orientation, so they breadcrumb. */
const imsg: ColumnSpec[] = [
  { id: "sidebar", min: 28, preferred: 32, priority: 5, collapse: "breadcrumb", collapsedWidth: 6 },
  { id: "thread", min: 20, preferred: 80, priority: 10, collapse: "min" },
  { id: "drawer", min: 30, preferred: 50, max: 60, priority: 0, collapse: "drop" },
];

describe("allocateWidths — the happy case", () => {
  it("gives everyone their preferred width when there is room", () => {
    const { widths, collapsed } = allocateWidths(200, browserTab);
    expect(widths.list).toBeGreaterThanOrEqual(60);
    expect(widths.detail).toBeGreaterThanOrEqual(40);
    expect(collapsed).toEqual([]);
  });

  it("gives the remainder to the HIGHEST-priority column not yet at max", () => {
    const cols: ColumnSpec[] = [
      { id: "low", min: 5, preferred: 10, max: 10, priority: 0 },
      { id: "high", min: 5, preferred: 10, priority: 9 },
    ];
    const { widths } = allocateWidths(100, cols);
    expect(widths.low).toBe(10);
    expect(widths.high).toBe(90);
  });

  it("never exceeds max", () => {
    const { widths } = allocateWidths(500, imsg);
    expect(widths.drawer).toBeLessThanOrEqual(60);
  });

  it("is deterministic and integral", () => {
    const a = allocateWidths(137, imsg);
    const b = allocateWidths(137, imsg);
    expect(a).toEqual(b);
    for (const w of Object.values(a.widths)) expect(Number.isInteger(w)).toBe(true);
  });
});

describe("allocateWidths — degradation", () => {
  it("DROPS an elaboration column before touching the list", () => {
    // browser-tab: "the list row IS the crumb, so its degraded form is absence".
    const { widths, collapsed } = allocateWidths(40, browserTab);
    expect(collapsed).toEqual(["detail"]);
    expect(widths.detail).toBeUndefined();
    expect(widths.list).toBe(40);
  });

  it("BREADCRUMBS a context column instead of dropping it", () => {
    // EQStack: ancestors say which mailbox and thread you are in — losing them
    // loses your place, so they must stay visible.
    // 40 cols: dropping the drawer leaves floors at 28+20=48, still over, so
    // the sidebar must yield too — and being CONTEXT, it yields to a breadcrumb
    // rather than vanishing.
    const { widths, collapsed } = allocateWidths(40, imsg);
    expect(collapsed).toContain("drawer");
    expect(collapsed).toContain("sidebar");
    expect(widths.sidebar).toBe(6);
    expect(widths.thread).toBeGreaterThanOrEqual(20);
  });

  it("sacrifices in ascending priority order", () => {
    const { collapsed } = allocateWidths(40, imsg);
    expect(collapsed.indexOf("drawer")).toBeLessThan(collapsed.indexOf("sidebar"));
  });

  it('never drops a column declared collapse:"min", even when over budget', () => {
    // The caller said this column must exist. Honouring that and letting the
    // renderer clip is more honest than silently removing it.
    const { widths } = allocateWidths(5, browserTab);
    expect(widths.list).toBeDefined();
    expect(widths.list).toBe(24);
  });

  it("stops sacrificing as soon as the floors fit", () => {
    // browserTab floors are 24+30=54, so 60 needs no sacrifice at all.
    expect(allocateWidths(60, browserTab).collapsed).toEqual([]);
    // And imsg at 60: dropping the drawer is enough (28+20=48), so the sidebar
    // keeps its full width rather than breadcrumbing unnecessarily.
    const imsgAt60 = allocateWidths(60, imsg);
    expect(imsgAt60.collapsed).toEqual(["drawer"]);
    expect(imsgAt60.widths.sidebar).toBeGreaterThanOrEqual(28);
  });

  it("handles a zero-width terminal without producing negatives", () => {
    const { widths } = allocateWidths(0, browserTab);
    for (const w of Object.values(widths)) expect(w).toBeGreaterThanOrEqual(0);
  });

  it("never allocates more in total than the budget once anything fits", () => {
    for (let total = 60; total <= 240; total += 7) {
      const { widths } = allocateWidths(total, imsg);
      const sum = Object.values(widths).reduce((n, w) => n + w, 0);
      expect(sum).toBeLessThanOrEqual(total);
    }
  });
});
