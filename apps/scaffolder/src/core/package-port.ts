/**
 * package-port — shared helper for migrations that port a packages/<name>/
 * directory wholesale: package.json + tsconfig.json + vitest.config.ts plus
 * all source files from a TEMPLATES key prefix.
 *
 * Cuts ~80 LOC of boilerplate from each per-package migration.
 */

import { TEMPLATES } from "../generated/templates.js";
import type { MigrationContext, MigrationResult } from "./migration.js";
import { runtimeDependencyRange, runtimePackageName } from "./runtime-source.js";
import { requireRepoName } from "./target-inspection.js";
import { nameUpperOf, substitute } from "./templating.js";

export interface PackagePortOptions {
  /** Target subdir, e.g. "packages/robustness". */
  pkgDir: string;
  /** package.json content. Omit if package.json is shipped under lib/. */
  packageJson?: (scope: string, ctx: MigrationContext) => string;
  /** tsconfig.json content. Omit if shipped under lib/. */
  tsconfig?: (scope: string) => string;
  /** vitest.config.ts content. Omit if shipped under lib/. */
  vitestConfig?: (scope: string) => string;
  /** TEMPLATES key prefix to strip — e.g. "05-utility-pkgs/lib/cli-kit/". */
  libPrefix: string;
  /** Optional: additional inline files (rare). */
  extraFiles?: Array<[string, string]>;
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
    runtimePackage: runtimePackageName(ctx, scope),
    runtimeVersion: runtimeDependencyRange(ctx),
  };

  const prefix = opts.pkgDir === "" || opts.pkgDir === "." ? "" : `${opts.pkgDir}/`;
  for (const key of Object.keys(TEMPLATES)) {
    if (!key.startsWith(opts.libPrefix)) continue;
    const rel = key.slice(opts.libPrefix.length); // e.g. "src/index.ts"
    // Substitute placeholders in BOTH the path and the content. Paths can
    // legitimately contain `example-repo` markers (e.g. `skills/example-repo/SKILL.md`
    // → `skills/foo/SKILL.md`); content substitution is the standard case.
    const targetPath = substitute(`${prefix}${rel}`, vars);
    let content = substitute(TEMPLATES[key] ?? "", vars);
    if (ctx.config.global.runtimeSource.peek() === "registry") {
      content = content.replace(
        `"${vars.runtimePackage}": "workspace:*"`,
        `"${vars.runtimePackage}": "${vars.runtimeVersion}"`,
      );
    }
    recordOutcome(targetPath, await ctx.fs.writeIfChanged(targetPath, content));
  }

  if (filesChanged.length === 0 && filesDivergent.length === 0) {
    return { status: "noop" };
  }
  const status = ctx.dryRun ? "would-apply" : "applied";
  const verb = ctx.dryRun ? "would write" : "wrote";
  const notes: string[] = [];
  if (filesChanged.length > 0) notes.push(`${verb} ${filesChanged.length} files`);
  if (filesDivergent.length > 0) {
    notes.push(`${filesDivergent.length} divergent (preserved; pass --force to overwrite)`);
  }
  const result: MigrationResult = { status, notes };
  if (filesChanged.length > 0) result.filesChanged = filesChanged;
  if (filesDivergent.length > 0) result.filesDivergent = filesDivergent;
  return result;
}

/** Standard tsconfig.json for a node-target package (most common). */
export const standardNodeTsconfig = (scope: string): string => `{
  "extends": "${scope}/tsconfig/node.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "noEmit": false
  },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts", "node_modules", "dist"]
}
`;

/** Standard tsconfig.json for a react/JSX package. */
export const standardReactTsconfig = (scope: string): string => `{
  "extends": "${scope}/tsconfig/react.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "noEmit": false
  },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts", "src/**/*.test.tsx", "node_modules", "dist"]
}
`;

/** Standard vitest.config.ts (re-exports the shared preset). */
export const standardVitestConfig = (scope: string): string =>
  `import shared from "${scope}/vitest-config/vitest.shared";\n\nexport default shared;\n`;
