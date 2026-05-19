/**
 * 01-bootstrap/m1-mode — surface the mode question early.
 *
 * Reading `ctx.config.global.mode.get()` forces the prompt if it wasn't
 * pre-set via the subcommand (init→'new', apply→'existing'). The program
 * always pre-sets it, so this migration normally records 'noop'. It exists
 * for completeness — if a future entrypoint forgets to set the mode, this
 * migration ensures we still ask the user.
 */

import { Migration, type MigrationContext, type MigrationResult } from "../../core/migration.js";

export default class ModeMigration extends Migration {
  readonly id = "01-bootstrap/m1-mode";
  readonly title = "Determine mode (new scaffold vs apply to existing repo)";
  readonly appliesTo = "both" as const;

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    const preset = ctx.config.global.mode.peek();
    if (preset !== undefined) return { status: "noop", notes: [`mode=${preset} (pre-set)`] };
    const value = await ctx.config.global.mode.get();
    return { status: "applied", notes: [`mode=${value}`] };
  }
}
