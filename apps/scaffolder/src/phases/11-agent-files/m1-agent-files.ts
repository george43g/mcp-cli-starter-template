/**
 * 11-agent-files/m1-agent-files — port AGENTS.md + agent config + skills.
 *
 * Lands:
 *   - AGENTS.md (canonical agent guide)
 *   - CLAUDE.md, .cursorrules (symlinks → AGENTS.md)
 *   - .mcp.json, opencode.json, .cursor/mcp.json (dev-MCP entries — relative paths)
 *   - .cursor/rules/example-repo.mdc (Cursor rules pointer)
 *   - .claude/settings.local.json + .claude/skills/{mcp-tool-author,pr-review-sop}/
 *   - skills/example-repo/SKILL.md, skills.md (project skill scaffold)
 *   - .github/PULL_REQUEST_TEMPLATE.md + .github/ISSUE_TEMPLATE/{bug,feature}.md
 *
 * Path-level substitution: paths like `skills/example-repo/SKILL.md` and
 * `.cursor/rules/example-repo.mdc` get resolved at write time (portPackage now
 * substitutes both content AND path).
 *
 * Symlinks: CLAUDE.md and .cursorrules are created as symlinks to AGENTS.md
 * after the lib copy.
 */

import {
  appliedStatus,
  Migration,
  type MigrationContext,
  type MigrationResult,
} from "../../core/migration.js";
import { portPackage } from "../../core/package-port.js";

export default class AgentFilesMigration extends Migration {
  readonly id = "11-agent-files/m1-agent-files";
  readonly title = "Port AGENTS.md + CLAUDE.md/.cursorrules symlinks + .mcp.json + skills";
  readonly appliesTo = "both" as const;

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    const lib = await portPackage(ctx, { pkgDir: "", libPrefix: "11-agent-files/lib/" });

    // Create the CLAUDE.md and .cursorrules symlinks pointing at AGENTS.md.
    // ctx.fs.symlink is idempotent (returns "unchanged" if already a symlink).
    const symlinkResults: string[] = [];
    for (const linkPath of ["CLAUDE.md", ".cursorrules"]) {
      const outcome = await ctx.fs.symlink("AGENTS.md", linkPath);
      if (outcome !== "unchanged") symlinkResults.push(linkPath);
    }

    const allChanged = [...(lib.filesChanged ?? []), ...symlinkResults];
    const notes = [
      ...(lib.notes ?? []),
      ...(symlinkResults.length ? [`symlinks: ${symlinkResults.join(", ")} → AGENTS.md`] : []),
    ];

    return allChanged.length === 0
      ? { status: "noop" }
      : { status: appliedStatus(ctx.dryRun), filesChanged: allChanged, notes };
  }
}
