/**
 * The usage(1) resolver is written twice: in the canonical app's
 * scripts/check-usage-freshness.mjs, which ships into every generated repo and
 * must stay one self-contained file, and in the scaffolder's own copy of that
 * check. Both must pick the pinned usage version the same way, or one gate
 * reports false drift again while the other is fixed.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const BEGIN = "// --- usage(1) resolver: begin";
const END = "// --- usage(1) resolver: end";

function region(rel: string): string {
  const text = readFileSync(resolve(REPO_ROOT, rel), "utf8");
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  expect(start, `${rel} has no resolver begin marker`).toBeGreaterThanOrEqual(0);
  expect(end, `${rel} has no resolver end marker`).toBeGreaterThan(start);
  return text.slice(start, end);
}

describe("usage(1) resolver twins", () => {
  it("is byte-identical in the app's and the scaffolder's freshness checks", () => {
    expect(region("apps/scaffolder/scripts/check-usage-freshness.mjs")).toBe(
      region("apps/example-repo-mcp/scripts/check-usage-freshness.mjs"),
    );
  });
});
