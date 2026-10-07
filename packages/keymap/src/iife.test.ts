import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import * as esm from "./index.js";

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const IIFE = join(DIST, "keymap.iife.js");

type Global = { GeorgeKeymap: typeof esm };

/** Load the built IIFE as a webview would: a bare script in an empty global. */
function load(): Global {
  const context = {} as Global;
  runInNewContext(readFileSync(IIFE, "utf8"), context, { filename: IIFE });
  return context;
}

describe("dist/keymap.iife.js", () => {
  it("defines GeorgeKeymap with the same exports as the ESM entry", () => {
    const { GeorgeKeymap } = load();
    const runtimeExports = Object.keys(esm).sort();
    expect(Object.keys(GeorgeKeymap).sort()).toEqual(runtimeExports);
  });

  it("runs a matcher with no Node globals", () => {
    const { GeorgeKeymap: K } = load();
    const keymap = K.defineKeymap(K.vimScrollOnly);
    const m = K.createMatcher(keymap, { now: () => 0 });
    // Compare via JSON: objects from another realm fail toEqual's prototype check.
    expect(JSON.stringify(m.feed(K.fromKeyboardEvent({ key: "d", ctrlKey: true })!))).toBe(
      JSON.stringify({ type: "match", id: "halfPageDown", count: 1 }),
    );
    expect(K.formatKeys("g g", "vim")).toBe("gg");
  });

  it("ships a sha256 file in shasum format that matches", () => {
    const expected = createHash("sha256").update(readFileSync(IIFE)).digest("hex");
    expect(readFileSync(`${IIFE}.sha256`, "utf8")).toBe(`${expected}  keymap.iife.js\n`);
  });

  it("imports nothing", () => {
    const src = readFileSync(IIFE, "utf8");
    expect(src).not.toMatch(/\brequire\(|\bimport\s*\(|^import /m);
    expect(src).not.toContain("node:");
  });
});
