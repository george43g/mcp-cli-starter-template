/**
 * 12-ci-release/m1-ci-release — port .github/workflows + release configs.
 *
 * Lands:
 *   - .github/workflows/ci.yml — matrix ubuntu+macos, lint + typecheck +
 *     test + test:no-native + build + npm pack --dry-run + stress.
 *   - .github/workflows/release-tokens.yml — PR title+body cannot carry a
 *     release-control token. Separate from ci.yml because it needs the
 *     `edited` trigger; runs scripts/check-release-tokens.mjs, which phase 10
 *     stamps alongside it.
 *   - .github/workflows/release.yml — semantic-release pipeline. SHIPS DISABLED
 *     (the `on:` trigger is commented out). The user uncomments + adds
 *     NPM_TOKEN secret to enable.
 *   - .github/workflows/readme-check.yml — fails CI if src/** changed without
 *     a README.md update. Bypass with [skip-readme] in commit/PR title.
 *   - .github/workflows/screenshots.yml — installs vhs, runs .tape files,
 *     commits regenerated GIFs back.
 *   - .releaserc.json — semantic-release config (Keep-a-Changelog).
 *   - .npmignore — root-level (apps/packages each have their own).
 */

import { Migration, type MigrationContext, type MigrationResult } from "../../core/migration.js";
import { portPackage } from "../../core/package-port.js";

export default class CiReleaseMigration extends Migration {
  readonly id = "12-ci-release/m1-ci-release";
  readonly title = "Port .github/workflows + .releaserc.json + .npmignore";
  readonly appliesTo = "both" as const;

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    return portPackage(ctx, { pkgDir: "", libPrefix: "12-ci-release/lib/" });
  }
}
