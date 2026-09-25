import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { CHAIN_BUDGET_BYTES, checkAgentsChains, describeChains } from "./lib/agents-chain.mjs";

/**
 * Fixture git repos, one per case. The selection cases are lifted from the
 * shared checker's pinned tests (g-agent-skills,
 * skills/harness-engineering/tests/test_check_instruction_chain.py) so the two
 * implementations agree: override precedence, whitespace-only shadowing,
 * tracked-only, symlinks counted at their target's size with no dedup, and a
 * dangling link falling through. The budget here is 28,000, not Codex's cap.
 */

const sandboxes = [];
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

const gitEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
);
Object.assign(gitEnv, {
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@t",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@t",
  GIT_CONFIG_NOSYSTEM: "1",
});

function git(repo, ...args) {
  execFileSync("git", ["-c", "core.symlinks=true", ...args], { cwd: repo, env: gitEnv });
}

function put(repo, rel, content) {
  mkdirSync(dirname(join(repo, rel)), { recursive: true });
  writeFileSync(join(repo, rel), typeof content === "number" ? "x".repeat(content) : content);
}

/** A git repo with `files` committed (rel → byte count or literal text). */
function repo(files = { "AGENTS.md": 1000 }, { commit = true } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "agents-chain-")));
  sandboxes.push(dir);
  git(dir, "init", "-q");
  for (const [rel, content] of Object.entries(files)) put(dir, rel, content);
  if (commit) {
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "--allow-empty", "-m", "fixture");
  }
  return dir;
}

function commitAll(dir) {
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "more");
}

const summary = (result) => result.chains.map((c) => [c.leaf, c.files.join(" + "), c.bytes]);

const posixOnly = { skip: process.platform === "win32" ? "symlink fixtures need POSIX" : false };

describe("checkAgentsChains: control", () => {
  it("passes a committed root guide under budget", () => {
    const result = checkAgentsChains(repo());
    assert.deepEqual(result.failures, []);
    assert.deepEqual(summary(result), [["AGENTS.md", "AGENTS.md", 1000]]);
  });

  it("passes exactly at the budget and fails one byte over", () => {
    assert.deepEqual(checkAgentsChains(repo({ "AGENTS.md": CHAIN_BUDGET_BYTES })).failures, []);
    assert.equal(
      checkAgentsChains(repo({ "AGENTS.md": CHAIN_BUDGET_BYTES + 1 })).failures.length,
      1,
    );
  });

  it("ignores an inherited GIT_DIR that points at another repo", () => {
    const other = repo({});
    const dir = repo();
    // What a git hook exports. Computed key: this is a fixture, not a build input.
    const key = ["GIT", "DIR"].join("_");
    const saved = process.env[key];
    process.env[key] = join(other, ".git");
    try {
      assert.deepEqual(summary(checkAgentsChains(dir)), [["AGENTS.md", "AGENTS.md", 1000]]);
    } finally {
      if (saved === undefined) delete process.env[key];
      else process.env[key] = saved;
    }
  });

  it("FAILS outside a git work tree: there is no tracked set to measure", () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "agents-chain-nogit-")));
    sandboxes.push(dir);
    put(dir, "AGENTS.md", 10);
    const { failures } = checkAgentsChains(dir);
    assert.equal(failures.length, 1);
    assert.match(failures[0], /not inside a git work tree/);
  });

  it("says nothing was checked when no instruction file is tracked yet", () => {
    // A freshly generated repo before its first `git add`.
    const result = checkAgentsChains(repo({ "AGENTS.md": 40000 }, { commit: false }));
    assert.deepEqual(result.failures, []);
    assert.equal(result.tracked, 0);
    assert.match(describeChains(result), /not checked/);
  });
});

describe("checkAgentsChains: mutants", () => {
  it("RED: a nested chain over budget while each file is under, sorted largest first", () => {
    const result = checkAgentsChains(
      repo({ "AGENTS.md": 14000, "a/AGENTS.md": 8000, "a/b/AGENTS.md": 8000 }),
    );
    assert.equal(result.failures.length, 1);
    assert.match(
      result.failures[0],
      /AGENTS\.md \(14000\) \+ a\/AGENTS\.md \(8000\) \+ a\/b\/AGENTS\.md \(8000\) is 30000 B/,
    );
    assert.deepEqual(
      result.chains.map((c) => c.bytes),
      [30000, 22000, 14000],
    );
  });

  it("inversion: shrinking the offender passes", () => {
    const dir = repo({ "AGENTS.md": 14000, "a/AGENTS.md": 8000, "a/b/AGENTS.md": 8000 });
    put(dir, "a/b/AGENTS.md", 2000);
    commitAll(dir);
    assert.deepEqual(checkAgentsChains(dir).failures, []);
  });

  it("AGENTS.override.md replaces AGENTS.md in the same directory", () => {
    const result = checkAgentsChains(
      repo({ "AGENTS.md": 1000, "a/AGENTS.md": 40000, "a/AGENTS.override.md": 500 }),
    );
    assert.deepEqual(result.failures, []);
    assert.deepEqual(summary(result), [
      ["a/AGENTS.override.md", "AGENTS.md + a/AGENTS.override.md", 1500],
      ["AGENTS.md", "AGENTS.md", 1000],
    ]);
  });

  it("an untracked AGENTS.md is ignored", () => {
    const dir = repo();
    put(dir, "a/AGENTS.md", 40000);
    const result = checkAgentsChains(dir);
    assert.deepEqual(result.failures, []);
    assert.equal(result.chains.length, 1);
  });

  it("a whitespace-only override still hides the AGENTS.md beside it", () => {
    const result = checkAgentsChains(
      repo({ "AGENTS.md": 1000, "a/AGENTS.md": 40000, "a/AGENTS.override.md": " \n\t\n" }),
    );
    assert.deepEqual(result.failures, []);
    assert.deepEqual(summary(result), [["AGENTS.md", "AGENTS.md", 1000]]);
    assert.ok(
      result.notes.includes(
        "a/AGENTS.override.md: whitespace-only, so Codex loads nothing here and never reads AGENTS.md",
      ),
      result.notes.join("\n"),
    );
  });

  it("a symlink counts its target's bytes each time, with no dedup", posixOnly, () => {
    const dir = repo({ "AGENTS.md": 1000, "shared/doc.md": 14000 });
    mkdirSync(join(dir, "a/b"), { recursive: true });
    symlinkSync("../shared/doc.md", join(dir, "a/AGENTS.md"));
    symlinkSync("../../shared/doc.md", join(dir, "a/b/AGENTS.md"));
    commitAll(dir);
    const result = checkAgentsChains(dir);
    assert.equal(result.failures.length, 1);
    assert.deepEqual(summary(result)[0], [
      "a/b/AGENTS.md",
      "AGENTS.md + a/AGENTS.md + a/b/AGENTS.md",
      29000,
    ]);
  });

  it("a dangling override falls through to AGENTS.md", posixOnly, () => {
    const dir = repo();
    symlinkSync("nowhere.md", join(dir, "AGENTS.override.md"));
    commitAll(dir);
    const result = checkAgentsChains(dir);
    assert.deepEqual(summary(result), [["AGENTS.md", "AGENTS.md", 1000]]);
    assert.match(
      result.notes.join("\n"),
      /AGENTS\.override\.md: tracked but missing or a dangling link/,
    );
  });
});

describe("checkAgentsChains: a generated repo committed as a snapshot", () => {
  it("RED: fails root + snapshot over budget and names both files", () => {
    const { failures } = checkAgentsChains(
      repo({ "AGENTS.md": 19572, "example/AGENTS.md": 14639 }),
      { projectRoots: ["example"] },
    );
    assert.equal(failures.length, 1);
    assert.match(failures[0], /AGENTS\.md \(19572\) \+ example\/AGENTS\.md \(14639\) is 34211 B/);
  });

  it("measures the snapshot again as its own root", () => {
    const result = checkAgentsChains(repo({ "AGENTS.md": 12000, "example/AGENTS.md": 14639 }), {
      projectRoots: ["example"],
    });
    assert.deepEqual(result.failures, []);
    assert.deepEqual(
      result.chains.map((c) => [c.root, c.files.join(" + "), c.bytes]),
      [
        [".", "AGENTS.md + example/AGENTS.md", 26639],
        [".", "AGENTS.md", 12000],
        ["example", "example/AGENTS.md", 14639],
      ],
    );
  });
});
