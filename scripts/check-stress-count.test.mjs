import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

import {
  expectedFromHarness,
  MIN_FILES,
  MIN_SITES,
  scanAssertionCounts,
} from "./check-stress-count.mjs";

const HARNESS = "apps/example-repo-mcp/scripts/stress-mcp.ts";

/** Build a throwaway repo-shaped tree. `files` is {relPath: contents}. */
function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "stress-count-"));
  for (const [rel, body] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

const harness = (n) => `const EXPECTED_ASSERTIONS = ${n};\n`;

describe("expectedFromHarness", () => {
  it("reads the constant out of the canonical harness", () => {
    const root = fixture({ [HARNESS]: harness(15) });
    assert.equal(expectedFromHarness(root), 15);
  });

  it("reads whatever the harness says, not a hardcoded 15", () => {
    // The point of the constant is that the number can move. A checker that
    // knows the answer independently would keep passing after a case is added.
    const root = fixture({ [HARNESS]: harness(21) });
    assert.equal(expectedFromHarness(root), 21);
  });
});

describe("scanAssertionCounts", () => {
  it("flags a stale count, with file and line", () => {
    const root = fixture({
      [HARNESS]: harness(15),
      "README.md": "intro\n\nrun the 13-assertion harness\n",
    });
    const { failures } = scanAssertionCounts(root, 15);
    assert.equal(failures.length, 1);
    assert.match(failures[0], /^README\.md:3: says "13-assertion", harness says 15$/);
  });

  it("accepts both spellings — hyphen and space", () => {
    const root = fixture({
      [HARNESS]: harness(15),
      "a.md": "the 15-assertion harness\n",
      "b.md": "all 15 assertions pass\n",
      "c.md": "one 15 assertion run\n",
    });
    assert.deepEqual(scanAssertionCounts(root, 15).failures, []);
  });

  it("counts every reference on one line", () => {
    const root = fixture({
      [HARNESS]: harness(15),
      "a.md": "13 assertions became 14 assertions\n",
    });
    const { failures, sitesChecked } = scanAssertionCounts(root, 15);
    assert.equal(sitesChecked, 2);
    assert.equal(failures.length, 2);
  });

  it("exempts the state doc, whose stale numbers are dated evidence", () => {
    // "13 of 13 assertions passed" was TRUE of that run. Rewriting it to 15
    // would falsify history in order to fix a label.
    const root = fixture({
      [HARNESS]: harness(15),
      "docs/PROJECT_STATE.md": "- `pnpm run stress` — 13 of 13 assertions passed\n",
    });
    assert.deepEqual(scanAssertionCounts(root, 15).failures, []);
  });

  it("does NOT exempt the PROJECT_STATE template or its example/ copy", () => {
    // Same filename, opposite meaning: those are live labels a generated repo
    // reads as current.
    const root = fixture({
      [HARNESS]: harness(15),
      "apps/scaffolder/src/phases/10-docs-readme/lib/docs/PROJECT_STATE.md":
        "a 13-assertion harness\n",
      "example/docs/PROJECT_STATE.md": "a 13-assertion harness\n",
    });
    assert.equal(scanAssertionCounts(root, 15).failures.length, 2);
  });

  it("skips node_modules and build output", () => {
    const root = fixture({
      [HARNESS]: harness(15),
      "node_modules/pkg/README.md": "13 assertions\n",
      "dist/bundle.js": "// 13 assertions\n",
      "coverage/index.md": "13 assertions\n",
    });
    assert.deepEqual(scanAssertionCounts(root, 15).failures, []);
  });

  it("ignores binary-ish extensions it was never meant to read", () => {
    const root = fixture({ [HARNESS]: harness(15), "logo.svg": "<!-- 13 assertions -->" });
    assert.deepEqual(scanAssertionCounts(root, 15).failures, []);
  });

  it("does not match a bare number that is not an assertion count", () => {
    const root = fixture({
      [HARNESS]: harness(15),
      "a.md": "13 files, 13 tests, assertion-free\n",
    });
    const { failures, sitesChecked } = scanAssertionCounts(root, 15);
    assert.equal(sitesChecked, 0);
    assert.deepEqual(failures, []);
  });
});

describe("the scan's own floors", () => {
  it("a tiny tree falls under both floors, which is what makes an empty scan detectable", () => {
    // The failure this guards is the one that keeps recurring: an operation
    // that reports success because it had nothing to do.
    const root = fixture({ [HARNESS]: harness(15) });
    const { scanned, sitesChecked } = scanAssertionCounts(root, 15);
    assert.ok(scanned < MIN_FILES, `expected ${scanned} < ${MIN_FILES}`);
    assert.ok(sitesChecked < MIN_SITES, `expected ${sitesChecked} < ${MIN_SITES}`);
  });
});
