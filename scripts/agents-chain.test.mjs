import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { agentsChains, checkAgentsChains } from "./lib/agents-chain.mjs";

/**
 * The chain budget is measured on real trees in a tmpdir (no git, so the
 * filesystem-walk path runs), with a RED DRILL shaped like the defect that
 * motivated it: a root guide plus a snapshot of a generated repo whose own
 * guide pushed the combined chain past Codex's cap.
 */

const sandboxes = [];
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), "agents-chain-"));
  sandboxes.push(root);
  for (const [path, bytes] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), "x".repeat(bytes));
  }
  return root;
}

describe("agentsChains", () => {
  it("sums every ancestor guide from the root to the leaf, skipping levels without one", () => {
    const sizes = { "AGENTS.md": 100, "a/b/AGENTS.md": 50, "c/AGENTS.md": 7 };
    const chains = agentsChains(Object.keys(sizes), (p) => sizes[p]);
    assert.deepEqual(
      chains.map((c) => [c.leaf, c.files, c.bytes]),
      [
        ["AGENTS.md", ["AGENTS.md"], 100],
        ["a/b/AGENTS.md", ["AGENTS.md", "a/b/AGENTS.md"], 152],
        ["c/AGENTS.md", ["AGENTS.md", "c/AGENTS.md"], 109],
      ],
    );
  });
});

describe("checkAgentsChains", () => {
  it("RED: fails a root + generated-snapshot chain over budget and names both files", () => {
    const root = tree({ "AGENTS.md": 19572, "example/AGENTS.md": 14639 });
    const { failures } = checkAgentsChains(root, { projectRoots: ["example"] });
    assert.equal(failures.length, 1);
    assert.match(failures[0], /AGENTS\.md \+ example\/AGENTS\.md is 34213 B, over the 28000 B/);
  });

  it("measures a project root again on its own, so the snapshot passes as a generated repo", () => {
    const root = tree({ "AGENTS.md": 12000, "example/AGENTS.md": 14639 });
    const { chains, failures } = checkAgentsChains(root, { projectRoots: ["example"] });
    assert.deepEqual(failures, []);
    assert.deepEqual(
      chains.map((c) => [c.root, c.files.join(" + "), c.bytes]),
      [
        [".", "AGENTS.md", 12000],
        [".", "AGENTS.md + example/AGENTS.md", 26641],
        ["example", "example/AGENTS.md", 14639],
      ],
    );
  });

  it("fails a single guide over budget and passes one at it", () => {
    assert.equal(checkAgentsChains(tree({ "AGENTS.md": 28001 })).failures.length, 1);
    assert.equal(checkAgentsChains(tree({ "AGENTS.md": 28000 })).failures.length, 0);
  });

  it("ignores node_modules", () => {
    const root = tree({ "AGENTS.md": 20000, "node_modules/x/AGENTS.md": 20000 });
    assert.equal(checkAgentsChains(root).chains.length, 1);
  });
});
