/**
 * 01-bootstrap/m4-monorepo — set up the Turborepo monorepo skeleton.
 *
 * Writes: pnpm-workspace.yaml, root package.json (via `pnpm init` + pnpm
 * pkg set), turbo.json.
 *
 * Skips in `existing` mode AND when monorepo === false.
 */

import { Migration, type MigrationContext, type MigrationResult } from "../../core/migration.js";

const PNPM_WORKSPACE_YAML = `packages:
  - apps/*
  - packages/*
`;

// Minimal turbo.json — phase 03-configs lands the full version (with all
// env vars and task definitions). This is just enough to make `turbo run X`
// happy in a fresh tree.
const TURBO_JSON = JSON.stringify(
  {
    $schema: "https://turbo.build/schema.json",
    ui: "tui",
    tasks: {
      build: { dependsOn: ["^build"], outputs: ["dist/**"] },
      typecheck: { dependsOn: ["^build"], outputs: [] },
      lint: { outputs: [], inputs: ["src/**"] },
      test: { dependsOn: ["^build"], outputs: ["coverage/**"] },
      dev: { cache: false, persistent: true },
      clean: { cache: false },
    },
  },
  null,
  2,
);

export default class MonorepoMigration extends Migration {
  readonly id = "01-bootstrap/m4-monorepo";
  readonly title = "Initialize Turborepo monorepo skeleton";
  readonly appliesTo = "new" as const;

  override async shouldRun(ctx: MigrationContext): Promise<boolean> {
    // monorepo defaults to true; only skip if user explicitly opted out.
    const monorepo = ctx.config.global.monorepo.peek();
    return monorepo !== false;
  }

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    const filesChanged: string[] = [];
    const notes: string[] = [];

    // pnpm-workspace.yaml — small literal, no template needed.
    const wsOutcome = await ctx.fs.writeIfChanged("pnpm-workspace.yaml", PNPM_WORKSPACE_YAML);
    if (wsOutcome !== "unchanged") filesChanged.push("pnpm-workspace.yaml");
    notes.push(`pnpm-workspace.yaml: ${wsOutcome}`);

    // turbo.json
    const turboOutcome = await ctx.fs.writeIfChanged("turbo.json", `${TURBO_JSON}\n`);
    if (turboOutcome !== "unchanged") filesChanged.push("turbo.json");
    notes.push(`turbo.json: ${turboOutcome}`);

    // Root package.json — prefer `pnpm init` over hand-writing; then patch
    // the fields we care about with `pnpm pkg set`. `pnpm init` is idempotent:
    // if package.json already exists it just leaves it alone.
    if (!ctx.fs.exists("package.json")) {
      if (!ctx.dryRun) {
        await ctx.shell.run("pnpm", ["init"]);
      }
      filesChanged.push("package.json");
    }

    // Apply our standard fields. These are idempotent: pnpm pkg set is a no-op
    // when the value already matches.
    const name = ctx.config.global.repoName.peek() ?? "mcp-starter";
    const pm = ctx.config.global.packageManager.peek() ?? "pnpm";

    if (!ctx.dryRun) {
      await ctx.shell.run("pnpm", ["pkg", "set", `name=${name}`]);
      await ctx.shell.run("pnpm", ["pkg", "set", "private=true", "--json"]);
      await ctx.shell.run("pnpm", ["pkg", "set", "type=module"]);
      await ctx.shell.run("pnpm", ["pkg", "set", "engines.node=>=24"]);
      if (pm === "pnpm") {
        await ctx.shell.run("pnpm", ["pkg", "set", "packageManager=pnpm@10.29.3"]);
      }
    }
    notes.push(`package.json: name=${name}, type=module, engines.node>=24`);

    return { status: "applied", filesChanged, notes };
  }
}
