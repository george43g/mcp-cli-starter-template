/**
 * 03-configs/m5-build-config-pkg — packages/build-config/ workspace package.
 *
 * Ships the build-identity stamp: `<semver>+<count>.<sha>[.dirty.<MMDDTHHmm>]`,
 * so "is the artifact running the one I just built?" is a fact rather than a
 * guess. Semver only moves on release, so every build between two releases is
 * otherwise indistinguishable.
 *
 * WHY IT IS A PRIVATE WORKSPACE PACKAGE AND NOT A PUBLISHED KIT EXPORT
 *
 * Vite's `define` is compile-time textual substitution over modules Vite
 * BUNDLES. Generated apps list the scope prefix in `rollupOptions.external`
 * and install the kits from npm, so a reader exported from a published package
 * would reference a `__BUILD_STAMP__` that is never substituted — and it would
 * degrade to a plausible-looking fallback rather than erroring. The reader has
 * to live in the consuming app's own bundled graph.
 *
 * `build-stamp.mjs` comes from `lib/` rather than a string literal here: it has
 * no placeholders, so a byte mirror is possible — and once possible it is
 * mandatory, or the canonical copy and the generated one drift silently. Only
 * package.json stays inline, because its scope is substituted.
 */

import {
  appliedStatus,
  Migration,
  type MigrationContext,
  type MigrationResult,
} from "../../core/migration.js";
import { TEMPLATES } from "../../generated/templates.js";

const PKG_JSON = (scope: string) => `{
  "name": "${scope}/build-config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "license": "MIT",
  "description": "Build-time identity stamp for Vite \`define\`. Never published — see README.",
  "main": "./build-stamp.mjs",
  "bin": {
    "build-stamp": "./build-stamp.mjs"
  },
  "files": [
    "build-stamp.mjs"
  ]
}
`;

const LIB_PREFIX = "03-configs/lib/build-config/";

/**
 * Fail loudly on a missing template. Falling back to "" would emit an empty
 * module, and every generated app's `vite.config.ts` would fail to import
 * `buildDefines` — better than a silent stamp of "undefined", but the error
 * should name the cause.
 */
function requireTemplate(name: string): string {
  const content = TEMPLATES[`${LIB_PREFIX}${name}`];
  if (content === undefined) {
    throw new Error(
      `build-config template "${name}" is missing from the generated TEMPLATES map. ` +
        `Run \`pnpm build:templates\` in apps/scaffolder/.`,
    );
  }
  return content;
}

export default class BuildConfigPkgMigration extends Migration {
  readonly id = "03-configs/m5-build-config-pkg";
  readonly title = "Create packages/build-config/ workspace package";
  readonly appliesTo = "both" as const;

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    const scope = ctx.config.global.scope.peek() ?? "@george43g";
    const filesChanged: string[] = [];

    const files: Array<[string, string]> = [
      ["packages/build-config/package.json", PKG_JSON(scope)],
      ["packages/build-config/build-stamp.mjs", requireTemplate("build-stamp.mjs")],
    ];

    for (const [path, content] of files) {
      const outcome = await ctx.fs.writeIfChanged(path, content);
      if (outcome !== "unchanged") filesChanged.push(path);
    }

    return filesChanged.length === 0
      ? { status: "noop" }
      : { status: appliedStatus(ctx.dryRun), filesChanged };
  }
}
