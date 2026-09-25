/**
 * package-port — shared helper for migrations that port a packages/<name>/
 * directory wholesale: package.json + tsconfig.json + vitest.config.ts plus
 * all source files from a TEMPLATES key prefix.
 *
 * Cuts ~80 LOC of boilerplate from each per-package migration.
 */

import { TEMPLATES } from "../generated/templates.js";
import { type MigrationContext, type MigrationResult, rustAccelGenerated } from "./migration.js";
import { applyRegistryBoundary } from "./runtime-source.js";
import { requireRepoName } from "./target-inspection.js";
import { nameUpperOf, renderFeatureBlocks, substitute } from "./templating.js";
import { addRootReferences } from "./tsconfig-refs.js";

export interface PackagePortOptions {
  /** Target subdir, e.g. "packages/robustness". */
  pkgDir: string;
  /** package.json content. Omit if package.json is shipped under lib/. */
  packageJson?: (scope: string, ctx: MigrationContext) => string;
  /** tsconfig.json content. Omit if shipped under lib/. */
  tsconfig?: (scope: string) => string;
  /** vitest.config.ts content. Omit if shipped under lib/. */
  vitestConfig?: (scope: string) => string;
  /** TEMPLATES key prefix to strip — e.g. "06-mcp-kit/lib/". */
  libPrefix: string;
  /** Optional: additional inline files (rare). */
  extraFiles?: Array<[string, string]>;
  /** Extra `<!-- if:flag -->` values on top of the defaults (see templateFlags). */
  flags?: Readonly<Record<string, boolean>>;
  /** Target paths to leave unwritten (e.g. a skill already at a legacy path). */
  skip?: (targetPath: string) => boolean;
  /** Last-step rewrite of one rendered file (target path, content). */
  transform?: (targetPath: string, content: string) => string;
  /**
   * Projects to register in the root solution tsconfig.json, relative to the
   * repo root (e.g. "./packages/shared-types"). `tsc -b` only builds what the
   * root references, so a workspace left out is type-checked by nothing.
   */
  rootReferences?: readonly string[];
}

/** Flags every ported template may branch on — what this run actually generates. */
export function templateFlags(ctx: MigrationContext): Record<string, boolean> {
  return { "rust-accel": rustAccelGenerated(ctx) };
}

export async function portPackage(
  ctx: MigrationContext,
  opts: PackagePortOptions,
): Promise<MigrationResult> {
  const scope = ctx.config.global.scope.peek() ?? "@george43g";
  const filesChanged: string[] = [];
  const filesDivergent: string[] = [];

  const metaFiles: Array<[string, string]> = [];
  if (opts.packageJson) {
    metaFiles.push([`${opts.pkgDir}/package.json`, opts.packageJson(scope, ctx)]);
  }
  if (opts.tsconfig) {
    metaFiles.push([`${opts.pkgDir}/tsconfig.json`, opts.tsconfig(scope)]);
  }
  if (opts.vitestConfig) {
    metaFiles.push([`${opts.pkgDir}/vitest.config.ts`, opts.vitestConfig(scope)]);
  }
  if (opts.extraFiles) {
    metaFiles.push(...opts.extraFiles);
  }

  const recordOutcome = (path: string, outcome: import("./fs.js").WriteOutcome) => {
    if (outcome === "divergent-skipped") filesDivergent.push(path);
    else if (outcome !== "unchanged") filesChanged.push(path);
  };

  for (const [path, content] of metaFiles) {
    recordOutcome(path, await ctx.fs.writeIfChanged(path, content));
  }

  const name = requireRepoName(ctx.config);
  const vars = {
    name,
    nameUpper: nameUpperOf(name),
    scope,
  };

  const flags = { ...templateFlags(ctx), ...opts.flags };
  const prefix = opts.pkgDir === "" || opts.pkgDir === "." ? "" : `${opts.pkgDir}/`;
  for (const key of Object.keys(TEMPLATES)) {
    if (!key.startsWith(opts.libPrefix)) continue;
    const rel = key.slice(opts.libPrefix.length); // e.g. "src/index.ts"
    // Substitute placeholders in BOTH the path and the content. Paths can
    // legitimately contain `example-repo` markers (e.g. `skills/example-repo/SKILL.md`
    // → `skills/foo/SKILL.md`); content substitution is the standard case.
    const targetPath = substitute(`${prefix}${rel}`, vars);
    if (opts.skip?.(targetPath)) continue;
    // Published packages come from the registry, always. substitute() has
    // already shielded their names from scope rewriting, so this only has to
    // swap the `workspace:*` protocol for the real range — and drop tsconfig
    // references to their source directories, which do not exist here.
    const rendered = renderFeatureBlocks(
      applyRegistryBoundary(targetPath, substitute(TEMPLATES[key] ?? "", vars)),
      flags,
    );
    const content = opts.transform ? opts.transform(targetPath, rendered) : rendered;
    recordOutcome(targetPath, await ctx.fs.writeIfChanged(targetPath, content));
  }

  const notes: string[] = [];
  if (opts.rootReferences && opts.rootReferences.length > 0) {
    const current = await ctx.fs.read("tsconfig.json");
    // No root tsconfig (a dry run before 03-configs has written one): nothing
    // to register into yet.
    if (current !== undefined) {
      const next = addRootReferences(current, opts.rootReferences);
      if (next === undefined) {
        notes.push(
          `root tsconfig.json is not a solution (\`"files": []\` + \`"references"\`) — ` +
            `left alone; reference ${opts.rootReferences.join(", ")} from it by hand so ` +
            "`tsc -b` type-checks them",
        );
      } else {
        recordOutcome("tsconfig.json", await ctx.fs.writeIfChanged("tsconfig.json", next));
      }
    }
  }

  if (filesChanged.length === 0 && filesDivergent.length === 0) {
    return notes.length > 0 ? { status: "noop", notes } : { status: "noop" };
  }
  const status = ctx.dryRun ? "would-apply" : "applied";
  const verb = ctx.dryRun ? "would write" : "wrote";
  if (filesChanged.length > 0) notes.push(`${verb} ${filesChanged.length} files`);
  if (filesDivergent.length > 0) {
    notes.push(`${filesDivergent.length} divergent (preserved; pass --force to overwrite)`);
  }
  const result: MigrationResult = { status, notes };
  if (filesChanged.length > 0) result.filesChanged = filesChanged;
  if (filesDivergent.length > 0) result.filesDivergent = filesDivergent;
  return result;
}
