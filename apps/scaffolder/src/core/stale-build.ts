/**
 * Stale-build refusal for a source checkout.
 *
 * `mcp-scaffold` on PATH is usually a pnpm global link to this package, which
 * runs `dist/cli.js` — a build artifact that nothing rebuilds on `git pull`. On
 * 2026-09-24 a retrofit ran a dist/ built before three merged PRs, and
 * `--version` looked healthy throughout. A stale scaffolder writes stale files
 * into someone else's repo, so it refuses rather than warns (the same call
 * life-stack's mcpsync shim makes, with the same kind of escape hatch).
 *
 * Fires only from a source checkout: the published package ships `dist/` and
 * no `src/`, so an installed copy never sees this. `src/generated/` is skipped
 * because it is derived from `src/phases/*\/lib/` (which IS walked) and every
 * `pnpm test` rewrites it.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

export interface StaleBuild {
  /** Repo-relative path of the newest source file, e.g. `src/core/program.ts`. */
  newestFile: string;
  newestMtimeMs: number;
  distMtimeMs: number;
  pkgRoot: string;
}

/** Escape hatch: run the old binary knowingly. */
export const ALLOW_STALE_ENV = "MCP_SCAFFOLD_ALLOW_STALE";

const SOURCE_DIRS = ["src", "bin"] as const;
const SKIP = new Set(["generated", "node_modules"]);

/**
 * `entryFile` is the running entry (`dist/cli.js` when built). Returns the
 * newest source file when it is newer than the entry, else undefined —
 * including whenever the entry is not in `dist/` or there is no `src/`.
 */
export function findStaleBuild(
  entryFile: string,
  pkgRoot = dirname(dirname(entryFile)),
): StaleBuild | undefined {
  if (basename(dirname(entryFile)) !== "dist") return undefined;
  if (!existsSync(join(pkgRoot, "src"))) return undefined;
  let distMtimeMs: number;
  try {
    distMtimeMs = statSync(entryFile).mtimeMs;
  } catch {
    return undefined;
  }

  let newest: { file: string; mtimeMs: number } | undefined;
  const walk = (dir: string) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || SKIP.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const mtimeMs = statSync(full).mtimeMs;
        if (!newest || mtimeMs > newest.mtimeMs) newest = { file: full, mtimeMs };
      }
    }
  };
  for (const dir of SOURCE_DIRS) walk(join(pkgRoot, dir));

  if (!newest || newest.mtimeMs <= distMtimeMs) return undefined;
  return {
    newestFile: relative(pkgRoot, newest.file).split("\\").join("/"),
    newestMtimeMs: newest.mtimeMs,
    distMtimeMs,
    pkgRoot,
  };
}

export function staleBuildMessage(stale: StaleBuild): string {
  const at = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);
  return [
    `mcp-scaffold: STALE BUILD: ${stale.newestFile} is newer than dist/cli.js ` +
      `(${at(stale.newestMtimeMs)} > ${at(stale.distMtimeMs)} UTC) — refusing to run.`,
    `  rebuild:   pnpm --filter @george43g/mcp-scaffold build   (in ${stale.pkgRoot})`,
    `  override:  ${ALLOW_STALE_ENV}=1 mcp-scaffold …   (runs the old binary knowingly)`,
  ].join("\n");
}
