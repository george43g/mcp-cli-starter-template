/**
 * 04-robustness/m1-robustness-pkg — port packages/robustness/ wholesale.
 *
 * The robustness package is the load-bearing layer of every tool cloned
 * from this template: env helpers, NDJSON logger with perf spans + ring
 * buffer + heap monitor, self-healing watchdog (event-loop + memory + idle),
 * shutdown registry, withTimeout, snapshotHealth, withRetry, TokenBucket.
 *
 * Source files live verbatim under `lib/src/**` — copied from
 * `packages/robustness/src/` and bundled into TEMPLATES at build time.
 */

import { Migration, type MigrationContext, type MigrationResult } from "../../core/migration.js";
import { TEMPLATES } from "../../generated/templates.js";

const PKG_JSON = (scope: string) => `{
  "name": "${scope}/robustness",
  "version": "0.0.0",
  "private": true,
  "description": "Domain-agnostic robustness harness for local MCP servers: env helpers, structured NDJSON logger with perf spans, self-healing watchdog (event-loop / memory / idle), shutdown registry, withTimeout, snapshotHealth, withRetry, TokenBucket.",
  "type": "module",
  "license": "MIT",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./env": {
      "types": "./dist/env.d.ts",
      "import": "./dist/env.js"
    },
    "./logger": {
      "types": "./dist/logger.d.ts",
      "import": "./dist/logger.js"
    },
    "./watchdog": {
      "types": "./dist/watchdog.d.ts",
      "import": "./dist/watchdog.js"
    },
    "./shutdown": {
      "types": "./dist/shutdown.d.ts",
      "import": "./dist/shutdown.js"
    }
  },
  "files": [
    "dist",
    "README.md"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "clean": "rm -rf dist coverage"
  },
  "devDependencies": {
    "${scope}/tsconfig": "workspace:*",
    "${scope}/vitest-config": "workspace:*",
    "@types/node": "^24.0.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
`;

const TSCONFIG_JSON = (scope: string) => `{
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

const VITEST_CONFIG = (scope: string) => `import shared from "${scope}/vitest-config/vitest.shared";

export default shared;
`;

const LIB_PREFIX = "04-robustness/lib/";

export default class RobustnessPkgMigration extends Migration {
  readonly id = "04-robustness/m1-robustness-pkg";
  readonly title = "Port packages/robustness/ (env, logger, watchdog, shutdown, …)";
  readonly appliesTo = "both" as const;

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    const scope = ctx.config.global.scope.peek() ?? "@george43g";
    const filesChanged: string[] = [];

    // Package metadata files (templated with the chosen scope).
    const metaFiles: Array<[string, string]> = [
      ["packages/robustness/package.json", PKG_JSON(scope)],
      ["packages/robustness/tsconfig.json", TSCONFIG_JSON(scope)],
      ["packages/robustness/vitest.config.ts", VITEST_CONFIG(scope)],
    ];
    for (const [path, content] of metaFiles) {
      const outcome = await ctx.fs.writeIfChanged(path, content);
      if (outcome !== "unchanged") filesChanged.push(path);
    }

    // Source files (verbatim from lib/src/**).
    for (const key of Object.keys(TEMPLATES)) {
      if (!key.startsWith(LIB_PREFIX)) continue;
      const rel = key.slice(LIB_PREFIX.length); // e.g. "src/env.ts"
      const targetPath = `packages/robustness/${rel}`;
      const outcome = await ctx.fs.writeIfChanged(targetPath, TEMPLATES[key] ?? "");
      if (outcome !== "unchanged") filesChanged.push(targetPath);
    }

    return filesChanged.length === 0
      ? { status: "noop" }
      : { status: "applied", filesChanged, notes: [`${filesChanged.length} files written`] };
  }
}
