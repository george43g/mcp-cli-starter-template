/**
 * 03-configs/m3-vitest-pkg — packages/vitest-config/ workspace package.
 *
 * Two presets:
 *   vitest.shared.ts — coverage target 80/70/70/70 for packages/*, plus
 *                      `withCoverageFloor()` for workspaces below it
 *   vitest.app.ts    — lower target (50/40/40/40) for apps/*
 *
 * Both preset files come from `lib/` rather than string literals in this
 * file. They contain no placeholders, so a byte mirror is possible — and once
 * it is possible it is mandatory: as inline literals they were a second copy
 * of `packages/vitest-config/*` that nothing compared against, so a change to
 * the canonical preset silently did not reach generated repos. Only
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
  "name": "${scope}/vitest-config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "license": "MIT",
  "main": "./vitest.shared.ts",
  "files": [
    "vitest.shared.ts",
    "vitest.app.ts"
  ],
  "peerDependencies": {
    "vitest": "^3.2.7"
  }
}
`;

const LIB_PREFIX = "03-configs/lib/vitest-config/";

/**
 * Fail loudly on a missing template. Falling back to "" would emit an empty
 * preset file and every generated repo would run with no coverage gate at all
 * — the precise failure this migration now exists to prevent.
 */
export function requireTemplate(name: string): string {
  const content = TEMPLATES[`${LIB_PREFIX}${name}`];
  if (content === undefined) {
    throw new Error(
      `vitest-config template "${name}" is missing from the generated TEMPLATES map. ` +
        `Run \`pnpm build:templates\` in apps/scaffolder/.`,
    );
  }
  return content;
}

export default class VitestPkgMigration extends Migration {
  readonly id = "03-configs/m3-vitest-pkg";
  readonly title = "Create packages/vitest-config/ workspace package";
  readonly appliesTo = "both" as const;

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    const scope = ctx.config.global.scope.peek() ?? "@george43g";
    const filesChanged: string[] = [];

    const files: Array<[string, string]> = [
      ["packages/vitest-config/package.json", PKG_JSON(scope)],
      ["packages/vitest-config/vitest.shared.ts", requireTemplate("vitest.shared.ts")],
      ["packages/vitest-config/vitest.app.ts", requireTemplate("vitest.app.ts")],
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
