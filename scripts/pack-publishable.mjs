#!/usr/bin/env node
/**
 * pack-publishable.mjs — `npm pack --dry-run` for every package we publish.
 *
 * CI used to hand-list the packages to pack:
 *
 *     pnpm --filter @george43g/cli-kit --filter @george43g/tui-kit exec npm pack --dry-run
 *
 * while check-publishable-manifests.mjs listed FIVE published packages. So
 * robustness, secret-store and mcp-kit shipped to npm without their tarball
 * shape ever being dry-run — and because a non-matching pnpm filter exits 0,
 * nothing could have told us (DEFERRED #52). The list now lives once, in
 * scripts/lib/publishable.mjs, and both consumers import it: the two can no
 * longer disagree.
 *
 * META-REPO ONLY, deliberately NOT stamped into scaffolded repos: a generated
 * repo publishes nothing out of `packages/` — it consumes the kits from npm —
 * so it has no publishable set to pack. Its CI packs its MCP apps instead, via
 * for-each-mcp-app.mjs, which IS stamped.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { PUBLISHABLE } from "./lib/publishable.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const dirs = [...PUBLISHABLE];

// Positive control. An empty set means the list moved or was emptied, not that
// every tarball is fine. "Nothing to pack" must not read as a pass.
if (dirs.length === 0) {
  console.error("pack-publishable: FAILED — PUBLISHABLE is empty in scripts/lib/publishable.mjs.");
  console.error("  A gate with nothing to check is a failure, not a pass.");
  process.exit(1);
}

const failed = [];
for (const dir of dirs) {
  const cwd = join(ROOT, dir);
  if (!existsSync(join(cwd, "package.json"))) {
    failed.push(`${dir}: no package.json — update PUBLISHABLE if the package moved or was removed`);
    continue;
  }
  console.log(`\n-- pack-publishable: ${dir}`);
  const run = spawnSync("npm", ["pack", "--dry-run"], { cwd, stdio: "inherit" });
  if (run.error) {
    failed.push(`${dir}: could not spawn npm (${run.error.code ?? run.error.message})`);
  } else if (run.status !== 0) {
    failed.push(`${dir}: npm pack --dry-run exited ${run.status}`);
  }
}

if (failed.length > 0) {
  console.error(`\npack-publishable: FAILED for ${failed.length} of ${dirs.length} package(s):`);
  for (const line of failed) console.error(`  • ${line}`);
  process.exit(1);
}

console.log(`\npack-publishable: ${dirs.length} publishable package(s) packed clean.`);
