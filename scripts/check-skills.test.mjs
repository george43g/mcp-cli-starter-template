import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Runs the real gate with HOME pointed at a fixture, so "the linker is
 * installed" and "it is not" are both facts rather than mocks.
 */

const SCRIPT = fileURLToPath(new URL("./check-skills.mjs", import.meta.url));

const sandboxes = [];
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

function home(linkerBody) {
  const dir = mkdtempSync(join(tmpdir(), "check-skills-"));
  sandboxes.push(dir);
  if (linkerBody !== undefined) {
    const bin = join(dir, ".agents/skills/repo-scoped-skills/bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "link-repo-skills"), linkerBody);
    chmodSync(join(bin, "link-repo-skills"), 0o755);
  }
  return dir;
}

function run(homeDir, args = []) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir },
  });
}

describe("check-skills", () => {
  it("passes with one skip line where repo-scoped-skills is not installed", () => {
    const result = run(home());
    assert.equal(result.status, 0);
    assert.match(result.stdout, /check:skills skipped: repo-scoped-skills is not installed/);
  });

  // A shebang script stands in for the Python linker; Windows runs the real
  // one through `python`, which this fixture cannot imitate.
  const posix = { skip: process.platform === "win32" ? "POSIX shebang fixture" : false };

  it("RED: fails when the linker reports a problem in any directory", posix, () => {
    const result = run(home('#!/bin/sh\necho "checked $2"\nexit 1\n'), [".", "example"]);
    assert.equal(result.status, 1);
    // Every directory is checked, not just the first failure.
    assert.equal(result.stdout.match(/^checked /gm)?.length, 2);
    assert.match(result.stdout, /^checked .*example$/m);
    assert.match(result.stderr, /check:skills failed/);
  });

  it("passes when the linker passes, running --check on each directory", posix, () => {
    const result = run(home('#!/bin/sh\necho "$1 $2"\n'), [".", "example"]);
    assert.equal(result.status, 0);
    assert.equal(result.stdout.match(/^--check /gm)?.length, 2);
  });
});
