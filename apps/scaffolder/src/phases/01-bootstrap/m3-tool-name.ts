/**
 * 01-bootstrap/m3-tool-name — collect the kebab-case tool name.
 *
 * Forces the `repoName` prompt early so subsequent migrations using
 * placeholders (mise.toml, package.json names, etc.) have a value to
 * substitute. Skips in `existing` mode — we don't rename existing repos.
 */

import { Migration, type MigrationContext, type MigrationResult } from "../../core/migration.js";

export default class ToolNameMigration extends Migration {
  readonly id = "01-bootstrap/m3-tool-name";
  readonly title = "Collect tool name (kebab-case)";
  readonly appliesTo = "new" as const;

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    const preset = ctx.config.global.repoName.peek();
    if (preset !== undefined) return { status: "noop", notes: [`repoName=${preset}`] };
    const value = await ctx.config.global.repoName.get();
    if (value === undefined) return { status: "skipped", notes: ["skipped (existing mode)"] };
    return { status: "applied", notes: [`repoName=${value}`] };
  }
}
