import { describe, expect, it } from "vitest";
import { formatJson } from "../src/core/json-format.js";

describe("formatJson", () => {
  it("collapses a short primitive array that JSON.stringify would expand", () => {
    // The reported case, verbatim from the life-stack session's config.
    const doc = {
      mcp: { tmux: { command: ["/opt/homebrew/bin/tmux-mcp-rs", "--shell-type", "zsh"] } },
    };
    expect(formatJson(doc)).toContain(
      '"command": ["/opt/homebrew/bin/tmux-mcp-rs", "--shell-type", "zsh"]',
    );
    // …and this is what it used to emit.
    expect(JSON.stringify(doc, null, 2)).toContain('"command": [\n');
  });

  it("expands an array that does not fit the width", () => {
    const doc = { command: ["a".repeat(60), "b".repeat(60)] };
    expect(formatJson(doc)).toContain('"command": [\n');
  });

  it("accounts for the indent, so nesting depth changes the decision", () => {
    // Five 9-character strings render as 65 columns of array.
    //   depth 1: 2 indent + 11 key + 65 + 1 comma = 79 <= 80  -> collapses
    //   depth 4: 8 indent + 11 key + 65 + 1 comma = 85 >  80  -> expands
    const item = ["aaaaaaaaa", "bbbbbbbbb", "ccccccccc", "ddddddddd", "eeeeeeeee"];
    expect(`[${item.map((v) => JSON.stringify(v)).join(", ")}]`).toHaveLength(65);

    expect(formatJson({ command: item })).not.toContain('"command": [\n');
    const deep = { a: { b: { c: { command: item } } } };
    expect(formatJson(deep)).toContain('"command": [\n');
  });

  it("reserves room for the trailing comma", () => {
    // An array that fits in exactly `lineWidth` but would push a comma past it
    // must expand, or the formatter re-wraps and the conflict returns.
    const value = { k: ["x".repeat(10)] };
    const collapsedLen = '  "k": ["xxxxxxxxxx"]'.length;
    expect(formatJson(value, collapsedLen)).toContain('"k": [\n');
    expect(formatJson(value, collapsedLen + 1)).toContain('"k": ["xxxxxxxxxx"]');
  });

  it("never collapses an array containing an object or array", () => {
    expect(formatJson({ k: [{ a: 1 }] })).toContain('"k": [\n');
    expect(formatJson({ k: [[1]] })).toContain('"k": [\n');
  });

  it("keeps objects expanded, which is what both formatters do for JSON", () => {
    expect(formatJson({ a: { b: 1 } })).toBe('{\n  "a": {\n    "b": 1\n  }\n}');
  });

  it("renders empty containers inline", () => {
    expect(formatJson({ a: [], b: {} })).toBe('{\n  "a": [],\n  "b": {}\n}');
  });

  it("round-trips to the same value as JSON.stringify", () => {
    const doc = {
      $schema: "https://opencode.ai/config.json",
      mcp: {
        one: {
          type: "local",
          command: ["pnpm", "tsx", "x.ts"],
          enabled: true,
          environment: { A: "1" },
        },
        two: { type: "local", command: ["mise", "mcp"], enabled: false },
      },
      nested: [1, true, null, "s"],
    };
    expect(JSON.parse(formatJson(doc))).toEqual(JSON.parse(JSON.stringify(doc)));
  });

  it("drops undefined values, matching JSON.stringify", () => {
    expect(formatJson({ a: 1, b: undefined })).toBe('{\n  "a": 1\n}');
  });

  it("is deterministic", () => {
    const doc = { mcp: { a: { command: ["x", "y"] } } };
    expect(formatJson(doc)).toBe(formatJson(doc));
  });
});
