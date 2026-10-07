import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { defineKeymap } from "./keymap.js";
import { createMatcher, type MatchResult } from "./matcher.js";
import type { KeyInput } from "./notation.js";
import { presets } from "./presets.js";

interface VectorCase {
  name: string;
  preset: keyof typeof presets;
  inputs: KeyInput[];
  at?: number[];
  expected: MatchResult[];
}

const file = resolve(dirname(fileURLToPath(import.meta.url)), "../test-vectors.json");
const vectors = JSON.parse(readFileSync(file, "utf8")) as {
  version: number;
  sequenceTimeoutMs: number;
  cases: VectorCase[];
};

describe("test-vectors.json", () => {
  it("is well-formed", () => {
    expect(vectors.version).toBe(1);
    expect(vectors.cases.length).toBeGreaterThan(10);
    for (const c of vectors.cases) {
      expect(Object.keys(presets)).toContain(c.preset);
      expect(c.expected).toHaveLength(c.inputs.length);
      if (c.at) expect(c.at).toHaveLength(c.inputs.length);
    }
  });

  it("covers every binding of every preset", () => {
    for (const [name, bindings] of Object.entries(presets)) {
      const hit = new Set(
        vectors.cases
          .filter((c) => c.preset === name)
          .flatMap((c) => c.expected)
          .flatMap((r) => (r.type === "match" ? [r.id] : [])),
      );
      expect([...hit].sort()).toEqual(bindings.map((b) => b.id).sort());
    }
  });

  it.each(vectors.cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    let t = 0;
    const matcher = createMatcher(defineKeymap(presets[c.preset]), {
      sequenceTimeoutMs: vectors.sequenceTimeoutMs,
      counts: true,
      now: () => t,
    });
    const actual = c.inputs.map((input, i) => {
      t = c.at?.[i] ?? 0;
      return matcher.feed(input);
    });
    expect(actual).toEqual(c.expected);
  });
});
