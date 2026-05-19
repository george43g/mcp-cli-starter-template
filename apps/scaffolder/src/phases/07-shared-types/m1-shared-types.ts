/**
 * 07-shared-types/m1-shared-types — port packages/shared-types/.
 *
 * Zod schemas + hand-mirrored Rust structs. Includes a drift-check test
 * (under `tests/`, not `src/`) that parses apps/rust-accel/src/types.rs
 * and fails CI if field names diverge.
 */

import { Migration, type MigrationContext, type MigrationResult } from "../../core/migration.js";
import { portPackage } from "../../core/package-port.js";

const PKG_JSON = (scope: string) => `{
  "name": "${scope}/shared-types",
  "version": "0.0.0",
  "private": true,
  "description": "Zod schemas + hand-mirrored Rust structs for cross-language tool I/O. Includes a drift-check test that parses apps/rust-accel/src/types.rs and fails CI if field names diverge.",
  "type": "module",
  "license": "MIT",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "clean": "rm -rf dist coverage"
  },
  "dependencies": {
    "zod": "^3.23.0",
    "zod-to-json-schema": "^3.25.0"
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

// Custom tsconfig — excludes both src/**/*.test.ts AND tests/** (drift test).
const TSCONFIG = (scope: string) => `{
  "extends": "${scope}/tsconfig/node.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "noEmit": false
  },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts", "tests/**", "node_modules", "dist"]
}
`;

// Custom vitest.config.ts — needs to pick up tests/ in addition to src/**.
const VITEST_CONFIG = (scope: string) => `import shared from "${scope}/vitest-config/vitest.shared";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  shared,
  defineConfig({
    test: {
      include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    },
  }),
);
`;

export default class SharedTypesMigration extends Migration {
  readonly id = "07-shared-types/m1-shared-types";
  readonly title = "Port packages/shared-types/ (Zod schemas + Rust drift-check)";
  readonly appliesTo = "both" as const;

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    return portPackage(ctx, {
      pkgDir: "packages/shared-types",
      packageJson: PKG_JSON,
      tsconfig: TSCONFIG,
      vitestConfig: VITEST_CONFIG,
      libPrefix: "07-shared-types/lib/",
    });
  }
}
