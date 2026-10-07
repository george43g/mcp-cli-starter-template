import { describe, expect, it } from "vitest";
import { fromInk, fromKeyboardEvent, type InkKeyLike, ownsFromKeymap } from "./adapters.js";
import { defineKeymap } from "./keymap.js";
import { createMatcher } from "./matcher.js";
import { vimNavigation, vimScrollOnly } from "./presets.js";

const keymap = defineKeymap(vimNavigation);
const k = (over: Partial<InkKeyLike> = {}): InkKeyLike => ({ ...over });

describe("fromInk", () => {
  it.each([
    ["upArrow", "up"],
    ["downArrow", "down"],
    ["leftArrow", "left"],
    ["rightArrow", "right"],
    ["pageUp", "pageup"],
    ["pageDown", "pagedown"],
    ["home", "home"],
    ["end", "end"],
    ["return", "enter"],
    ["escape", "escape"],
    ["tab", "tab"],
    ["backspace", "backspace"],
    ["delete", "delete"],
  ] as const)("maps key.%s to %s", (flag, name) => {
    expect(fromInk("", k({ [flag]: true }), keymap)).toEqual([{ key: name }]);
  });

  it("maps a single character with modifiers (Ink meta = alt, super = meta)", () => {
    expect(fromInk("d", k({ ctrl: true }), keymap)).toEqual([{ key: "d", ctrl: true }]);
    expect(fromInk("j", k({ meta: true }), keymap)).toEqual([{ key: "j", alt: true }]);
    expect(fromInk("k", k({ super: true }), keymap)).toEqual([{ key: "k", meta: true }]);
  });

  it("drops shift on characters, keeps it on named keys", () => {
    expect(fromInk("G", k({ shift: true }), keymap)).toEqual([{ key: "G" }]);
    expect(fromInk("", k({ tab: true, shift: true }), keymap)).toEqual([
      { key: "tab", shift: true },
    ]);
  });

  it("maps space, including Ink's ctrl+space name form", () => {
    expect(fromInk(" ", k(), keymap)).toEqual([{ key: "space" }]);
    expect(fromInk("space", k({ ctrl: true }), keymap)).toEqual([{ key: "space", ctrl: true }]);
  });

  it("ignores empty input and kitty key releases", () => {
    expect(fromInk("", k(), keymap)).toEqual([]);
    expect(fromInk("j", k({ eventType: "release" }), keymap)).toEqual([]);
    expect(fromInk("j", k({ eventType: "repeat" }), keymap)).toEqual([{ key: "j" }]);
  });

  it("splits a burst of owned keys, digits included", () => {
    expect(fromInk("jjk", k(), keymap)).toEqual([{ key: "j" }, { key: "j" }, { key: "k" }]);
    expect(fromInk("5gg", k(), keymap)).toEqual([{ key: "5" }, { key: "g" }, { key: "g" }]);
    expect(fromInk("G", k(), keymap)).toEqual([{ key: "G" }]);
  });

  it("rejects a paste containing anything unowned — all or nothing", () => {
    expect(fromInk("jq", k(), keymap)).toEqual([]);
    expect(fromInk("hello", k(), keymap)).toEqual([]);
    expect(fromInk("j\u001b[A", k(), keymap)).toEqual([]);
  });

  it("does not split a modified burst", () => {
    expect(fromInk("jj", k({ ctrl: true }), keymap)).toEqual([]);
    expect(fromInk("jj", k({ meta: true }), keymap)).toEqual([]);
  });

  it("does not own digits when counts are off", () => {
    expect(fromInk("5j", k(), keymap, { counts: false })).toEqual([]);
  });

  it("does not own characters that only appear with a modifier", () => {
    // vimScrollOnly binds ctrl+d etc.; a pasted "dude" is text, not scrolling.
    expect(fromInk("dude", k(), defineKeymap(vimScrollOnly), { counts: false })).toEqual([]);
  });

  it("accepts an owned predicate instead of a keymap", () => {
    const owns = (s: { key: string }) => s.key === "x";
    expect(fromInk("xx", k(), owns)).toEqual([{ key: "x" }, { key: "x" }]);
    expect(fromInk("xj", k(), owns)).toEqual([]);
  });

  it("ownsFromKeymap reports characters of every sequence", () => {
    const owns = ownsFromKeymap(keymap);
    expect(["j", "k", "g", "G", "0", "9"].every((key) => owns({ key }))).toBe(true);
    expect(owns({ key: "d" })).toBe(false);
  });

  it("feeds a matcher end to end", () => {
    const m = createMatcher(keymap);
    const results = fromInk("12j", k(), keymap).map((s) => m.feed(s));
    expect(results.at(-1)).toEqual({ type: "match", id: "down", count: 12 });
  });
});

describe("fromKeyboardEvent", () => {
  it.each([
    ["ArrowUp", "up"],
    ["ArrowDown", "down"],
    ["ArrowLeft", "left"],
    ["ArrowRight", "right"],
    ["PageUp", "pageup"],
    ["PageDown", "pagedown"],
    ["Home", "home"],
    ["End", "end"],
    ["Enter", "enter"],
    ["Escape", "escape"],
    ["Esc", "escape"],
    ["Tab", "tab"],
    ["Backspace", "backspace"],
    ["Delete", "delete"],
    [" ", "space"],
    ["Spacebar", "space"],
    ["j", "j"],
    ["G", "G"],
  ])("maps %j to %j", (key, expected) => {
    expect(fromKeyboardEvent({ key })).toEqual({ key: expected });
  });

  it("carries modifiers", () => {
    expect(fromKeyboardEvent({ key: "d", ctrlKey: true })).toEqual({ key: "d", ctrl: true });
    expect(fromKeyboardEvent({ key: "x", altKey: true, metaKey: true })).toEqual({
      key: "x",
      alt: true,
      meta: true,
    });
  });

  it("keeps shift only on named keys", () => {
    expect(fromKeyboardEvent({ key: "G", shiftKey: true })).toEqual({ key: "G" });
    expect(fromKeyboardEvent({ key: "Tab", shiftKey: true })).toEqual({ key: "tab", shift: true });
  });

  it.each(["Shift", "Control", "Alt", "Meta", "CapsLock", "Dead", "Unidentified", "Process", ""])(
    "ignores %j",
    (key) => {
      expect(fromKeyboardEvent({ key })).toBeNull();
    },
  );

  it("ignores IME composition", () => {
    expect(fromKeyboardEvent({ key: "j", isComposing: true })).toBeNull();
  });

  it("passes other named keys through lower-cased, so they match nothing", () => {
    expect(fromKeyboardEvent({ key: "F5" })).toEqual({ key: "f5" });
    expect(createMatcher(keymap).feed({ key: "f5" })).toEqual({ type: "none" });
  });

  it("drives gg with ctrl-free keydowns", () => {
    const m = createMatcher(keymap);
    const r = ["g", "g"].map((key) => m.feed(fromKeyboardEvent({ key })!));
    expect(r).toEqual([{ type: "pending" }, { type: "match", id: "top", count: 1 }]);
  });
});
