/**
 * package-port — shared helper for migrations that port a packages/<name>/
 * directory wholesale: package.json + tsconfig.json + vitest.config.ts plus
 * all source files from a TEMPLATES key prefix.
 *
 * Cuts ~80 LOC of boilerplate from each per-package migration.
 */

import { TEMPLATES } from "../generated/templates.js";
import type { MigrationContext, MigrationResult } from "./migration.js";

export interface PackagePortOptions {
  /** Target subdir, e.g. "packages/robustness". */
  pkgDir: string;
  /** package.json content (a function that returns the string given the scope). */
  packageJson: (scope: string) => string;
  /** tsconfig.json content. Most packages use the node.json shape. */
  tsconfig: (scope: string) => string;
  /** vitest.config.ts content. Most packages just re-export the shared preset. */
  vitestConfig: (scope: string) => string;
  /** TEMPLATES key prefix to strip — e.g. "05-utility-pkgs/lib/env-loader/". */
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

  const metaFiles: Array<[string, string]> = [
    [`${opts.pkgDir}/package.json`, opts.packageJson(scope)],
    [`${opts.pkgDir}/tsconfig.json`, opts.tsconfig(scope)],
    [`${opts.pkgDir}/vitest.config.ts`, opts.vitestConfig(scope)],
    ...(opts.extraFiles ?? []),
  ];

  for (const [path, content] of metaFiles) {
    const outcome = await ctx.fs.writeIfChanged(path, content);
    if (outcome !== "unchanged") filesChanged.push(path);
  }

  for (const key of Object.keys(TEMPLATES)) {
    if (!key.startsWith(opts.libPrefix)) continue;
    const rel = key.slice(opts.libPrefix.length); // e.g. "src/index.ts"
    const targetPath = `${opts.pkgDir}/${rel}`;
    const outcome = await ctx.fs.writeIfChanged(targetPath, TEMPLATES[key] ?? "");
    if (outcome !== "unchanged") filesChanged.push(targetPath);
  }

  return filesChanged.length === 0
    ? { status: "noop" }
    : { status: "applied", filesChanged, notes: [`${filesChanged.length} files written`] };
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
