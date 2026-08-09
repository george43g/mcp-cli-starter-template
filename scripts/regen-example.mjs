#!/usr/bin/env node

/**
 * Regenerate the scaffolder's `example/` output into a target directory.
 *
 * ONE definition, three callers:
 *   - `pnpm regen:example`                    → writes the committed `example/`
 *   - `.github/workflows/ci.yml`              → writes a tempdir and diffs it
 *   - `.github/workflows/release-packages.yml` → refreshes `example/` post-bump
 *
 * The first two used to be separate hand-synced implementations, and the CI
 * step's own comment admitted it: "the two definitions have to be kept in step
 * by hand — that is exactly how this drifted" (DEFERRED #17). Adding a third
 * copy for the release job would have made that worse, so it is extracted
 * first.
 *
 * Usage:
 *   node scripts/regen-example.mjs <target> [--build]
 *   node scripts/regen-example.mjs --prune <dir>
 *
 *   --build   Rebuild the scaffolder before generating. Required whenever the
 *             scaffolder's dist may be stale relative to the tree — notably in
 *             the release job, where `pnpm verify` built it BEFORE the version
 *             bump, so that dist embeds the old dependency ranges.
 *   --prune   Strip transient artifacts from <dir> and exit. Used on the
 *             committed side of CI's diff, which is not regenerated.
 */

import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

/** Never part of the scaffolded snapshot; present only after a build/install. */
const TRANSIENT = new Set([".git", "node_modules", "dist", ".turbo", "coverage"]);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: ROOT,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}`);
  }
}

/**
 * Remove build/VCS leftovers so two trees can be compared for content.
 *
 * `.git` matters more than it looks: the scaffolder's git-init phase runs in a
 * fresh directory but skips inside the parent repo, so a tempdir gets one and
 * the committed `example/` does not.
 */
async function prune(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (TRANSIENT.has(entry.name) || entry.name.endsWith(".tsbuildinfo")) {
      rmSync(path, { recursive: true, force: true });
      continue;
    }
    if (entry.isDirectory()) await prune(path);
  }
}

/**
 * Generate usage(1) artifacts inside the scaffolded app.
 *
 * `MISE_TRUSTED_CONFIG_PATHS` is not optional: a tempdir lives outside the
 * repo's trusted workspace, so mise refuses to read the freshly-scaffolded
 * `mise.toml` without explicit consent, and the task silently does not run.
 */
function generateUsageArtifacts(target) {
  const appDir = join(target, "apps/example-mcp");
  const env = { ...process.env, MISE_TRUSTED_CONFIG_PATHS: target };
  for (const task of ["docs", "completions", "manpage"]) {
    run("mise", ["run", "--cd", appDir, task], { env });
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "--prune") {
    const dir = args[1];
    if (!dir) throw new Error("Usage: regen-example.mjs --prune <dir>");
    await prune(resolve(ROOT, dir));
    return;
  }

  const target = args.find((a) => !a.startsWith("--"));
  if (!target) throw new Error("Usage: regen-example.mjs <target> [--build]");
  const targetAbs = resolve(ROOT, target);

  if (args.includes("--build")) {
    run("pnpm", ["--filter", "@george43g/mcp-scaffold", "build"]);
  }

  // The scaffolder refuses to write into a non-empty directory, and the
  // committed `example/` is always non-empty on a re-run.
  if (existsSync(targetAbs)) rmSync(targetAbs, { recursive: true, force: true });

  // `--no-install` is load-bearing, not a speed-up: `example/` is a committed
  // snapshot rather than a working repo, so installing would produce a
  // pnpm-lock.yaml the committed copy does not have and the CI sync check
  // would fail on a repo that is perfectly in sync.
  run("node", [
    join(ROOT, "apps/scaffolder/dist/cli.js"),
    "init",
    targetAbs,
    "--name",
    "example",
    "--no-banner",
    "--no-install",
  ]);

  // Intentionally stripped from the committed reference: a nested biome.json
  // is picked up by the parent Biome as a competing root config.
  rmSync(join(targetAbs, "biome.json"), { force: true });

  generateUsageArtifacts(targetAbs);
  await prune(targetAbs);
}

await main();
