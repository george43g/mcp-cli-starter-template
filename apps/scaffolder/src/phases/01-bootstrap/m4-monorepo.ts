/**
 * 01-bootstrap/m4-monorepo — set up the Turborepo monorepo skeleton.
 *
 * Writes pnpm-workspace.yaml, root package.json (full template — drops
 * `pnpm init` + pkg-set chain that was too partial), turbo.json (minimal;
 * 03-configs/m4-turbo-full upgrades it later).
 *
 * Skips when monorepo === false (single-package mode, not yet supported).
 */

import { Migration, type MigrationContext, type MigrationResult } from "../../core/migration.js";

const PNPM_WORKSPACE_YAML = `packages:
  - apps/*
  - packages/*
`;

// Minimal turbo.json — 03-configs/m4-turbo-full replaces it with the full
// 30+ env-var version once the shared configs land.
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

const ROOT_PACKAGE_JSON = (name: string) =>
  `${JSON.stringify(
    {
      name,
      version: "0.0.0",
      private: true,
      description: `${name} — MCP+CLI+TUI tool scaffolded from mcp-cli-starter-template.`,
      type: "module",
      engines: { node: ">=24" },
      packageManager: "pnpm@10.29.3",
      workspaces: ["apps/*", "packages/*"],
      scripts: {
        build: "turbo run build",
        dev: "turbo run dev",
        test: "turbo run test",
        "test:no-native": "turbo run test:no-native",
        lint: "biome check .",
        "lint:fix": "biome check --write .",
        format: "biome format --write .",
        typecheck: "turbo run typecheck",
        stress: "turbo run stress",
        verify: "pnpm lint && pnpm typecheck && pnpm test && pnpm build",
        clean: "turbo run clean && rm -rf node_modules .turbo coverage",
      },
      devDependencies: {
        "@biomejs/biome": "^2.4.15",
        "@types/node": "^24.0.0",
        tsx: "^4.19.0",
        turbo: "^2.5.0",
        typescript: "^5.7.0",
        vitest: "^2.1.0",
      },
      keywords: [
        "mcp",
        "model-context-protocol",
        "cli",
        "tui",
        "ink",
        "commander",
        "starter",
        "turborepo",
      ],
      author: "",
      license: "MIT",
    },
    null,
    2,
  )}\n`;

export default class MonorepoMigration extends Migration {
  readonly id = "01-bootstrap/m4-monorepo";
  readonly title =
    "Initialize Turborepo monorepo skeleton (pnpm-workspace, root package.json, turbo.json)";
  readonly appliesTo = "new" as const;

  override async shouldRun(ctx: MigrationContext): Promise<boolean> {
    return ctx.config.global.monorepo.peek() !== false;
  }

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    const filesChanged: string[] = [];
    const name = ctx.config.global.repoName.peek() ?? "mcp-starter";

    const files: Array<[string, string]> = [
      ["pnpm-workspace.yaml", PNPM_WORKSPACE_YAML],
      ["turbo.json", `${TURBO_JSON}\n`],
      ["package.json", ROOT_PACKAGE_JSON(name)],
    ];

    for (const [path, content] of files) {
      const outcome = await ctx.fs.writeIfChanged(path, content);
      if (outcome !== "unchanged") filesChanged.push(path);
    }

    return filesChanged.length === 0 ? { status: "noop" } : { status: "applied", filesChanged };
  }
}
