/**
 * 05-utility-pkgs/m2-secrets — port packages/secrets/.
 *
 * env-JSON → 1Password (opt-in) → file fallback chain. No Apple Keychain
 * in the starter template; add per-tool if needed.
 */

import { Migration, type MigrationContext, type MigrationResult } from "../../core/migration.js";
import {
  portPackage,
  standardNodeTsconfig,
  standardVitestConfig,
} from "../../core/package-port.js";

const PKG_JSON = (scope: string) => `{
  "name": "${scope}/secrets",
  "version": "0.0.0",
  "private": true,
  "description": "Pluggable secret loader: chain of env-JSON → 1Password CLI (optional) → file fallback. No Apple Keychain in the starter template — add per-tool if needed.",
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

export default class SecretsMigration extends Migration {
  readonly id = "05-utility-pkgs/m2-secrets";
  readonly title = "Port packages/secrets/ (env-JSON → 1Password → file)";
  readonly appliesTo = "both" as const;

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    return portPackage(ctx, {
      pkgDir: "packages/secrets",
      packageJson: PKG_JSON,
      tsconfig: standardNodeTsconfig,
      vitestConfig: standardVitestConfig,
      libPrefix: "05-utility-pkgs/lib/secrets/",
    });
  }
}
