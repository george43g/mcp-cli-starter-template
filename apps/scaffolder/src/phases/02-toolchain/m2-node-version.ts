/**
 * 02-toolchain/m2-node-version — .nvmrc and .node-version for tools that
 * don't grok mise yet. Belt-and-suspenders alongside m1-mise.
 */

import { Migration, type MigrationContext, type MigrationResult } from "../../core/migration.js";

export default class NodeVersionMigration extends Migration {
  readonly id = "02-toolchain/m2-node-version";
  readonly title = "Write .nvmrc + .node-version";
  readonly appliesTo = "both" as const;

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    const filesChanged: string[] = [];
    for (const file of [".nvmrc", ".node-version"]) {
      const outcome = await ctx.fs.writeIfChanged(file, "24\n");
      if (outcome !== "unchanged") filesChanged.push(file);
    }
    return filesChanged.length === 0 ? { status: "noop" } : { status: "applied", filesChanged };
  }
}
