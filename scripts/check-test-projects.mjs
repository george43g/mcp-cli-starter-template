#!/usr/bin/env node
/**
 * check-test-projects.mjs — every workspace test file belongs to a TypeScript
 * project that the root solution builds.
 *
 * WHY THIS EXISTS. Until 2026-09 every package tsconfig excluded
 * `src/**\/*.test.ts` and no other project picked those files up, so 46 type
 * errors sat in test files that no gate had ever compiled — 23 of them in one
 * watchdog test. Vitest strips types without checking them, so a test file
 * outside every project is type-checked by nothing, silently. The fix was a
 * `tsconfig.test.json` per package, referenced from the root `tsconfig.json`
 * and built by `pnpm typecheck` (`tsc -b`). This check is what keeps the next
 * test file — or the next package — from falling back outside.
 *
 * MECHANISM, and why it is not a walker of its own: `tsc --showConfig` already
 * resolves a project's `extends`/`include`/`exclude` into the exact list of
 * root files, and prints its `references`. This script walks the reference
 * graph from the root solution with it, unions the files, and diffs that
 * against the test files on disk. TypeScript stays the authority on what a
 * project contains.
 *
 * SCOPE. A test file is any .ts/.tsx/.mts/.cts under `apps/<name>/` or
 * `packages/<name>/` whose basename carries `.test.`/`.spec.` or that sits
 * under a `tests/` directory. The scaffolder's `src/phases/<NN>/lib/` trees are
 * excluded: they are template text, type-checked through the regenerated
 * `example/` instead. Files come from git (tracked plus untracked-but-not-
 * ignored), so a brand-new test file counts before it is committed.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TS_EXT = /\.(ts|tsx|mts|cts)$/;
const TEST_NAME = /\.(test|spec)\.[cm]?tsx?$/;
const TEMPLATE_DIR = /^apps\/scaffolder\/src\/phases\/[^/]+\/lib\//;

/** Repo-relative, forward-slash path → is it a workspace test file in scope? */
export function isTestFile(rel) {
  if (!/^(apps|packages)\/[^/]+\//.test(rel)) return false;
  if (!TS_EXT.test(rel) || rel.endsWith(".d.ts")) return false;
  if (TEMPLATE_DIR.test(rel)) return false;
  if (/(^|\/)(node_modules|dist|coverage)\//.test(rel)) return false;
  return TEST_NAME.test(rel) || /\/tests\//.test(rel);
}

/** Test files no project claims, sorted. */
export function findOrphans(testFiles, projectFiles) {
  return testFiles.filter((f) => !projectFiles.has(f)).sort();
}

/** A reference `path` may name a directory (implying tsconfig.json) or a file. */
function configPathOf(fromConfig, refPath) {
  const target = resolve(dirname(fromConfig), refPath);
  return existsSync(target) && statSync(target).isDirectory()
    ? join(target, "tsconfig.json")
    : target;
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const rel = (abs) => relative(root, abs).split("\\").join("/");
  let tsc;
  try {
    tsc = createRequire(join(root, "package.json")).resolve("typescript/bin/tsc");
  } catch {
    console.error("check-test-projects: typescript is not installed — run `pnpm install`.");
    process.exit(2);
  }
  const showConfig = (config) =>
    JSON.parse(
      execFileSync(process.execPath, [tsc, "--showConfig", "-p", config], {
        cwd: root,
        encoding: "utf8",
      }),
    );

  // THE PREMISE: "reachable from the root solution" only means "type-checked"
  // if the gate builds exactly that solution. Before 2026-09 the root
  // tsconfig.json was itself a project whose default include claimed every
  // file in the repo, while `pnpm typecheck` never compiled it — so every
  // test file looked covered and none was. Both halves are asserted, or this
  // check would pass on the very shape it exists to catch.
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const typecheck = manifest.scripts?.typecheck ?? "";
  if (!/(^|&&\s*|;\s*)tsc -b\s*$/.test(typecheck.trim())) {
    console.error(
      `check-test-projects: the root \`typecheck\` script is ${JSON.stringify(typecheck)}; ` +
        "it must end in a bare `tsc -b` (build the root solution), or reaching a project " +
        "from tsconfig.json proves nothing is type-checked.",
    );
    process.exit(1);
  }

  const rootConfig = join(root, "tsconfig.json");
  const rootFiles = existsSync(rootConfig) ? (showConfig(rootConfig).files ?? []) : [];
  if (rootFiles.length > 0) {
    console.error(
      `check-test-projects: the root tsconfig.json is a project claiming ${rootFiles.length} ` +
        'files, not a solution. Give it `"files": []` and reference each workspace project, ' +
        "so each file is checked by the project an editor uses for it.",
    );
    process.exit(1);
  }

  const projectFiles = new Set();
  const seen = new Set();
  const queue = [rootConfig];
  while (queue.length > 0) {
    const config = queue.shift();
    if (seen.has(config)) continue;
    seen.add(config);
    if (!existsSync(config)) {
      console.error(`check-test-projects: ${rel(config)} is referenced but does not exist.`);
      process.exit(1);
    }
    const shown = showConfig(config);
    for (const f of shown.files ?? []) projectFiles.add(rel(resolve(dirname(config), f)));
    for (const ref of shown.references ?? []) queue.push(configPathOf(config, ref.path));
  }

  const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  });
  const testFiles = [...new Set(listed.split("\n").filter(isTestFile))].filter((f) =>
    existsSync(join(root, f)),
  );

  // POSITIVE CONTROL: zero test files means the matcher or the listing broke,
  // and "nothing orphaned" is the reassuring reading — so it must fail.
  if (testFiles.length === 0) {
    console.error("check-test-projects: found no test files at all — the matcher is broken.");
    process.exit(1);
  }

  const orphans = findOrphans(testFiles, projectFiles);
  if (orphans.length > 0) {
    console.error(
      `check-test-projects: ${orphans.length} test file(s) belong to no TypeScript project ` +
        "reachable from the root tsconfig.json, so nothing type-checks them:",
    );
    for (const f of orphans) console.error(`  ${f}`);
    console.error(
      "\nAdd them to the workspace's tsconfig.test.json (packages) or tsconfig.json (apps) " +
        "`include`, and make sure the root tsconfig.json references that project.",
    );
    process.exit(1);
  }
  console.log(
    `check-test-projects: ${testFiles.length} test files, all in one of ${seen.size} projects ` +
      "reachable from tsconfig.json.",
  );
}

// realpath: on macOS a tmpdir path under /var resolves to /private/var in import.meta.url.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
