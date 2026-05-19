/**
 * 02-toolchain/m3-git-init — `git init` if the target isn't already a repo.
 *
 * For existing-mode this is a near-certain skip (git.isRepo() → true). For
 * new-mode we always init unless the user did it manually first.
 */

import {
  appliedStatus,
  Migration,
  type MigrationContext,
  type MigrationResult,
} from "../../core/migration.js";

export default class GitInitMigration extends Migration {
  readonly id = "02-toolchain/m3-git-init";
  readonly title = "Initialize git repo (if not already one)";
  readonly appliesTo = "both" as const;

  override async shouldRun(ctx: MigrationContext): Promise<boolean> {
    return !(await ctx.git.isRepo());
  }

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    if (ctx.dryRun) {
      return {
        status: appliedStatus(ctx.dryRun),
        notes: ["would: git init --initial-branch=main"],
      };
    }
    await ctx.git.init();
    return { status: appliedStatus(ctx.dryRun), notes: ["git init --initial-branch=main"] };
  }
}
