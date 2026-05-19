/**
 * 02-toolchain/m5-gitattributes — anti-footgun .gitattributes.
 *
 * Specifically prevents Git LFS from grabbing *.db files (a real footgun
 * when a synthetic fixture accidentally lands and stays); normalizes line
 * endings; marks generated napi bindings as `linguist-generated` so they
 * don't pollute "changed files" review noise.
 */

import { Migration, type MigrationContext, type MigrationResult } from "../../core/migration.js";

const GITATTRIBUTES = `# Anti-footgun: never auto-track *.db with Git LFS.
# Synthetic fixtures should be regenerated, not committed; real DBs are user data.
*.db -filter -diff -merge text
*.sqlite -filter -diff -merge text
*.sqlite3 -filter -diff -merge text

# Normalize line endings — committed text is LF, even on Windows.
* text=auto eol=lf

# Generated napi bindings — keep them out of "changed files" review noise.
apps/rust-accel/index.js linguist-generated=true
apps/rust-accel/index.d.ts linguist-generated=true
`;

export default class GitattributesMigration extends Migration {
  readonly id = "02-toolchain/m5-gitattributes";
  readonly title = "Write .gitattributes (anti-LFS-footgun)";
  readonly appliesTo = "both" as const;

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    const outcome = await ctx.fs.writeIfChanged(".gitattributes", GITATTRIBUTES);
    return outcome === "unchanged"
      ? { status: "noop" }
      : { status: "applied", filesChanged: [".gitattributes"] };
  }
}
