/**
 * 03-configs/m4-turbo-full — rewrite turbo.json with the full env + task set.
 *
 * 01-bootstrap/m4-monorepo wrote a minimal turbo.json (just enough to make
 * `turbo run X` happy). This migration upgrades it with all 30+ MCP_*
 * globalEnv entries and the full task graph (build/typecheck/lint/test/
 * test:no-native/stress/dev/clean) with inputs + outputs declared properly.
 */

import {
  appliedStatus,
  Migration,
  type MigrationContext,
  type MigrationResult,
} from "../../core/migration.js";

const TURBO_JSON = `{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "globalDependencies": [".env.example", "tsconfig.json", "biome.json"],
  "globalEnv": [
    "CI",
    "NODE_ENV",
    "MCP_LOG_DIR",
    "MCP_LOG_RING_SIZE",
    "MCP_LOG_MAX_BYTES",
    "MCP_HEAP_WARN_MB",
    "MCP_HEAP_CHECK_MS",
    "MCP_EVENT_LOOP_SAMPLE_MS",
    "MCP_EVENT_LOOP_WARN_MS",
    "MCP_EVENT_LOOP_KILL_MS",
    "MCP_EVENT_LOOP_SUSTAINED_MS",
    "MCP_EVENT_LOOP_SUSTAINED_SAMPLES",
    "MCP_MEMORY_SAMPLE_MS",
    "MCP_MAX_RSS_MB",
    "MCP_HEAP_GROWTH_SAMPLES",
    "MCP_RESTART_AFTER_MS",
    "MCP_RESTART_QUIET_MS",
    "MCP_IDLE_CHECK_MS",
    "MCP_TOOL_TIMEOUT_DEFAULT_MS",
    "MCP_TOOL_TIMEOUT_FORCE_MS",
    "MCP_RETRY_MAX_ATTEMPTS",
    "MCP_RETRY_BASE_MS",
    "MCP_RETRY_CAP_MS",
    "MCP_RATE_LIMIT_RPS",
    "MCP_RATE_LIMIT_BURST",
    "MCP_HTTP_TOKEN",
    "MCP_HTTP_PORT",
    "MCP_HTTP_BIND",
    "MCP_WATCHDOG_STATE_PATH",
    "MCP_DISABLE_NATIVE",
    "MCP_DEV"
  ],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "!dist/**/*.test.*", "*.node", "index.js", "index.d.ts"],
      "inputs": [
        "src/**",
        "vite.config.ts",
        "tsconfig.json",
        "package.json",
        "Cargo.toml",
        "build.rs"
      ]
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": [],
      "inputs": ["src/**", "tests/**", "tsconfig.json"]
    },
    "lint": {
      "outputs": [],
      "inputs": ["src/**", "tests/**", "scripts/**", "biome.json"]
    },
    "test": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "tests/**", "vitest.config.ts"]
    },
    "test:no-native": {
      "dependsOn": ["^build"],
      "outputs": [],
      "inputs": ["src/**", "tests/**", "vitest.config.ts"],
      "env": ["MCP_DISABLE_NATIVE"]
    },
    "stress": {
      "dependsOn": ["build"],
      "outputs": ["stress-mcp-report.json"],
      "inputs": ["src/**", "scripts/stress-mcp.ts"],
      "cache": false
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "clean": {
      "cache": false
    }
  }
}
`;

export default class TurboFullMigration extends Migration {
  readonly id = "03-configs/m4-turbo-full";
  readonly title = "Upgrade turbo.json to full env + task set";
  readonly appliesTo = "both" as const;

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    const outcome = await ctx.fs.writeIfChanged("turbo.json", TURBO_JSON);
    return outcome === "unchanged"
      ? { status: "noop" }
      : { status: appliedStatus(ctx.dryRun), filesChanged: ["turbo.json"] };
  }
}
