/**
 * 05-utility-pkgs/m1-env-loader — port packages/env-loader/.
 *
 * Vite-style .env precedence loader in plain Node. Used by tools that need
 * to read env vars BEFORE spawning a subprocess (e.g. the dev MCP proxy).
 */

import { Migration, type MigrationContext, type MigrationResult } from "../../core/migration.js";
import {
  portPackage,
  standardNodeTsconfig,
  standardVitestConfig,
} from "../../core/package-port.js";

const PKG_JSON = (scope: string) => `{
  "name": "${scope}/env-loader",
  "version": "0.0.0",
  "private": true,
  "description": "Vite-style .env precedence loader in plain Node. Use when you need to read env vars before spawning a subprocess (e.g. the dev MCP proxy).",
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
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
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

export default class EnvLoaderMigration extends Migration {
  readonly id = "05-utility-pkgs/m1-env-loader";
  readonly title = "Port packages/env-loader/";
  readonly appliesTo = "both" as const;

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    return portPackage(ctx, {
      pkgDir: "packages/env-loader",
      packageJson: PKG_JSON,
      tsconfig: standardNodeTsconfig,
      vitestConfig: standardVitestConfig,
      libPrefix: "05-utility-pkgs/lib/env-loader/",
    });
  }
}
