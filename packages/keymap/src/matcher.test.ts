import { describe, expect, it } from "vitest";
import { defineKeymap } from "./keymap.js";
import { createMatcher, type MatchResult } from "./matcher.js";
import type { KeyInput } from "./notation.js";
import { vimNavigation } from "./presets.js";

/** A clock the test moves by hand. */
function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

const keys = (...specs: string[]): KeyInput[] =>
  specs.map((s) => (s.startsWith("^") ? { key: s.slice(1), ctrl: true } : { key: s }));

const feedAll = (m: ReturnType<typeof createMatcher>, inputs: KeyInput[]): MatchResult[] =>
  inputs.map((i) => m.feed(i));

const match = (id: string, count = 1): MatchResult => ({ type: "match", id, count });
const pending: MatchResult = { type: "pending" };
const none: MatchResult = { type: "none" };

describe("createMatcher with vimNavigation", () => {
  const keymap = defineKeymap(vimNavigation);

  it("matches every preset binding", () => {
    const m = createMatcher(keymap, { now: () => 0 });
    const cases: [KeyInput[], string][] = [
      [keys("j"), "down"],
      [[{ key: "down" }], "down"],
      [keys("k"), "up"],
      [[{ key: "up" }], "up"],
      [keys("^d"), "halfPageDown"],
      [keys("^u"), "halfPageUp"],
      [keys("^e"), "lineDown"],
      [keys("^y"), "lineUp"],
      [keys("g", "g"), "top"],
      [[{ key: "home" }], "top"],
      [keys("G"), "bottom"],
      [[{ key: "end" }], "bottom"],
      [[{ key: "pagedown" }], "pageDown"],
      [keys("^f"), "pageDown"],
      [[{ key: "pageup" }], "pageUp"],
      [keys("^b"), "pageUp"],
    ];
    for (const [inputs, id] of cases) {
      expect(feedAll(m, inputs).at(-1)).toEqual(match(id));
    }
  });

  it("accepts named keys in any case, as a raw adapter might send them", () => {
    const m = createMatcher(keymap);
    expect(m.feed({ key: "PageDown" })).toEqual(match("pageDown"));
  });

  it("gg within the timeout is top; after it, the first g is forgotten", () => {
    const c = clock();
    const m = createMatcher(keymap, { now: c.now });
    expect(m.feed({ key: "g" })).toEqual(pending);
    c.advance(499);
    expect(m.feed({ key: "g" })).toEqual(match("top"));

    expect(m.feed({ key: "g" })).toEqual(pending);
    c.advance(501);
    expect(m.feed({ key: "g" })).toEqual(pending);
    c.advance(10);
    expect(m.feed({ key: "g" })).toEqual(match("top"));
  });

  it("honours a custom timeout", () => {
    const c = clock();
    const m = createMatcher(keymap, { now: c.now, sequenceTimeoutMs: 50 });
    m.feed({ key: "g" });
    c.advance(51);
    expect(m.feed({ key: "g" })).toEqual(pending);
  });

  it("uses Date.now by default", () => {
    const m = createMatcher(keymap);
    expect(feedAll(m, keys("g", "g"))).toEqual([pending, match("top")]);
  });

  it("accumulates counts like useVimKeys", () => {
    const m = createMatcher(keymap);
    expect(feedAll(m, keys("1", "2", "j"))).toEqual([pending, pending, match("down", 12)]);
    expect(m.feed({ key: "j" })).toEqual(match("down"));
    expect(feedAll(m, keys("0", "j"))).toEqual([none, match("down")]);
    expect(feedAll(m, keys("3", "0", "^d"))).toEqual([pending, pending, match("halfPageDown", 30)]);
    expect(feedAll(m, keys("9", "9", "9", "9", "9", "k")).at(-1)).toEqual(match("up", 9999));
  });

  it("drops a count when the next key matches nothing", () => {
    const m = createMatcher(keymap);
    expect(feedAll(m, keys("5", "x", "j"))).toEqual([pending, none, match("down")]);
  });

  it("does not read digits as counts when counts are off", () => {
    const m = createMatcher(keymap, { counts: false });
    expect(feedAll(m, keys("5", "j"))).toEqual([none, match("down")]);
  });

  it("a key that breaks a pending sequence is judged alone and keeps the count", () => {
    const m = createMatcher(keymap);
    expect(feedAll(m, keys("5", "g", "j"))).toEqual([pending, pending, match("down", 5)]);
    expect(feedAll(m, keys("g", "x"))).toEqual([pending, none]);
    // A digit after a pending g starts a fresh count.
    expect(feedAll(m, keys("g", "3", "j"))).toEqual([pending, pending, match("down", 3)]);
  });

  it("a timed-out sequence drops its count", () => {
    const c = clock();
    const m = createMatcher(keymap, { now: c.now });
    feedAll(m, keys("5", "g"));
    c.advance(600);
    expect(m.feed({ key: "j" })).toEqual(match("down"));
  });

  it("modified keys never match unmodified bindings", () => {
    const m = createMatcher(keymap);
    expect(m.feed({ key: "j", ctrl: true })).toEqual(none);
    expect(m.feed({ key: "d" })).toEqual(none);
    expect(m.feed({ key: "5", alt: true })).toEqual(none);
  });

  it("ignores shift on characters", () => {
    const m = createMatcher(keymap);
    expect(m.feed({ key: "G", shift: true })).toEqual(match("bottom"));
  });

  it("pending() shows the count and partial sequence, vim-style", () => {
    const m = createMatcher(keymap);
    expect(m.pending()).toBe("");
    m.feed({ key: "1" });
    m.feed({ key: "2" });
    expect(m.pending()).toBe("12");
    m.feed({ key: "g" });
    expect(m.pending()).toBe("12g");
    m.feed({ key: "g" });
    expect(m.pending()).toBe("");
  });

  it("reset() clears count and sequence", () => {
    const m = createMatcher(keymap);
    feedAll(m, keys("4", "g"));
    m.reset();
    expect(m.pending()).toBe("");
    expect(m.feed({ key: "g" })).toEqual(pending);
  });
});

describe("createMatcher runtime rules", () => {
  it("prefix ambiguity: the shorter binding fires immediately", () => {
    const keymap = defineKeymap([
      { id: "short", keys: "g", desc: "" },
      { id: "long", keys: "g g", desc: "" },
    ]);
    const m = createMatcher(keymap);
    expect(feedAll(m, keys("g", "g"))).toEqual([match("short"), match("short")]);
  });

  it("conflict: the first-declared id wins", () => {
    const keymap = defineKeymap([
      { id: "first", keys: "q", desc: "" },
      { id: "second", keys: "q", desc: "" },
    ]);
    expect(createMatcher(keymap).feed({ key: "q" })).toEqual(match("first"));
  });

  it("three-step sequences stay pending until complete", () => {
    const keymap = defineKeymap([{ id: "x", keys: "ctrl+w g t", desc: "" }]);
    const m = createMatcher(keymap);
    expect(feedAll(m, [{ key: "w", ctrl: true }, ...keys("g", "t")])).toEqual([
      pending,
      pending,
      match("x"),
    ]);
    expect(m.pending()).toBe("");
  });

  it("an unbound binding (overridden to []) never matches", () => {
    const keymap = defineKeymap(vimNavigation, { overrides: { down: [] } });
    expect(createMatcher(keymap).feed({ key: "j" })).toEqual(none);
  });

  it("an override is what matches", () => {
    const keymap = defineKeymap(vimNavigation, { overrides: { top: "g" } });
    expect(createMatcher(keymap).feed({ key: "g" })).toEqual(match("top"));
  });
});
