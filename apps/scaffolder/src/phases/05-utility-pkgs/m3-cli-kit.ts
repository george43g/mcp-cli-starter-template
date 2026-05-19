/**
 * 05-utility-pkgs/m3-cli-kit — port packages/cli-kit/.
 *
 * Commander helpers + TTY/color/output utilities + env↔flag binder +
 * interactive REPL. Building blocks for the single bin in any cloned tool.
 */

import { Migration, type MigrationContext, type MigrationResult } from "../../core/migration.js";
import {
  portPackage,
  standardNodeTsconfig,
  standardVitestConfig,
} from "../../core/package-port.js";

const PKG_JSON = (scope: string) => `{
  "name": "${scope}/cli-kit",
  "version": "0.0.0",
  "private": true,
  "description": "Commander helpers + TTY/color/output utilities + env↔flag binder + interactive REPL. Building blocks for the single bin in any tool cloned from the starter.",
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
    "cli-table3": "^0.6.5",
    "commander": "^14.0.0",
    "picocolors": "^1.1.0"
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

export default class CliKitMigration extends Migration {
  readonly id = "05-utility-pkgs/m3-cli-kit";
  readonly title = "Port packages/cli-kit/ (commander helpers + REPL + env↔flag)";
  readonly appliesTo = "both" as const;

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    return portPackage(ctx, {
      pkgDir: "packages/cli-kit",
      packageJson: PKG_JSON,
      tsconfig: standardNodeTsconfig,
      vitestConfig: standardVitestConfig,
      libPrefix: "05-utility-pkgs/lib/cli-kit/",
    });
  }
}
