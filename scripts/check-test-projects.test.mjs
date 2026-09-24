import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { findOrphans, isTestFile } from "./check-test-projects.mjs";

/**
 * The fixture repos run the REAL script as a subprocess (copied, never
 * reimplemented) against the repo's own typescript, because what CI consumes
 * is the exit code and the message. The first fixture is the red drill: the
 * exact shape this repo had before 2026-09 — a package tsconfig that excludes
 * its tests, and nothing else that includes them.
 */

const SCRIPT = fileURLToPath(new URL("./check-test-projects.mjs", import.meta.url));
const TYPESCRIPT = join(dirname(SCRIPT), "..", "node_modules", "typescript");

const sandboxes = [];
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

function makeRepo(files) {
  const root = mkdtempSync(join(tmpdir(), "test-projects-"));
  sandboxes.push(root);
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "node_modules"));
  copyFileSync(SCRIPT, join(root, "scripts", "check-test-projects.mjs"));
  symlinkSync(TYPESCRIPT, join(root, "node_modules", "typescript"), "dir");
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ private: true, scripts: { typecheck: "tsc -b" } }),
  );
  writeFileSync(join(root, ".gitignore"), "node_modules/\n");
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(root, rel, ".."), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  execFileSync("git", ["init", "-q"], { cwd: root });
  const run = spawnSync("node", [join(root, "scripts", "check-test-projects.mjs")], {
    cwd: root,
    encoding: "utf8",
  });
  return { code: run.status, out: run.stdout + run.stderr };
}

const PKG_TSCONFIG = JSON.stringify({
  compilerOptions: { composite: true, outDir: "dist", rootDir: "src" },
  include: ["src/**/*"],
  exclude: ["src/**/*.test.ts"],
});
const SOURCES = {
  "packages/a/package.json": '{ "name": "a" }\n',
  "packages/a/src/index.ts": "export const one = 1;\n",
  "packages/a/src/index.test.ts": 'import { one } from "./index.js";\nvoid one;\n',
  "packages/a/tsconfig.json": PKG_TSCONFIG,
};

describe("check-test-projects (subprocess)", () => {
  it("fails on a test file that its package tsconfig excludes and nothing else includes", () => {
    const { code, out } = makeRepo({
      ...SOURCES,
      "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "./packages/a" }] }),
    });
    assert.equal(code, 1, out);
    assert.match(out, /packages\/a\/src\/index\.test\.ts/);
  });

  it("passes once a referenced test project includes it", () => {
    const { code, out } = makeRepo({
      ...SOURCES,
      "packages/a/tsconfig.test.json": JSON.stringify({
        compilerOptions: { composite: true, outDir: "out", rootDir: "." },
        include: ["src/**/*.test.ts"],
        references: [{ path: "./tsconfig.json" }],
      }),
      "tsconfig.json": JSON.stringify({
        files: [],
        references: [{ path: "./packages/a" }, { path: "./packages/a/tsconfig.test.json" }],
      }),
    });
    assert.equal(code, 0, out);
    assert.match(out, /1 test files/);
  });

  it("fails when the project exists but the root solution does not reference it", () => {
    const { code, out } = makeRepo({
      ...SOURCES,
      "packages/a/tsconfig.test.json": JSON.stringify({
        compilerOptions: { composite: true, outDir: "out", rootDir: "." },
        include: ["src/**/*.test.ts"],
      }),
      "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "./packages/a" }] }),
    });
    assert.equal(code, 1, out);
  });

  it("fails when the root tsconfig is a project claiming files (the pre-2026-09 shape)", () => {
    // No "files"/"include": the default include claims every file in the repo,
    // so every test file looks covered while the gate compiles none of them.
    const { code, out } = makeRepo({
      ...SOURCES,
      "tsconfig.json": JSON.stringify({ compilerOptions: { noEmit: true } }),
    });
    assert.equal(code, 1, out);
    assert.match(out, /not a solution/);
  });

  it("fails when the typecheck script is not tsc -b over the root solution", () => {
    const { code, out } = makeRepo({
      ...SOURCES,
      "packages/a/tsconfig.test.json": JSON.stringify({
        compilerOptions: { composite: true, outDir: "out", rootDir: "." },
        include: ["src/**/*.test.ts"],
      }),
      "tsconfig.json": JSON.stringify({
        files: [],
        references: [{ path: "./packages/a" }, { path: "./packages/a/tsconfig.test.json" }],
      }),
      "package.json": JSON.stringify({
        private: true,
        scripts: { typecheck: "turbo run typecheck" },
      }),
    });
    assert.equal(code, 1, out);
    assert.match(out, /tsc -b/);
  });

  it("fails (positive control) when it finds no test files at all", () => {
    const { code, out } = makeRepo({
      "packages/a/src/index.ts": "export const one = 1;\n",
      "packages/a/tsconfig.json": PKG_TSCONFIG,
      "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "./packages/a" }] }),
    });
    assert.equal(code, 1, out);
    assert.match(out, /no test files/);
  });
});

describe("isTestFile", () => {
  it("selects test files in workspaces", () => {
    for (const f of [
      "packages/robustness/src/logger.test.ts",
      "packages/tui-kit/src/viewport.test.tsx",
      "packages/shared-types/tests/drift.test.ts",
      "apps/example-repo-mcp/tests/helpers.ts",
      "apps/scaffolder/tests/golden.test.ts",
    ]) {
      assert.equal(isTestFile(f), true, f);
    }
  });

  it("skips sources, declarations, templates and files outside workspaces", () => {
    for (const f of [
      "packages/robustness/src/logger.ts",
      "apps/rust-accel/index.d.ts",
      "apps/scaffolder/src/phases/08-app/lib/tests/integration.test.ts",
      "scripts/check-test-projects.test.mjs",
      "example/apps/example/tests/integration.test.ts",
      "packages/robustness/dist/logger.test.ts",
    ]) {
      assert.equal(isTestFile(f), false, f);
    }
  });
});

describe("findOrphans", () => {
  it("returns the test files no project claims, sorted", () => {
    const claimed = new Set(["packages/a/src/b.test.ts"]);
    assert.deepEqual(
      findOrphans(
        ["packages/a/src/c.test.ts", "packages/a/src/b.test.ts", "packages/a/src/a.test.ts"],
        claimed,
      ),
      ["packages/a/src/a.test.ts", "packages/a/src/c.test.ts"],
    );
  });
});
