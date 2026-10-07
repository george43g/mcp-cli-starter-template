import { describe, expect, it } from "vitest";
import {
  canonicalKeys,
  type DisplayStyle,
  formatKeys,
  isCharKey,
  KeySpecError,
  NAMED_KEYS,
  normalizeInput,
  parseKeys,
  parseStep,
  stepId,
} from "./notation.js";

describe("parseStep", () => {
  it("parses a bare character, case-sensitively", () => {
    expect(parseStep("g")).toEqual({ key: "g" });
    expect(parseStep("G")).toEqual({ key: "G" });
    expect(parseStep("?")).toEqual({ key: "?" });
  });

  it("parses modifiers in any order and case, emitting canonical flags", () => {
    expect(parseStep("ctrl+d")).toEqual({ key: "d", ctrl: true });
    expect(parseStep("Alt+Ctrl+x")).toEqual({ key: "x", ctrl: true, alt: true });
    expect(parseStep("meta+k")).toEqual({ key: "k", meta: true });
    expect(parseStep("shift+tab")).toEqual({ key: "tab", shift: true });
  });

  it("lowercases named keys", () => {
    expect(parseStep("PageDown")).toEqual({ key: "pagedown" });
    expect(parseStep("ctrl+Space")).toEqual({ key: "space", ctrl: true });
  });

  it("accepts every named key", () => {
    for (const name of NAMED_KEYS) expect(parseStep(name)).toEqual({ key: name });
  });

  it("treats a trailing + as the plus key", () => {
    expect(parseStep("+")).toEqual({ key: "+" });
    expect(parseStep("ctrl++")).toEqual({ key: "+", ctrl: true });
  });

  it("accepts a non-BMP character as one key", () => {
    expect(parseStep("😀")).toEqual({ key: "😀" });
  });

  it.each([
    ["", /empty key step/],
    ["$mod+k", /"\$mod"-style/],
    ["KeyD", /physical key codes/],
    ["Digit1", /physical key codes/],
    ["F5", /physical key codes/],
    ["ctrl+KeyD", /physical key codes/],
    ["f5", /unknown key "f5"/],
    ["hyper+k", /unknown key "hyper\+k"/],
    ["shift+g", /shift\+<character> is ambiguous/],
    ["ctrl+ctrl+d", /given twice/],
  ])("rejects %j", (spec, message) => {
    expect(() => parseStep(spec)).toThrow(KeySpecError);
    expect(() => parseStep(spec)).toThrow(message);
  });
});

describe("parseKeys", () => {
  it("splits a sequence on spaces", () => {
    expect(parseKeys("g g")).toEqual([{ key: "g" }, { key: "g" }]);
    expect(parseKeys("  ctrl+w   j ")).toEqual([{ key: "w", ctrl: true }, { key: "j" }]);
  });

  it("rejects an empty or non-string spec", () => {
    expect(() => parseKeys("")).toThrow(/empty key spec/);
    expect(() => parseKeys("   ")).toThrow(/empty key spec/);
    expect(() => parseKeys(undefined as unknown as string)).toThrow(/empty key spec/);
  });
});

describe("canonicalKeys / stepId", () => {
  it("orders modifiers ctrl, alt, meta, shift", () => {
    expect(canonicalKeys("shift+meta+alt+ctrl+up")).toBe("ctrl+alt+meta+shift+up");
    expect(stepId({ key: "d", ctrl: true })).toBe("ctrl+d");
  });

  it("canonicalises steps given directly", () => {
    expect(canonicalKeys([{ key: "g" }, { key: "g" }])).toBe("g g");
  });
});

describe("normalizeInput", () => {
  it("drops shift on characters but keeps it on named keys", () => {
    expect(normalizeInput({ key: "G", shift: true })).toEqual({ key: "G" });
    expect(normalizeInput({ key: "Tab", shift: true })).toEqual({ key: "tab", shift: true });
  });

  it("keeps the other modifiers and drops false flags", () => {
    expect(normalizeInput({ key: "d", ctrl: true, alt: false, meta: true })).toEqual({
      key: "d",
      ctrl: true,
      meta: true,
    });
    expect(normalizeInput({ key: "x", alt: true })).toEqual({ key: "x", alt: true });
  });
});

describe("isCharKey", () => {
  it("is true for one code point only", () => {
    expect(isCharKey("a")).toBe(true);
    expect(isCharKey("😀")).toBe(true);
    expect(isCharKey("")).toBe(false);
    expect(isCharKey("up")).toBe(false);
  });
});

describe("formatKeys", () => {
  const table: [string, string, string, string][] = [
    // spec, vim, plain, symbols
    ["g g", "gg", "g g", "g g"],
    ["G", "G", "G", "G"],
    ["ctrl+d", "<C-d>", "ctrl+d", "⌃D"],
    ["ctrl+D", "<C-D>", "ctrl+D", "⌃⇧D"],
    ["alt+x", "<M-x>", "alt+x", "⌥X"],
    ["meta+k", "<D-k>", "meta+k", "⌘K"],
    ["down", "<Down>", "down", "↓"],
    ["shift+tab", "<S-Tab>", "shift+tab", "⇧⇥"],
    ["ctrl+alt+meta+shift+up", "<C-M-D-S-Up>", "ctrl+alt+meta+shift+up", "⌃⌥⇧⌘↑"],
    ["enter", "<CR>", "enter", "↩"],
    ["escape", "<Esc>", "escape", "⎋"],
    ["space", "<Space>", "space", "␣"],
    ["backspace", "<BS>", "backspace", "⌫"],
    ["delete", "<Del>", "delete", "⌦"],
    ["pageup pagedown", "<PageUp><PageDown>", "pageup pagedown", "⇞ ⇟"],
    ["home end left right", "<Home><End><Left><Right>", "home end left right", "↖ ↘ ← →"],
    ["tab", "<Tab>", "tab", "⇥"],
    ["<", "<lt>", "<", "<"],
    ["ctrl+<", "<C-lt>", "ctrl+<", "⌃<"],
    ["ctrl+w j", "<C-w>j", "ctrl+w j", "⌃W j"],
  ];

  it.each(table)("%j renders as vim %j, plain %j, symbols %j", (spec, vim, plain, symbols) => {
    expect(formatKeys(spec, "vim")).toBe(vim);
    expect(formatKeys(spec, "plain")).toBe(plain);
    expect(formatKeys(spec, "symbols")).toBe(symbols);
  });

  it("defaults to the vim style", () => {
    expect(formatKeys("ctrl+u")).toBe("<C-u>");
  });

  it("round-trips: plain output parses back to the same steps", () => {
    for (const [spec] of table) {
      const plain = formatKeys(spec, "plain");
      expect(parseKeys(plain)).toEqual(parseKeys(spec));
      expect(formatKeys(parseKeys(plain), "plain")).toBe(plain);
    }
  });

  it("rejects an unknown style", () => {
    expect(() => formatKeys("g", "emacs" as DisplayStyle)).toThrow(/unknown display style/);
  });
});
