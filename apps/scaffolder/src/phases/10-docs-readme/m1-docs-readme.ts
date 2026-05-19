/**
 * 10-docs-readme/m1-docs-readme — port docs/ + README.md + LICENSE + llms-install.md.
 *
 * Lays down the full documentation scaffold the user will customize:
 *   - docs/ — Mintlify config (docs.json) + MDX pages (introduction,
 *     installation, quickstart, surfaces/*, internals/*) + the canonical
 *     markdown reference (ARCHITECTURE.md, HTTP_MODE.md, RUST_ACCELERATION.md,
 *     TUI_DESIGN.md, GUARDRAILS_MCP_RESPONSES.md, RELEASE.md).
 *   - README.md — public-style with badges, hero GIF placeholder, one-click
 *     install JSON snippets for Claude/Cursor/Warp/opencode, tools table.
 *   - LICENSE — MIT.
 *   - llms-install.md — user-facing setup guide for end users of cloned tools.
 *
 * All `{{name}}` placeholders are substituted at write time by portPackage.
 */

import { Migration, type MigrationContext, type MigrationResult } from "../../core/migration.js";
import { portPackage } from "../../core/package-port.js";

export default class DocsReadmeMigration extends Migration {
  readonly id = "10-docs-readme/m1-docs-readme";
  readonly title = "Port docs/ (Mintlify + reference markdown) + README + LICENSE";
  readonly appliesTo = "both" as const;

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    return portPackage(ctx, {
      // pkgDir "." — lib files land directly at the repo root.
      pkgDir: ".",
      libPrefix: "10-docs-readme/lib/",
    });
  }
}
