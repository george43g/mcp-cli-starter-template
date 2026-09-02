import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Runs the REAL script as a subprocess against fixture repos — the script is
 * copied from this repo at test time, never reimplemented. Same pattern as
 * check-deps-stale.test.mjs, and for the same reason: the thing under test is
 * the exit code and the message, which is what CI consumes.
 *
 * Context worth keeping: this check exists because the stamped agent guide
 * said "CI grep enforces this" about the stdout-purity invariant while no
 * grep existed — here or in any descendant. The violation fixture below is
 * the red-drill: it proves the check actually goes red on the failure the
 * false sentence claimed was covered.
 */

const SCRIPT = fileURLToPath(new URL("./check-stdout-purity.mjs", import.meta.url));

const sandboxes = [];
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

function makeRepo(files) {
  const root = mkdtempSync(join(tmpdir(), "stdout-purity-"));
  sandboxes.push(root);
  mkdirSync(join(root, "scripts"));
  copyFileSync(SCRIPT, join(root, "scripts", "check-stdout-purity.mjs"));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(root, rel, ".."), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  try {
    const stdout = execFileSync("node", [join(root, "scripts", "check-stdout-purity.mjs")], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    return { status: err.status, stdout: String(err.stdout), stderr: String(err.stderr) };
  }
}

const MCP_MANIFEST = JSON.stringify({
  name: "@x/app",
  dependencies: { "@george43g/mcp-kit": "^2.0.0" },
});
const PLAIN_MANIFEST = JSON.stringify({ name: "@x/tool", dependencies: {} });

describe("check-stdout-purity", () => {
  it("fails on a console call in an MCP app's src, naming file:line", () => {
    const r = makeRepo({
      "apps/server/package.json": MCP_MANIFEST,
      "apps/server/src/index.ts": 'const x = 1;\nconsole.log("debug", x);\n',
    });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /apps\/server\/src\/index\.ts:2/);
    assert.match(r.stderr, /JSON-RPC/);
  });

  it("passes a clean MCP app, saying what it scanned", () => {
    const r = makeRepo({
      "apps/server/package.json": MCP_MANIFEST,
      "apps/server/src/index.ts": 'import { info } from "@george43g/robustness";\ninfo("ok");\n',
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /1 source files/);
    assert.match(r.stdout, /server/);
  });

  it("ignores console mentioned in comments — the invariant documents itself in prose", () => {
    const r = makeRepo({
      "apps/server/package.json": MCP_MANIFEST,
      "apps/server/src/index.ts":
        "// NEVER console.log( after connect\n/* console.error(x) is banned */\nconst y = 2;\n",
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });

  it("does not select a non-MCP app — CLI tools print to stdout legitimately", () => {
    const r = makeRepo({
      "apps/server/package.json": MCP_MANIFEST,
      "apps/server/src/index.ts": "const ok = true;\n",
      "apps/cli-tool/package.json": PLAIN_MANIFEST,
      "apps/cli-tool/src/main.ts": 'console.log("this is my actual output");\n',
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });

  it("FAILS when no MCP app exists at all — nothing-to-check is not a pass", () => {
    const r = makeRepo({
      "apps/cli-tool/package.json": PLAIN_MANIFEST,
      "apps/cli-tool/src/main.ts": "const ok = true;\n",
    });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /no apps\/\* workspace declares/);
  });

  it("FAILS on an MCP app whose src is empty — a broken walk must not read as purity", () => {
    const r = makeRepo({
      "apps/server/package.json": MCP_MANIFEST,
      "apps/server/src/.gitkeep": "",
    });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /nothing was actually checked/);
  });
});
