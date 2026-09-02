/**
 * 01-bootstrap/m4-monorepo — set up the Turborepo monorepo skeleton.
 *
 * Writes pnpm-workspace.yaml, root package.json (full template — drops
 * `pnpm init` + pkg-set chain that was too partial), turbo.json (minimal;
 * 03-configs/m4-turbo-full upgrades it later).
 *
 * Skips when monorepo === false (single-package mode, not yet supported).
 */

import {
  Migration,
  type MigrationContext,
  type MigrationResult,
  type RetrofitIntent,
} from "../../core/migration.js";
import { requireRepoName } from "../../core/target-inspection.js";

const PNPM_WORKSPACE_YAML = `packages:
  - apps/*
  - packages/*

# Fresh releases of the kits must not be quarantined out of RANGE resolution.
#
# pnpm's \`minimumReleaseAge\` refuses to resolve a version published more
# recently than its threshold. Exact specifiers bypass it; RANGES do not. pnpm
# 11 turns it on by default, and this repo depends on \`@george43g/*\` by range —
# so without this line a freshly published kit fix is invisible for the
# quarantine window, \`pnpm install\` reports "up to date", and the natural
# conclusion is that the publish failed rather than that it is being withheld.
#
# Scoped to \`@george43g/*\` on purpose: the quarantine is a good default for
# everything you do not publish yourself. Keep it for the rest of the registry.
minimumReleaseAgeExclude:
  - "@george43g/*"
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
      test: { dependsOn: ["^build"] },
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
      // No npm-style `workspaces` field: pnpm reads pnpm-workspace.yaml (written
      // alongside this file), and an npm `workspaces` field only makes plain-npm
      // tooling (e.g. @semantic-release/npm's `npm version`) traverse members and
      // choke on pnpm's `workspace:*` protocol with EUNSUPPORTEDPROTOCOL.
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
        // Docs integrity gate (index coverage + relative links + agent-file
        // symlinks). Ships via 10-docs-readme's scripts/check-docs-links.mjs.
        "check:docs": "node scripts/check-docs-links.mjs",
        // Stdout purity: no console.* call in an MCP app's src/. AGENTS.md
        // claimed "CI grep enforces this" for months while nothing did — a
        // 2026-09 fleet audit found the false sentence replicated into two
        // descendant repos. Ships via 10-docs-readme's scripts/.
        "check:stdout-purity": "node scripts/check-stdout-purity.mjs",
        verify:
          "pnpm lint && pnpm check:docs && pnpm check:stdout-purity && pnpm typecheck && pnpm test && pnpm build",
        clean: "turbo run clean && rm -rf node_modules .turbo coverage",
      },
      devDependencies: {
        "@biomejs/biome": "^2.5.5",
        "@george43g/tsconfig": "workspace:*",
        "@types/node": "^24.13.3",
        tsx: "^4.23.1",
        turbo: "^2.10.7",
        typescript: "^5.7.0",
        vitest: "^3.2.7",
      },
      pnpm: {
        overrides: {
          "@hono/node-server": "2.0.11",
          "fast-uri": "3.1.4",
          postcss: "8.5.18",
        },
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
    const name = requireRepoName(ctx.config);
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

  override retrofitIntent(ctx: MigrationContext): RetrofitIntent | undefined {
    const name = requireRepoName(ctx.config);
    return {
      summary: "Convert the existing repo into a Turborepo monorepo (apps/* + packages/*).",
      rationale:
        "appliesTo=new — the migration writes root package.json, pnpm-workspace.yaml, and turbo.json from scratch, which would clobber an existing repo's metadata. Retrofitting requires merging fields, not overwriting them.",
      manualSteps: [
        'Set `"packageManager": "pnpm@10.29.3"` (or current pnpm pin) and `"type": "module"` in root package.json.',
        "Create pnpm-workspace.yaml with `packages: [apps/*, packages/*]` (this is pnpm's workspace source — do NOT add an npm `workspaces` field to package.json; it breaks plain-npm tooling on `workspace:*` deps).",
        "Install turbo as a root devDependency: `pnpm add -D -w turbo`.",
        "Create turbo.json with tasks: build (dependsOn ^build, outputs dist/**), typecheck, lint, test (dependsOn ^build), dev (cache:false, persistent:true), clean.",
        "Add root scripts: build/dev/test/lint/typecheck — all wrapping `turbo run <task>`. Plus a `verify` script that chains lint+typecheck+test+build.",
        "Move your existing source under `apps/" +
          name +
          "-mcp/` (or whatever you renamed it to) and re-anchor imports.",
      ],
      prompt:
        `Retrofit my repo to a Turborepo monorepo following the template at ` +
        `https://github.com/george43g/mcp-cli-starter-template (the apps/example-repo-mcp/ + ` +
        `packages/* layout). Preserve all existing source — don't overwrite my root ` +
        `package.json metadata (name, description, version, keywords, author, license). ` +
        `Do these things in order:\n` +
        `\n` +
        `1. Add to my root package.json: \`"packageManager": "pnpm@10.29.3"\`, ` +
        `\`"type": "module"\`, \`"private": true\`, \`"engines": {"node": ">=24"}\`. ` +
        `Do NOT add an npm \`"workspaces"\` field — pnpm uses pnpm-workspace.yaml ` +
        `(step 4), and an npm \`workspaces\` field breaks plain-npm tooling on \`workspace:*\` deps.\n` +
        `2. Add (or merge) these scripts into root package.json: build="turbo run build", ` +
        `dev="turbo run dev", test="turbo run test", "test:no-native"="turbo run test:no-native", ` +
        `lint="biome check .", "lint:fix"="biome check --write .", format="biome format --write .", ` +
        `typecheck="turbo run typecheck", stress="turbo run stress", ` +
        `verify="pnpm lint && pnpm typecheck && pnpm test && pnpm build", ` +
        `clean="turbo run clean && rm -rf node_modules .turbo coverage".\n` +
        `3. Add to root devDependencies (if missing): @biomejs/biome ^2.5.5, ` +
        `@george43g/tsconfig workspace:*, @types/node ^24.13, tsx ^4.23, turbo ^2.10, ` +
        `typescript ^5.7, vitest ^3.2.\n` +
        `4. Create pnpm-workspace.yaml: \`packages:\\n  - apps/*\\n  - packages/*\\n\`.\n` +
        `5. Create turbo.json with the task graph: build dependsOn ^build outputs dist/**, ` +
        `typecheck dependsOn ^build, lint inputs src/**, test dependsOn ^build, ` +
        `dev cache:false persistent:true, clean cache:false. Use schema ` +
        `"https://turbo.build/schema.json" and \`ui: "tui"\`.\n` +
        `6. Move my existing MCP server source into \`apps/${name}-mcp/\` (or pick a kebab-case ` +
        `name). Update its package.json name to match (e.g. \`@<scope>/${name}-mcp\`).\n` +
        `7. Run \`pnpm install\` to materialize the workspace, then \`pnpm verify\` to confirm.\n` +
        `\n` +
        `If my repo already has these fields set, MERGE — do not overwrite my custom ` +
        `description/author/license/version/etc. After applying, give me a one-paragraph ` +
        `summary of what you changed and what I should review.`,
    };
  }
}
