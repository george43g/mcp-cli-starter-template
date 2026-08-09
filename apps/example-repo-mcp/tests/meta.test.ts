/**
 * Build identity.
 *
 * These run under vitest, NOT a Vite build, so `__BUILD_STAMP__` is undefined
 * and every case here exercises the git-shell-out fallback — which is the
 * branch a `tsx src/cli.ts` run takes, and the one most likely to rot silently
 * because normal builds never reach it.
 */

import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { APP_VERSION, buildStamp } from "../src/meta.js";

function inGitCheckout(): boolean {
  try {
    execFileSync("git", ["rev-parse", "--git-dir"], {
      cwd: import.meta.dirname,
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

describe("buildStamp", () => {
  it("always starts with the package version", () => {
    // The stamp EXTENDS semver rather than replacing it, so anything reading
    // the leading version out of it keeps working.
    expect(buildStamp().startsWith(APP_VERSION)).toBe(true);
  });

  it("is stable across calls (cached)", () => {
    // Cached deliberately: the fallback shells out to git up to four times, and
    // it is read on every REPL banner and TUI render.
    expect(buildStamp()).toBe(buildStamp());
  });

  it("carries a commit count and sha when run from a git checkout", () => {
    if (!inGitCheckout()) return; // packed tarball — fallback to bare semver
    expect(buildStamp()).toMatch(/^\d+\.\d+\.\d+\+\d+\.[0-9a-f]{7}(\.dirty)?$/);
  });

  it("degrades to something usable rather than throwing", () => {
    // Contract: a published tarball or a shallow container still boots. The
    // worst case is bare semver, never an exception.
    expect(() => buildStamp()).not.toThrow();
    expect(buildStamp().length).toBeGreaterThan(0);
  });
});
