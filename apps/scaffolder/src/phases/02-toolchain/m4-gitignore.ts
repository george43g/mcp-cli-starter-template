/**
 * 02-toolchain/m4-gitignore — write the canonical .gitignore.
 *
 * Comprehensive: deps, build output, native artifacts, env files,
 * MCP host overrides, test coverage, stress reports, logs, editor/OS
 * cruft, turbo, semantic-release, and on-demand-regenerated screenshots.
 */

import {
  appliedStatus,
  Migration,
  type MigrationContext,
  type MigrationResult,
} from "../../core/migration.js";

const GITIGNORE = `# Dependencies
node_modules/
.pnpm-store/

# Build output
dist/
build/
*.tsbuildinfo

# Native artifacts (built per-platform, not checked in)
*.node
apps/rust-accel/target/

# Env files (lock to repo: .env.example only)
.env
.env.local
.env.*.local
.env.development
.env.production
.env.test

# MCP host overrides (each developer's own)
.mcp.local.json

# Test/coverage output
coverage/
.nyc_output/
*.lcov

# Stress harness reports
stress-mcp-report.json
stress-tui-report.json
watchdog-state.json

# Logs
*.log
npm-debug.log*
pnpm-debug.log*
yarn-debug.log*
yarn-error.log*

# Editor/IDE
.vscode/
!.vscode/extensions.json
!.vscode/settings.recommended.json
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Turbo
.turbo/

# semantic-release
release/
*.tgz

# Screenshots regenerated on-demand
docs/screenshots/*.png
!docs/screenshots/.gitkeep

# Claude Code per-session locks (transient)
.claude/scheduled_tasks.lock

# MCPB artifacts (regenerate with \`pnpm pack:mcpb\`)
*.mcpb
`;

export default class GitignoreMigration extends Migration {
  readonly id = "02-toolchain/m4-gitignore";
  readonly title = "Write .gitignore";
  readonly appliesTo = "both" as const;

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    const outcome = await ctx.fs.writeIfChanged(".gitignore", GITIGNORE);
    return outcome === "unchanged"
      ? { status: "noop" }
      : { status: appliedStatus(ctx.dryRun), filesChanged: [".gitignore"] };
  }
}
