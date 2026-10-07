import { describe, expect, it } from "vitest";
import { type Binding, DEFAULT_GROUP, defineKeymap, KeymapError } from "./keymap.js";
import { presets, vimNavigation, vimScrollOnly } from "./presets.js";

describe("presets", () => {
  it("vimNavigation has exactly the agreed ids and defaults", () => {
    const keymap = defineKeymap(vimNavigation);
    expect(keymap.bindings.map((b) => [b.id, b.keys])).toEqual([
      ["down", ["j", "down"]],
      ["up", ["k", "up"]],
      ["halfPageDown", ["ctrl+d"]],
      ["halfPageUp", ["ctrl+u"]],
      ["lineDown", ["ctrl+e"]],
      ["lineUp", ["ctrl+y"]],
      ["top", ["g g", "home"]],
      ["bottom", ["G", "end"]],
      ["pageDown", ["pagedown", "ctrl+f"]],
      ["pageUp", ["pageup", "ctrl+b"]],
    ]);
    expect(keymap.diagnostics).toEqual([]);
    for (const b of keymap.bindings) {
      expect(b.group).toBe("Navigation");
      expect(b.desc).not.toBe("");
      expect(b.isDefault).toBe(true);
    }
  });

  it("vimScrollOnly is only ctrl-d/u/e/y", () => {
    expect(defineKeymap(vimScrollOnly).bindings.flatMap((b) => b.keys)).toEqual([
      "ctrl+d",
      "ctrl+u",
      "ctrl+e",
      "ctrl+y",
    ]);
    expect(presets.vimScrollOnly).toBe(vimScrollOnly);
    expect(presets.vimNavigation).toBe(vimNavigation);
  });

  it("is frozen, so one consumer cannot change another's defaults", () => {
    expect(Object.isFrozen(vimNavigation)).toBe(true);
    expect(Object.isFrozen(vimNavigation[0])).toBe(true);
    expect(Object.isFrozen(vimNavigation[0]!.keys)).toBe(true);
  });

  it("can be spread and extended", () => {
    const keymap = defineKeymap([...vimNavigation, { id: "quit", keys: "q", desc: "Quit" }]);
    expect(keymap.get("quit")).toMatchObject({ keys: ["q"], group: DEFAULT_GROUP });
  });
});

describe("defineKeymap", () => {
  const base: Binding[] = [
    { id: "a", keys: "x", desc: "A" },
    { id: "b", keys: ["y", "Y"], desc: "B", group: "G", location: "src/app.ts:10" },
  ];

  it("canonicalises and de-duplicates keys", () => {
    const keymap = defineKeymap([{ id: "a", keys: ["CTRL+d", "ctrl+d", "Down"], desc: "" }]);
    expect(keymap.get("a")!.keys).toEqual(["ctrl+d", "down"]);
    expect(keymap.get("a")!.sequences).toEqual([[{ key: "d", ctrl: true }], [{ key: "down" }]]);
  });

  it("keeps location and defaults the group", () => {
    const keymap = defineKeymap(base);
    expect(keymap.get("a")).not.toHaveProperty("location");
    expect(keymap.get("a")!.group).toBe(DEFAULT_GROUP);
    expect(keymap.get("b")!.location).toBe("src/app.ts:10");
  });

  it("is immutable", () => {
    const keymap = defineKeymap(base);
    expect(Object.isFrozen(keymap)).toBe(true);
    expect(Object.isFrozen(keymap.bindings)).toBe(true);
    expect(Object.isFrozen(keymap.bindings[0])).toBe(true);
    expect(Object.isFrozen(keymap.bindings[0]!.keys)).toBe(true);
    expect(Object.isFrozen(keymap.diagnostics)).toBe(true);
  });

  it("rejects an invalid spec, naming the binding", () => {
    expect(() => defineKeymap([{ id: "bad", keys: "KeyD", desc: "" }])).toThrow(KeymapError);
    expect(() => defineKeymap([{ id: "bad", keys: "KeyD", desc: "" }])).toThrow(/binding "bad"/);
  });

  it("rejects duplicate and empty ids", () => {
    expect(() => defineKeymap([...base, { id: "a", keys: "z", desc: "" }])).toThrow(
      /duplicate binding id "a"/,
    );
    expect(() => defineKeymap([{ id: "", keys: "z", desc: "" }])).toThrow(/empty id/);
  });

  describe("overrides", () => {
    it("replaces keys and reports non-default", () => {
      const keymap = defineKeymap(base, { overrides: { a: ["z", "ctrl+z"] } });
      expect(keymap.get("a")!.keys).toEqual(["z", "ctrl+z"]);
      expect(keymap.get("a")!.defaultKeys).toEqual(["x"]);
      expect(keymap.isDefault("a")).toBe(false);
      expect(keymap.isDefault("b")).toBe(true);
      expect(keymap.diagnostics).toEqual([
        {
          kind: "non-default",
          id: "a",
          defaultKeys: ["x"],
          keys: ["z", "ctrl+z"],
          message: `"a" is rebound from [x] to [z, ctrl+z]`,
        },
      ]);
    });

    it("does not report an override equal to the default", () => {
      const keymap = defineKeymap(base, { overrides: { b: ["y", "Y"], a: "x" } });
      expect(keymap.diagnostics).toEqual([]);
      expect(keymap.isDefault("a")).toBe(true);
    });

    it("can unbind with []", () => {
      const keymap = defineKeymap(base, { overrides: { a: [] } });
      expect(keymap.get("a")!.keys).toEqual([]);
      expect(keymap.diagnostics[0]).toMatchObject({ kind: "non-default", id: "a", keys: [] });
    });

    it("reports an unknown override and ignores it", () => {
      const keymap = defineKeymap(base, { overrides: { nope: "q" } });
      expect(keymap.diagnostics).toEqual([
        {
          kind: "unknown-override",
          id: "nope",
          message: `override for unknown binding "nope" was ignored`,
        },
      ]);
    });

    it("isDefault is false for an unknown id", () => {
      expect(defineKeymap(base).isDefault("missing")).toBe(false);
    });

    it("rejects an invalid override spec", () => {
      expect(() => defineKeymap(base, { overrides: { a: "$mod+k" } })).toThrow(/binding "a"/);
    });
  });

  describe("conflicts", () => {
    const clashing: Binding[] = [
      { id: "first", keys: "q", desc: "" },
      { id: "second", keys: ["w", "q"], desc: "" },
    ];

    it("reports two ids on one sequence, first declared wins", () => {
      expect(defineKeymap(clashing).diagnostics).toEqual([
        {
          kind: "conflict",
          keys: "q",
          ids: ["first", "second"],
          message: `"q" is bound to "first" and "second"; "first" wins`,
        },
      ]);
    });

    it("reports a conflict introduced by an override", () => {
      const keymap = defineKeymap(vimNavigation, { overrides: { lineDown: "j" } });
      expect(keymap.diagnostics.map((d) => d.kind)).toEqual(["non-default", "conflict"]);
    });

    it("strict mode throws", () => {
      expect(() => defineKeymap(clashing, { strict: true })).toThrow(/keymap is ambiguous/);
      expect(() => defineKeymap(vimNavigation, { strict: true })).not.toThrow();
    });
  });

  describe("prefix ambiguity", () => {
    it("reports each longer binding the shorter one shadows", () => {
      const d = defineKeymap([
        { id: "short", keys: "g", desc: "" },
        { id: "long", keys: "g g", desc: "" },
        { id: "other", keys: "g t", desc: "" },
      ]).diagnostics;
      expect(d).toEqual([
        {
          kind: "prefix-ambiguity",
          prefix: "g",
          prefixId: "short",
          keys: "g g",
          id: "long",
          message: `"g" ("short") fires immediately, so "g g" ("long") can never be reached`,
        },
        expect.objectContaining({ kind: "prefix-ambiguity", keys: "g t", id: "other" }),
      ]);
    });

    it("compares whole steps, not characters", () => {
      // "e" is a character-prefix of "end g" but not a step-prefix of it.
      const keymap = defineKeymap([
        { id: "a", keys: "e", desc: "" },
        { id: "b", keys: "end g", desc: "" },
        { id: "c", keys: "ctrl+g", desc: "" },
        { id: "d", keys: "g ctrl+g", desc: "" },
      ]);
      expect(keymap.diagnostics).toEqual([]);
    });

    it("strict mode throws", () => {
      expect(() =>
        defineKeymap(
          [
            { id: "short", keys: "g", desc: "" },
            { id: "long", keys: "g g", desc: "" },
          ],
          { strict: true },
        ),
      ).toThrow(/can never be reached/);
    });
  });
});
