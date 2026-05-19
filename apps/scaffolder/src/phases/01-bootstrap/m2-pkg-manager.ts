/**
 * 01-bootstrap/m2-pkg-manager — pick the package manager.
 *
 * Surfaces the prompt early so later migrations (turbo init, pnpm pkg set)
 * know which binary to invoke. No fs side effects here.
 */

import { Migration, type MigrationContext, type MigrationResult } from "../../core/migration.js";

export default class PkgManagerMigration extends Migration {
  readonly id = "01-bootstrap/m2-pkg-manager";
  readonly title = "Choose package manager (pnpm | npm | bun)";
  readonly appliesTo = "new" as const;

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    const preset = ctx.config.global.packageManager.peek();
    if (preset !== undefined) return { status: "noop", notes: [`packageManager=${preset}`] };
    const value = await ctx.config.global.packageManager.get();
    return { status: "applied", notes: [`packageManager=${value}`] };
  }
}
