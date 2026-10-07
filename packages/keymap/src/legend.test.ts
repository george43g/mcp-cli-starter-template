import { describe, expect, it } from "vitest";
import { defineKeymap } from "./keymap.js";
import { formatCheatsheet, formatKeysRows, toHints, toLegend } from "./legend.js";
import { vimNavigation, vimScrollOnly } from "./presets.js";

const scroll = defineKeymap(vimScrollOnly);

describe("toLegend", () => {
  it("is JSON-serialisable and carries canonical keys plus display", () => {
    const keymap = defineKeymap([
      { id: "top", keys: ["g g", "home"], desc: "Go to top", group: "Navigation" },
      { id: "quit", keys: "q", desc: "Quit", location: "src/app.ts:42" },
    ]);
    const legend = toLegend(keymap, { source: "recall", owner: "life-stack" });
    expect(JSON.parse(JSON.stringify(legend))).toEqual(legend);
    expect(legend).toEqual({
      version: 1,
      source: "recall",
      owner: "life-stack",
      style: "vim",
      bindings: [
        {
          id: "top",
          keys: ["g g", "home"],
          display: ["gg", "<Home>"],
          desc: "Go to top",
          group: "Navigation",
          isDefault: true,
        },
        {
          id: "quit",
          keys: ["q"],
          display: ["q"],
          desc: "Quit",
          group: "General",
          isDefault: true,
          location: "src/app.ts:42",
        },
      ],
    });
  });

  it("defaults source to empty, omits owner, honours style and overrides", () => {
    const keymap = defineKeymap(vimScrollOnly, { overrides: { lineUp: "ctrl+k" } });
    const legend = toLegend(keymap, { style: "symbols" });
    expect(legend.source).toBe("");
    expect(legend).not.toHaveProperty("owner");
    expect(legend.bindings.at(-1)).toMatchObject({
      id: "lineUp",
      keys: ["ctrl+k"],
      display: ["⌃K"],
      isDefault: false,
    });
  });
});

describe("toHints", () => {
  const keymap = defineKeymap(vimNavigation);

  it("produces HelpBar KeyHints, alternatives joined with /", () => {
    expect(toHints(keymap, ["down", "top", "halfPageDown"])).toEqual([
      { key: "j/<Down>", label: "Move down" },
      { key: "gg/<Home>", label: "Go to top" },
      { key: "<C-d>", label: "Half page down" },
    ]);
  });

  it("covers every binding by default, in the requested style", () => {
    expect(toHints(scroll, undefined, "symbols")).toEqual([
      { key: "⌃D", label: "Half page down" },
      { key: "⌃U", label: "Half page up" },
      { key: "⌃E", label: "Scroll one line down" },
      { key: "⌃Y", label: "Scroll one line up" },
    ]);
  });

  it("leaves out unbound bindings and throws on an unknown id", () => {
    const unbound = defineKeymap(vimScrollOnly, { overrides: { lineUp: [] } });
    expect(toHints(unbound).map((h) => h.label)).not.toContain("Scroll one line up");
    expect(() => toHints(keymap, ["nope"])).toThrow(/no binding with id "nope"/);
  });
});

describe("formatKeysRows", () => {
  it("prints life-stack's five tab-separated columns, one row per sequence", () => {
    const keymap = defineKeymap([
      { id: "top", keys: ["g g", "home"], desc: "Go to top", location: "src/list.tsx:88" },
      { id: "quit", keys: "q", desc: "Quit\tnow\n" },
    ]);
    expect(formatKeysRows(keymap, { source: "recall", owner: "mcp-starter" })).toEqual([
      "recall\tgg\tGo to top\tmcp-starter\tsrc/list.tsx:88",
      "recall\t<Home>\tGo to top\tmcp-starter\tsrc/list.tsx:88",
      "recall\tq\tQuit now \tmcp-starter\t",
    ]);
  });

  it("uses the caller's default location and style", () => {
    expect(
      formatKeysRows(scroll, {
        source: "wm",
        owner: "wm-stack",
        location: "view.js:1",
        style: "plain",
      })[0],
    ).toBe("wm\tctrl+d\tHalf page down\twm-stack\tview.js:1");
  });

  it("every row has exactly five columns", () => {
    for (const row of formatKeysRows(defineKeymap(vimNavigation), { source: "s", owner: "o" })) {
      expect(row.split("\t")).toHaveLength(5);
    }
  });
});

describe("formatCheatsheet", () => {
  it("renders groups with an aligned key column", () => {
    const keymap = defineKeymap([
      ...vimScrollOnly,
      { id: "quit", keys: ["q", "ctrl+c"], desc: "Quit", group: "App" },
    ]);
    expect(formatCheatsheet(keymap, { title: "Keys" })).toBe(
      [
        "Keys",
        "",
        "Navigation",
        "  <C-d>     Half page down",
        "  <C-u>     Half page up",
        "  <C-e>     Scroll one line down",
        "  <C-y>     Scroll one line up",
        "",
        "App",
        "  q, <C-c>  Quit",
      ].join("\n"),
    );
  });

  it("marks rebound keys and skips unbound ones", () => {
    const keymap = defineKeymap(vimScrollOnly, {
      overrides: { lineDown: "ctrl+j", lineUp: [] },
    });
    expect(formatCheatsheet(keymap, { style: "plain" })).toBe(
      [
        "Navigation",
        "  ctrl+d  Half page down",
        "  ctrl+u  Half page up",
        "  ctrl+j  Scroll one line down *",
        "",
        "* changed from the default",
      ].join("\n"),
    );
    expect(formatCheatsheet(keymap, { markNonDefault: false })).not.toContain("*");
  });

  it("is empty for an empty keymap", () => {
    expect(formatCheatsheet(defineKeymap([]))).toBe("");
  });
});
