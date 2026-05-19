/**
 * 03-configs/m3-vitest-pkg — packages/vitest-config/ workspace package.
 *
 * Two presets:
 *   vitest.shared.ts — high coverage thresholds (80/70/70/70) for packages/*
 *   vitest.app.ts    — lower thresholds (50/40/40/40) for apps/*
 */

import {
  appliedStatus,
  Migration,
  type MigrationContext,
  type MigrationResult,
} from "../../core/migration.js";

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
    "vitest": "^2.0.0"
  }
}
`;

const SHARED_TS = `import { defineConfig } from "vitest/config";

/**
 * Shared Vitest preset for \`packages/*\` (library code).
 *
 * Higher coverage thresholds — library code is reusable, so it earns
 * stricter coverage gates than app code.
 *
 * Usage: extend with \`mergeConfig(shared, { ... })\` in each package's
 * \`vitest.config.ts\`, or import this directly if no overrides are needed.
 */
export const shared = defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.turbo/**"],
    reporters: process.env.CI ? ["default", "junit"] : ["default"],
    outputFile: {
      junit: "./coverage/junit.xml",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts", "src/**/index.ts", "src/**/types.ts"],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 70,
        lines: 70,
      },
    },
  },
});

export default shared;
`;

const APP_TS = `import { defineConfig, mergeConfig } from "vitest/config";
import { shared } from "./vitest.shared.ts";

/**
 * Vitest preset for \`apps/*\` (orchestration code).
 *
 * Lower coverage thresholds than \`packages/*\` — apps mostly stitch
 * library calls together, so the threshold targets integration tests
 * exercising the dispatch and CLI paths rather than every branch.
 */
export const app = mergeConfig(
  shared,
  defineConfig({
    test: {
      coverage: {
        thresholds: {
          statements: 50,
          branches: 40,
          functions: 40,
          lines: 40,
        },
      },
    },
  }),
);

export default app;
`;

export default class VitestPkgMigration extends Migration {
  readonly id = "03-configs/m3-vitest-pkg";
  readonly title = "Create packages/vitest-config/ workspace package";
  readonly appliesTo = "both" as const;

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    const scope = ctx.config.global.scope.peek() ?? "@george43g";
    const filesChanged: string[] = [];

    const files: Array<[string, string]> = [
      ["packages/vitest-config/package.json", PKG_JSON(scope)],
      ["packages/vitest-config/vitest.shared.ts", SHARED_TS],
      ["packages/vitest-config/vitest.app.ts", APP_TS],
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
