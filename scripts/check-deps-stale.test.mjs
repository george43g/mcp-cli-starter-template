import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * These tests run the REAL script as a subprocess against fixture lockfiles.
 *
 * The script derives its repo root from its own file location, so each fixture
 * gets a temp directory shaped `<tmp>/scripts/check-deps-stale.mjs` +
 * `<tmp>/pnpm-lock.yaml`, with the script COPIED from this repo at test time —
 * never a second implementation that can drift. Neither fixture contains a
 * registry-resolved first-party entry, so no test ever reaches `npm view`:
 * the suite stays offline, which `pnpm test:scripts` (and `verify`) require.
 *
 * The regression being pinned is real: the mcp-kit peer-dependency change
 * (#109) removed the last registry-resolved `@george43g/*` entry from the
 * lockfile, every first-party edge became a `link:`, and the zero-entries
 * positive control read that legitimate state as a broken parser — failing the
 * weekly deps-stale job on its first scheduled run.
 */

const SCRIPT = fileURLToPath(new URL("./check-deps-stale.mjs", import.meta.url));

const sandboxes = [];
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

function runAgainst(lockfile) {
  const root = mkdtempSync(join(tmpdir(), "deps-stale-"));
  sandboxes.push(root);
  mkdirSync(join(root, "scripts"));
  copyFileSync(SCRIPT, join(root, "scripts", "check-deps-stale.mjs"));
  writeFileSync(join(root, "pnpm-lock.yaml"), lockfile);
  try {
    const stdout = execFileSync("node", [join(root, "scripts", "check-deps-stale.mjs")], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    return { status: err.status, stdout: String(err.stdout), stderr: String(err.stderr) };
  }
}

/** The post-#109 shape of this repo's own lockfile: first-party deps exist, all links. */
const LINK_ONLY = `lockfileVersion: '9.0'

importers:

  apps/example:
    dependencies:
      '@george43g/mcp-kit':
        specifier: workspace:*
        version: link:../../packages/mcp-kit
      '@george43g/robustness':
        specifier: '>=0.11.0 <1'
        version: link:../../packages/robustness

  packages/mcp-kit:
    devDependencies:
      '@george43g/robustness':
        specifier: workspace:*
        version: link:../robustness
`;

/** No first-party deps at all — only this shape means the parser (or tree) broke. */
const NO_FIRST_PARTY = `lockfileVersion: '9.0'

importers:

  apps/example:
    dependencies:
      commander:
        specifier: ^14.0.0
        version: 14.0.3
`;

describe("check-deps-stale zero-registry outcomes", () => {
  it("PASSES a link-only workspace, saying affirmatively what it found", () => {
    // The failing weekly run, reproduced: legitimate state, not a broken parser.
    const r = runAgainst(LINK_ONLY);
    assert.equal(r.status, 0, `expected pass, got ${r.status}:\n${r.stdout}${r.stderr}`);
    // Affirmative, not an absence: the message must carry the link count and
    // the package names, so a reader can tell a working parser from a silent one.
    assert.match(r.stdout, /link/i);
    assert.match(r.stdout, /\b3\b/);
    assert.match(r.stdout, /@george43g\/mcp-kit/);
    assert.match(r.stdout, /@george43g\/robustness/);
  });

  it("still FAILS when there are no first-party deps of any kind", () => {
    // The positive control survives the fix: zero registry entries AND zero
    // links is the parser-broke reading, and "clean" must not be the default.
    const r = runAgainst(NO_FIRST_PARTY);
    assert.equal(r.status, 1, `expected failure, got ${r.status}:\n${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /FAILED/);
    assert.match(r.stderr, /need a human/);
  });
});
