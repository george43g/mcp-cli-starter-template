/**
 * Ported from the consumer this was lifted from, deliberately close to
 * verbatim: these cases are the acceptance oracle for the lift, so rewriting
 * them would discard the only evidence that the semantics survived the move.
 *
 * The two preserved semantics are pinned here — box-drawing and dingbats at
 * width 1 (NOT the UAX #11 answer), and the ellipsis counted against the
 * budget.
 */

import { describe, expect, it } from "vitest";
import { clusterWidth, fitToWidth, truncateToWidth, visualWidth } from "./visual-width.js";

describe("clusterWidth", () => {
  it("is 1 for ASCII letters and digits", () => {
    for (const c of "abcXYZ012!?-") {
      expect(clusterWidth(c)).toBe(1);
    }
  });

  it("is 2 for common emoji", () => {
    for (const c of ["🎉", "😀", "👍", "💬", "📱", "🔥"]) {
      expect(clusterWidth(c)).toBe(2);
    }
  });

  it("is 2 for CJK ideographs and fullwidth", () => {
    expect(clusterWidth("中")).toBe(2);
    expect(clusterWidth("문")).toBe(2);
    expect(clusterWidth("Ａ")).toBe(2); // fullwidth A
  });

  it("is 1 for box-drawing and dingbats, against UAX #11", () => {
    // Deliberate: UAX #11 calls 0x2600..0x27BF ambiguous, but monospaced
    // terminals paint these single-cell. Following the standard here would
    // misalign every layout that draws with them.
    for (const c of ["─", "│", "┌", "└", "▶", "◀", "●", "✉"]) {
      expect(clusterWidth(c)).toBe(1);
    }
  });

  it("does not throw on a lone surrogate", () => {
    // Render path over arbitrary content: best-effort, never throws.
    expect(() => clusterWidth("\ud83c")).not.toThrow();
  });
});

describe("visualWidth", () => {
  it("matches code-point count for ASCII", () => {
    expect(visualWidth("hello")).toBe(5);
    expect(visualWidth("Birthday Party!")).toBe(15);
  });

  it("counts each emoji as 2 cells", () => {
    expect(visualWidth("🎉")).toBe(2);
    expect(visualWidth("🎉🎉🎉")).toBe(6);
    expect(visualWidth("🎉Hi")).toBe(4);
  });

  it("handles empty string", () => {
    expect(visualWidth("")).toBe(0);
  });

  it("counts a ZWJ sequence as one cluster", () => {
    // Family emoji: multiple code points joined by ZWJ, one grapheme.
    expect(visualWidth("👨‍👩‍👧")).toBe(2);
  });
});

describe("truncateToWidth", () => {
  it("returns the input unchanged when it already fits", () => {
    expect(truncateToWidth("hello", 10)).toBe("hello");
    expect(truncateToWidth("🎉", 2)).toBe("🎉");
  });

  it("appends an ellipsis when truncating ASCII", () => {
    expect(truncateToWidth("Birthday Party", 8)).toBe("Birthda…");
  });

  it("never splits a surrogate pair (the bug this exists to fix)", () => {
    const input = "🎉🎉🎉🎉🎉 Family";
    // Width is 5*2 + 1 + 6 = 17. Budget 6 should give "🎉🎉…" not "🎉🎉<half>…".
    const out = truncateToWidth(input, 6);
    expect(out).toBe("🎉🎉…");
    // Sanity: result is valid UTF-16 with no lone surrogates.
    for (let i = 0; i < out.length; i++) {
      const code = out.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = out.charCodeAt(i + 1);
        expect(next >= 0xdc00 && next <= 0xdfff).toBe(true);
        i++; // skip low surrogate
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        throw new Error(`Lone low surrogate at index ${i}`);
      }
    }
  });

  it("accounts for emoji width in the budget (truncate point shifts)", () => {
    // 2 (emoji) + 2 (text) + 1 (ellipsis) = 5 cells.
    expect(truncateToWidth("🎉Hello", 5)).toBe("🎉He…");
  });

  it("returns '' for non-positive budgets", () => {
    expect(truncateToWidth("anything", 0)).toBe("");
    expect(truncateToWidth("anything", -3)).toBe("");
  });

  it("never produces a result wider than the budget", () => {
    // The contract that matters: the ellipsis counts AGAINST maxCols. If it
    // were appended after, every truncated row would overflow by one column.
    const cases = [
      ["Birthday Party!", 10],
      ["🎉🎉🎉🎉", 5],
      ["🎉Hi", 3],
      ["a🎉b🎉c", 4],
      ["中文测试", 5],
    ] as const;
    for (const [input, budget] of cases) {
      const out = truncateToWidth(input, budget);
      expect(visualWidth(out), `${input} @ ${budget}`).toBeLessThanOrEqual(budget);
    }
  });

  it("fits as much as possible when the ellipsis will not fit at all", () => {
    // maxCols == 1 takes the fallback path (the ellipsis is itself 1 cell).
    expect(truncateToWidth("hello", 1)).toBe("h");
    expect(truncateToWidth("🎉Hi", 1)).toBe(""); // 2-cell emoji does not fit
  });

  it("with budget == cluster width, drops the cluster to fit the ellipsis", () => {
    // maxCols=2, ellipsisW=1: 🎉 (2) + … (1) = 3 > 2 -> just "…".
    expect(truncateToWidth("🎉Hi", 2)).toBe("…");
    // maxCols=3 leaves room for 🎉 (2) + … (1).
    expect(truncateToWidth("🎉Hi", 3)).toBe("🎉…");
  });

  it("honours a custom multi-cell ellipsis", () => {
    expect(visualWidth(truncateToWidth("Birthday Party", 8, "..."))).toBeLessThanOrEqual(8);
  });
});

describe("fitToWidth", () => {
  const cases = [
    "hello",
    "",
    "a much longer string than the budget allows",
    "日本語のテキスト",
    "emoji 👨‍👩‍👧‍👦 family",
    "🇦🇺🇦🇺🇦🇺",
    "mixed 日本 and 😀 and ascii",
  ];

  it("ALWAYS returns exactly the requested width", () => {
    // The ink wrap law: overflow="hidden" clips boxes, not the extra lines that
    // Text wrapping manufactures, so one over-wide row corrupts the frame.
    for (const s of cases) {
      for (let n = 1; n <= 24; n += 1) {
        expect(visualWidth(fitToWidth(s, n)), `${JSON.stringify(s)} @ ${n}`).toBe(n);
      }
    }
  });

  it("returns empty for a non-positive width", () => {
    expect(fitToWidth("anything", 0)).toBe("");
    expect(fitToWidth("anything", -5)).toBe("");
  });

  it("pads a short string on the right", () => {
    expect(fitToWidth("ab", 5)).toBe("ab   ");
  });

  it("truncates before padding, so the result is never wider", () => {
    expect(visualWidth(fitToWidth("abcdefghij", 4))).toBe(4);
  });

  it("upholds the invariant that makes truncate-then-pad safe", () => {
    // visualWidth(truncateToWidth(s, n)) <= n — if this ever fails, the pad's
    // repeat count goes negative and fitToWidth throws.
    for (const s of cases) {
      for (let n = 1; n <= 24; n += 1) {
        expect(visualWidth(truncateToWidth(s, n))).toBeLessThanOrEqual(n);
      }
    }
  });
});
