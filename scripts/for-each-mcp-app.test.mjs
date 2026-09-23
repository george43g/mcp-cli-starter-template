import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Runs the REAL script as a subprocess against fixture pnpm workspaces, with a
 * REAL `pnpm --filter` underneath — same pattern as check-stdout-purity.test.mjs,
 * and the real pnpm matters here: the defect being fixed (DEFERRED #52) IS
 * pnpm's exit code on a filter that matches nothing. A mocked runner would have
 * agreed with the buggy version.
 *
 * No `pnpm install` is needed: `pnpm --filter <name> <script>` resolves the
 * workspace from pnpm-workspace.yaml and runs the script without node_modules,
 * so the fixtures stay fast and offline.
 */

const SCRIPT = fileURLToPath(new URL("./for-each-mcp-app.mjs", import.meta.url));
const LIB = fileURLToPath(new URL("./lib/mcp-apps.mjs", import.meta.url));

const sandboxes = [];
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

function app(name, { marked = true, scripts = {} } = {}) {
  return JSON.stringify({
    name,
    ...(marked ? { dependencies: { "@george43g/mcp-kit": "^2.0.0" } } : { dependencies: {} }),
    scripts,
  });
}

/** Prints a marker line so a test can assert the script really ran there. */
const ECHO = { gate: "node -e \"console.log('GATE-RAN:' + process.cwd())\"" };
const BOOM = { gate: 'node -e "process.exit(3)"' };

function run(files, args = ["gate"]) {
  const root = mkdtempSync(join(tmpdir(), "for-each-mcp-app-"));
  sandboxes.push(root);
  mkdirSync(join(root, "scripts", "lib"), { recursive: true });
  copyFileSync(SCRIPT, join(root, "scripts", "for-each-mcp-app.mjs"));
  copyFileSync(LIB, join(root, "scripts", "lib", "mcp-apps.mjs"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fixture", private: true }));
  writeFileSync(join(root, "pnpm-workspace.yaml"), 'packages:\n  - "apps/*"\n');
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(root, rel, ".."), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  // spawnSync, not execFileSync: the skip path exits 0 AND prints a notice, and
  // execFileSync only surfaces the streams on a non-zero exit.
  const r = spawnSync("node", [join(root, "scripts", "for-each-mcp-app.mjs"), ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
    cwd: root,
  });
  return { status: r.status, stdout: String(r.stdout), stderr: String(r.stderr) };
}

describe("for-each-mcp-app", () => {
  it("runs the script in a marked app", () => {
    const r = run({
      "apps/server-mcp/package.json": app("@x/server-mcp", { scripts: ECHO }),
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /GATE-RAN:.*apps\/server-mcp/);
    assert.match(r.stdout, /passed for 1 MCP app\(s\): @x\/server-mcp/);
  });

  it("does not run in an app that lacks the marker", () => {
    const r = run({
      "apps/server-mcp/package.json": app("@x/server-mcp", { scripts: ECHO }),
      "apps/cli-tool/package.json": app("@x/cli-tool", { marked: false, scripts: ECHO }),
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /apps\/server-mcp/);
    assert.doesNotMatch(r.stdout, /GATE-RAN:.*apps\/cli-tool/);
  });

  // Zero MCP apps is a legitimate repo shape (a monorepo of non-MCP apps), not
  // a vacuous pass: selection is by the mcp-kit dependency, not a name filter,
  // so there is no app an empty set could be hiding.
  it("SKIPS with exit 0 and a notice naming the marker when no app declares it", () => {
    const r = run({
      "apps/cli-tool/package.json": app("@x/cli-tool", { marked: false, scripts: ECHO }),
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(
      r.stdout,
      /for-each-mcp-app: no apps\/\* workspace declares @george43g\/mcp-kit — nothing to run, skipping/,
    );
    assert.doesNotMatch(r.stdout, /GATE-RAN/);
  });

  it("SKIPS with exit 0 when apps/ does not exist at all", () => {
    const r = run({});
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /nothing to run, skipping/);
  });

  it("still FAILS on a marked workspace with no package name — pnpm --filter cannot address it", () => {
    const r = run({
      "apps/nameless/package.json": JSON.stringify({
        dependencies: { "@george43g/mcp-kit": "^2.0.0" },
        scripts: ECHO,
      }),
    });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /no package name/);
  });

  it("selects an app whose name does NOT end in -mcp — the suffix is not the marker", () => {
    const r = run({
      "apps/server-mcp/package.json": app("@x/server-mcp", { scripts: ECHO }),
      "apps/plainly-named/package.json": app("@x/plainly-named", { scripts: ECHO }),
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /GATE-RAN:.*apps\/plainly-named/);
    assert.match(r.stdout, /passed for 2 MCP app\(s\)/);
  });

  it("fails when one app's run fails, naming it, after running the others", () => {
    const r = run({
      "apps/good-mcp/package.json": app("@x/good-mcp", { scripts: ECHO }),
      "apps/bad-mcp/package.json": app("@x/bad-mcp", { scripts: BOOM }),
    });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /@x\/bad-mcp: exited 3/);
    // The good app still ran — a failure must not hide the rest of the picture.
    assert.match(r.stdout, /GATE-RAN:.*apps\/good-mcp/);
  });

  it("fails when a marked app is missing the script entirely", () => {
    const r = run({
      "apps/server-mcp/package.json": app("@x/server-mcp", { scripts: ECHO }),
      "apps/second-mcp/package.json": app("@x/second-mcp", { scripts: {} }),
    });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /@x\/second-mcp: exited/);
  });

  it("FAILS with no command given rather than silently doing nothing", () => {
    const r = run({ "apps/server-mcp/package.json": app("@x/server-mcp", { scripts: ECHO }) }, []);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /no pnpm script or command given/);
  });

  it("FAILS with no command given even when there are no MCP apps — usage errors are not skips", () => {
    const r = run({}, []);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /no pnpm script or command given/);
  });
});
