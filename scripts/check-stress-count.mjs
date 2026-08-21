#!/usr/bin/env node

/**
 * The stress harness's assertion count must match every place that quotes it.
 *
 * The number was correct when written and then drifted: two cases were added,
 * the harness printed `15 passed` and 19 prose sites still said 13, across four
 * mirrored surfaces (canonical, the scaffolder's `lib/` copies, `example/`, and
 * the skills). Nothing caught it, in a repo whose whole thesis is that agents
 * trust the docs. DEFERRED #40.
 *
 * The source of truth is `EXPECTED_ASSERTIONS` in the canonical harness, which
 * the harness itself asserts against its actual run — so the chain is
 * `results.length` -> constant -> prose, and breaking any link fails a check
 * rather than quietly publishing a wrong number.
 *
 * Records are exempt BY FILE, not by line: a dated "13 of 13 assertions passed"
 * is a true statement about a run that really had 13. Rewriting it to 15 would
 * falsify a history entry in order to fix a label — the opposite of the point.
 */

import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

const HARNESS = "apps/example-repo-mcp/scripts/stress-mcp.ts";

/** Never walked: generated output, dependencies, build artefacts. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".turbo",
  "dist",
  "coverage",
  "target",
  "man",
  "completions",
]);

/**
 * Append-only records and backlog prose. These describe what a past run did or
 * what a past defect was, so a stale number in them is accurate history.
 */
const RECORD_FILES = new Set([
  "DEFERRED.md",
  "HANDOFF.md",
  // This repo's own state doc, which is dated verification evidence throughout
  // ("13 of 13 assertions passed" was true of that run). NOT the template of
  // the same name under 10-docs-readme/lib/, nor its example/ regeneration:
  // those are live labels a generated repo reads as current, so they are
  // checked like any other prose.
  "docs/PROJECT_STATE.md",
  // A dated narrative of one incident ("...all passed"), not a live label.
  "docs/scaffolder-cli/field-notes.md",
  // The checker and its tests quote wrong numbers ON PURPOSE — the tests'
  // fixtures are stale counts, and this file's own docblock explains the drift
  // it was written for. Exempting them is not a loophole: a checker that
  // flagged its own fixtures could never be tested against a failing case.
  "scripts/check-stress-count.mjs",
  "scripts/check-stress-count.test.mjs",
]);

const TEXT_EXT = /\.(md|mdx|ts|tsx|mts|mjs|js|yml|yaml|toml|json|txt)$/;
const COUNT = /(\d+)[\s-]assertions?\b/g;

export function expectedFromHarness(fromRoot = root) {
  const src = readFileSync(join(fromRoot, HARNESS), "utf8");
  const m = src.match(/^const EXPECTED_ASSERTIONS = (\d+);$/m);
  if (!m) {
    console.error(
      `✗ ${HARNESS} has no \`const EXPECTED_ASSERTIONS = <n>;\` — nothing to check against.`,
    );
    process.exit(1);
  }
  return Number(m[1]);
}

function* walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    // lstat, and skip symlinks: CLAUDE.md and .cursorrules point at AGENTS.md,
    // so following them reports one stale line three times and sends the reader
    // to a file whose fix is a no-op.
    const st = lstatSync(full, { throwIfNoEntry: false });
    if (!st || st.isSymbolicLink()) continue;
    if (st.isDirectory()) yield* walk(full);
    else if (TEXT_EXT.test(name)) yield full;
  }
}

/**
 * Scan `root` for assertion-count references and compare each against the
 * harness constant. Exported so the tests can drive it over fixtures instead of
 * over this repo — a checker whose only test is "it passes here" cannot tell a
 * working scan from a broken one.
 */
export function scanAssertionCounts(root, expected) {
  const failures = [];
  let scanned = 0;
  let sitesChecked = 0;

  for (const full of walk(root)) {
    const rel = relative(root, full);
    if (RECORD_FILES.has(rel)) continue;
    scanned++;
    const lines = readFileSync(full, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const m of line.matchAll(COUNT)) {
        sitesChecked++;
        if (Number(m[1]) !== expected) {
          failures.push(`${rel}:${i + 1}: says "${m[0]}", harness says ${expected}`);
        }
      }
    });
  }

  return { failures, scanned, sitesChecked };
}

/** Floors below which a green result means "the scan broke", not "the docs are fine". */
export const MIN_FILES = 50;
export const MIN_SITES = 10;

function main() {
  const expected = expectedFromHarness(root);
  const { failures, scanned, sitesChecked } = scanAssertionCounts(root, expected);

  // A scan that finds nothing is indistinguishable from a passing scan. Both
  // bounds are asserted: the walk must reach the tree, and it must find the
  // prose sites the harness is quoted in.
  if (scanned < MIN_FILES) {
    console.error(`✗ walked only ${scanned} files — the scan is broken, not the docs.`);
    process.exit(1);
  }
  if (sitesChecked < MIN_SITES) {
    console.error(
      `✗ found only ${sitesChecked} assertion-count references — the pattern is broken, not the docs.`,
    );
    process.exit(1);
  }

  if (failures.length > 0) {
    console.error(
      `✗ ${failures.length} stale assertion count(s). The harness is the source of truth.\n`,
    );
    for (const f of failures) console.error(`  ${f}`);
    console.error(
      `\nFix: update each site to ${expected}, or change EXPECTED_ASSERTIONS in ${HARNESS}` +
        ` if the harness really gained or lost a case (and mirror it into the scaffolder lib/ copy` +
        ` plus \`pnpm regen:example\`).`,
    );
    process.exit(1);
  }

  console.log(
    `stress assertion count check passed (${sitesChecked} references across ${scanned} files all say ${expected}).`,
  );
}

// Only run when invoked directly, so importing it in a test does not scan.
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main();
}
