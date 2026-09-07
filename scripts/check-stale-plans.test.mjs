import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Runs the REAL script as a subprocess against fixture plan directories, in the
 * same shape as check-stdout-purity.test.mjs and check-deps-stale.test.mjs: the
 * thing under test is the exit code and the message, because that is what CI
 * consumes.
 *
 * Rule 3 reads `git log`, so each fixture is a real git repo with a real commit
 * whose date is controlled via GIT_COMMITTER_DATE. That is what lets "untouched
 * for 40 days" be a fact rather than a mock.
 *
 * The first two cases are RED DRILLS reproducing the two plans a fleet sweep
 * actually found in docs/plans/ on 2026-09-07 — a status line 28 days out of
 * date, and a status buried at line 33. A guard whose failure mode has never
 * been observed is a guard nobody has tested.
 */

const SCRIPT = fileURLToPath(new URL("./check-stale-plans.mjs", import.meta.url));

const sandboxes = [];
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

/**
 * @param files  plan filename → contents
 * @param ageDays how long ago the commit that added them was made
 */
function run(files, ageDays = 1) {
  const root = mkdtempSync(join(tmpdir(), "stale-plans-"));
  sandboxes.push(root);
  const plansDir = join(root, "docs", "plans");
  mkdirSync(plansDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(plansDir, name), content);
  }

  const when = new Date(Date.now() - ageDays * 86_400_000).toISOString();
  const env = {
    ...process.env,
    GIT_AUTHOR_DATE: when,
    GIT_COMMITTER_DATE: when,
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@t",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@t",
  };
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, env, encoding: "utf8", stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("add", "-A");
  // Empty fixture sets have nothing to add; allow the empty commit so the repo
  // still has history for `git log` to read.
  git("commit", "-q", "--allow-empty", "-m", "fixture");

  try {
    const stdout = execFileSync("node", [SCRIPT, plansDir], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    return {
      status: err.status ?? 1,
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? "",
    };
  }
}

const COMPLETE = "# P\n\n**Status**: `complete` — shipped.\n\nBody.\n";

describe("check-stale-plans", () => {
  it("fails a non-terminal plan untouched past the window (the build-identity shape)", () => {
    const r = run({ "a.md": "# P\n\n**Status**: planned, not started.\n\nBody.\n" }, 40);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /untouched for 40 days/);
  });

  it("fails a plan whose status is buried below the header (the tui-primitives shape)", () => {
    const buried = `# P\n${"\nfiller".repeat(30)}\n\n## Status\n\n**\`complete\`** — shipped.\n`;
    const r = run({ "a.md": buried });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no status in the first 20 lines/);
    // It must say where the status actually is, or the message sends the reader hunting.
    assert.match(r.stderr, /found one further down/);
  });

  it("fails a plan with no status line anywhere", () => {
    const r = run({ "a.md": "# P\n\nJust prose.\n" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no status line at all/);
  });

  it("fails a status that contradicts a completion heading in its own body", () => {
    const r = run({ "a.md": "# P\n\n**Status**: active, nothing built.\n\n## BUILT 2026-08-22\n" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /completion heading/);
  });

  // life-stack's trap #1: `PARTIALLY EXECUTED` contains `executed`. A substring
  // match on terminal words exempts precisely the plans most likely to be rotten.
  it("does NOT read 'PARTIALLY EXECUTED' as terminal", () => {
    const r = run({ "a.md": "# P\n\n**Status**: PARTIALLY EXECUTED — two of five done.\n" }, 40);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /untouched for 40 days/);
  });

  it("lets a terminal plan age indefinitely — this repo keeps completed plans in place", () => {
    const r = run({ "a.md": COMPLETE }, 400);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /1 plan\(s\) OK/);
  });

  it("exempts a non-terminal plan carrying a DATED parked note", () => {
    const r = run({ "a.md": "# P\n\n**Status**: active.\n\nPARKED 2026-08-01 on an API.\n" }, 40);
    assert.equal(r.status, 0);
  });

  it("does not let an UNDATED parked note exempt a stale plan", () => {
    const r = run({ "a.md": "# P\n\n**Status**: active.\n\nPARKED pending review.\n" }, 40);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /untouched for 40 days/);
  });

  it("ignores README.md, which is the convention rather than a plan", () => {
    const r = run({ "README.md": "# ExecPlans\n\nNo status here.\n", "a.md": COMPLETE });
    assert.equal(r.status, 0);
  });

  // Positive control: an empty set makes every rule pass vacuously, which looks
  // identical to a clean directory.
  it("fails on an empty plans directory rather than reporting a vacuous pass", () => {
    const r = run({});
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Nothing was checked/);
  });

  // life-stack's trap #2: on a shallow clone `git log -1 -- <file>` returns
  // HEAD's date for every file, so rule 3 passes for everything. actions/checkout
  // defaults to fetch-depth: 1, so this is CI's default state elsewhere.
  it("fails on a shallow clone instead of passing without reading history", () => {
    const source = mkdtempSync(join(tmpdir(), "stale-plans-src-"));
    sandboxes.push(source);
    const plansDir = join(source, "docs", "plans");
    mkdirSync(plansDir, { recursive: true });
    writeFileSync(join(plansDir, "a.md"), "# P\n\n**Status**: planned.\n");
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t",
    };
    const git = (cwd, ...args) =>
      execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: "pipe" });
    git(source, "init", "-q", "-b", "main");
    git(source, "add", "-A");
    git(source, "commit", "-q", "-m", "one");
    // A second commit, so depth-1 genuinely truncates something.
    writeFileSync(join(plansDir, "b.md"), COMPLETE);
    git(source, "add", "-A");
    git(source, "commit", "-q", "-m", "two");

    const shallow = mkdtempSync(join(tmpdir(), "stale-plans-shallow-"));
    sandboxes.push(shallow);
    const clone = join(shallow, "c");
    execFileSync("git", ["clone", "-q", "--depth", "1", `file://${source}`, clone], {
      env,
      stdio: "pipe",
    });

    let status = 0;
    let stderr = "";
    try {
      execFileSync("node", [SCRIPT, join(clone, "docs", "plans")], {
        cwd: clone,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30_000,
      });
    } catch (err) {
      status = err.status ?? 1;
      stderr = err.stderr?.toString() ?? "";
    }
    assert.equal(status, 1);
    assert.match(stderr, /SHALLOW clone/);
  });
});
