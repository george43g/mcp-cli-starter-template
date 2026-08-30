#!/usr/bin/env node
/**
 * Every turbo task that RUNS tests must depend on `build`, not only `^build`.
 *
 * WHY THIS EXISTS — a bug found twice in one hour, in sibling tasks.
 *
 * `^build` builds a package's DEPENDENCIES. It does not build the package
 * itself. So a test that exercises its own built bin (see
 * `apps/<app>/tests/log-prefix.test.ts`, which spawns `dist/cli.js`) passes on any
 * machine where a previous manual build left `dist/` lying around, and fails in
 * a fresh clone.
 *
 * It failed in the scaffolder E2E smoke. I fixed `test` — and did not look at
 * its siblings. `test:coverage` still declared `["^build"]`, so the very next
 * release job died on `@george43g/example-repo-mcp#test:coverage`, in a fresh
 * checkout, after every PR check had gone green. Nothing published; the release
 * chain skipped every downstream package.
 *
 * The lesson is the one this repo keeps relearning: **enumerate from the
 * system, not from the instance you happened to notice.** A hand-fix of one
 * task is a hand-written list of one.
 *
 * `stress` is exempt from the `^build` half only — it already declares
 * `["build"]`, which is the property being asserted.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

/** All three surfaces. Canonical, the scaffolder's generator output, and the tracked example. */
const SURFACES = [
  "turbo.json",
  "example/turbo.json",
  "apps/scaffolder/src/phases/03-configs/m4-turbo-full.ts",
];

/** A task RUNS tests if its name starts with one of these. */
const RUNS_TESTS = /^(test|stress)/;

/**
 * turbo.json is JSONC and the generator embeds it in TypeScript, so neither is
 * reliably `JSON.parse`-able. Match the shape textually instead — the property
 * being asserted is local to each task block, so this does not need a parser.
 */
function taskDeps(text) {
  const out = [];
  const re = /"([a-z][a-z0-9:-]*)":\s*\{(?:[^{}]|\{[^{}]*\})*?"dependsOn":\s*\[([^\]]*)\]/g;
  for (const m of text.matchAll(re)) {
    out.push({ task: m[1], deps: m[2].split(",").map((d) => d.trim().replace(/^"|"$/g, "")) });
  }
  return out;
}

const failures = [];
let checked = 0;

for (const rel of SURFACES) {
  let text;
  try {
    text = readFileSync(join(ROOT, rel), "utf8");
  } catch {
    failures.push(`${rel}: could not be read. If the file moved, update SURFACES in this script.`);
    continue;
  }
  const tasks = taskDeps(text).filter((t) => RUNS_TESTS.test(t.task));
  if (tasks.length === 0) {
    // POSITIVE CONTROL. Zero matches means the parser broke, not that the file
    // is clean — and "clean" is the reassuring reading, so it must fail.
    failures.push(
      `${rel}: found no test-running tasks at all. The matcher broke, or the file changed shape.`,
    );
    continue;
  }
  for (const { task, deps } of tasks) {
    checked++;
    if (!deps.includes("build")) {
      failures.push(
        `${rel}: task "${task}" declares dependsOn ${JSON.stringify(deps)} — missing "build".\n` +
          `    "^build" builds DEPENDENCIES, not this package. A test that spawns its own\n` +
          `    dist/ will pass where a stale build exists and fail in a fresh clone.\n` +
          `    Fix: add "build" alongside "^build".`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("✗ turbo test-task check failed:\n");
  for (const f of failures) console.error(`  • ${f}\n`);
  process.exit(1);
}

console.log(
  `turbo test-task check passed (${checked} test-running tasks across ${SURFACES.length} surfaces).`,
);
