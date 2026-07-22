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
import {
  portPackage,
  standardNodeTsconfig,
  standardVitestConfig,
} from "../../core/package-port.js";

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
    "@types/node": "^24.13.3",
    "typescript": "^5.7.0",
    "vitest": "^3.2.7"
  }
}
`;

export default class RobustnessPkgMigration extends Migration {
  readonly id = "04-robustness/m1-robustness-pkg";
  readonly title = "Port packages/robustness/ (env, logger, watchdog, shutdown, …)";
  readonly appliesTo = "both" as const;

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    return portPackage(ctx, {
      pkgDir: "packages/robustness",
      packageJson: PKG_JSON,
      tsconfig: standardNodeTsconfig,
      vitestConfig: standardVitestConfig,
      libPrefix: "04-robustness/lib/",
    });
  }
}
