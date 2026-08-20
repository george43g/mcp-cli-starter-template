import { describe, expect, it } from "vitest";
import { applyRestore, type NavContext, type NavState, navReduce } from "./nav-reduce.js";

const ctx = (over: Partial<NavContext> = {}): NavContext => ({
  itemCount: 100,
  pageSize: 10,
  ...over,
});
const at = (cursor: number, over: Partial<NavState> = {}): NavState => ({
  cursor,
  count: null,
  touched: false,
  ...over,
});

describe("navReduce — movement and clamping", () => {
  it("clamps at both ends rather than wrapping", () => {
    expect(navReduce(at(0), { kind: "up" }, ctx()).cursor).toBe(0);
    expect(navReduce(at(99), { kind: "down" }, ctx()).cursor).toBe(99);
  });

  it("pages by the CALLER's pageSize, which is not derivable from itemCount", () => {
    expect(navReduce(at(50), { kind: "pageDown" }, ctx({ pageSize: 7 })).cursor).toBe(57);
    expect(navReduce(at(50), { kind: "pageUp" }, ctx({ pageSize: 7 })).cursor).toBe(43);
  });

  it("resolves the follow-tail sentinel before moving", () => {
    expect(navReduce(at(-1), { kind: "up" }, ctx()).cursor).toBe(98);
  });

  it("handles an empty list without producing a negative cursor", () => {
    expect(navReduce(at(0), { kind: "down" }, ctx({ itemCount: 0 })).cursor).toBe(0);
  });
});

describe("navReduce — count prefix", () => {
  it("accumulates digits", () => {
    let s = at(0);
    s = navReduce(s, { kind: "digit", digit: 1 }, ctx());
    s = navReduce(s, { kind: "digit", digit: 2 }, ctx());
    expect(s.count).toBe(12);
  });

  it("consumes the count as a repeat factor and resets it", () => {
    const s = navReduce(at(0, { count: 5 }), { kind: "down" }, ctx());
    expect(s.cursor).toBe(5);
    expect(s.count).toBeNull();
  });

  it("resets the count on a non-movement intent", () => {
    expect(navReduce(at(0, { count: 5 }), { kind: "set", index: 3 }, ctx()).count).toBeNull();
  });

  it("ignores an out-of-range digit rather than corrupting the count", () => {
    expect(navReduce(at(0, { count: 3 }), { kind: "digit", digit: 11 }, ctx()).count).toBe(3);
  });
});

describe("navReduce — itemsReplaced", () => {
  it("NEVER remaps the follow-tail sentinel", () => {
    // EQStack shipped the bug this prevents once: following the tail is a
    // relationship to the end of a list, not to an index.
    const remap = (): number => 42;
    const s = navReduce(at(-1), { kind: "itemsReplaced", remap }, ctx());
    expect(s.cursor).toBe(-1);
  });

  it("applies the caller's remap — the lazy-load prepend case", () => {
    const s = navReduce(at(10), { kind: "itemsReplaced", remap: (o) => o + 30 }, ctx());
    expect(s.cursor).toBe(40);
  });

  it("clamps a remap pointing into a removed region to the nearest survivor", () => {
    // The consumer's eviction maths must not have to be defensive.
    const s = navReduce(
      at(90),
      { kind: "itemsReplaced", remap: () => 9999 },
      ctx({ itemCount: 20 }),
    );
    expect(s.cursor).toBe(19);
  });

  it("does not mark the cursor touched — the user did not move it", () => {
    const s = navReduce(at(5), { kind: "itemsReplaced", remap: (o) => o }, ctx());
    expect(s.touched).toBe(false);
  });
});

describe("navReduce — groupJump", () => {
  const boundary = (from: number, dir: -1 | 1): number => from + dir * 5;

  it("no-ops when the consumer supplies no group semantics", () => {
    const before = at(10, { count: 3 });
    expect(navReduce(before, { kind: "groupJump", dir: 1 }, ctx())).toBe(before);
  });

  it("applies the caller's boundary function, repeated by the count", () => {
    const s = navReduce(
      at(10, { count: 2 }),
      { kind: "groupJump", dir: 1 },
      ctx({ groupBoundary: boundary }),
    );
    expect(s.cursor).toBe(20);
  });
});

describe("navReduce — touched", () => {
  it("is set by every cursor-moving intent", () => {
    for (const kind of ["up", "down", "pageUp", "pageDown", "top", "bottom"] as const) {
      expect(navReduce(at(5), { kind }, ctx()).touched).toBe(true);
    }
    expect(navReduce(at(5), { kind: "set", index: 1 }, ctx()).touched).toBe(true);
  });

  it("is NOT set by a digit", () => {
    expect(navReduce(at(5), { kind: "digit", digit: 4 }, ctx()).touched).toBe(false);
  });
});

describe("applyRestore", () => {
  it("snap-end lands on the newest item — the conversation-switch default", () => {
    expect(applyRestore("snap-end", at(3, { touched: true }), 50).cursor).toBe(49);
  });

  it("snap-start lands on the first", () => {
    expect(applyRestore("snap-start", at(30), 50).cursor).toBe(0);
  });

  it("restore keeps the position, clamped to the new list", () => {
    expect(applyRestore("restore", at(80), 10).cursor).toBe(9);
  });

  it("follow-until-touched follows the tail until the user moves, then stops", () => {
    expect(applyRestore("follow-until-touched", at(5, { touched: false }), 50).cursor).toBe(-1);
    expect(applyRestore("follow-until-touched", at(5, { touched: true }), 50).cursor).toBe(5);
  });
});
