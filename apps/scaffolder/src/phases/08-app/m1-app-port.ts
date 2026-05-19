/**
 * 08-app/m1-app-port — port the apps/{{name}}-mcp/ tool itself.
 *
 * This is the biggest migration in the scaffolder: it lays down the entire
 * user-facing app — src/ (cli, index, dispatcher, tools/, tui/, commands/),
 * scripts/ (mcp-dev-proxy, stress-{mcp,tui}, screenshots/*.tape),
 * tests/ (integration), .env.example, .usage.kdl, README.md, plus all
 * config files (package.json, tsconfig.json, vite.config.ts, vitest.config.ts).
 *
 * Every file ships in lib/ with `{{name}}` and `@george43g` placeholders
 * intact; portPackage substitutes them at write time based on the user's
 * answers (config.global.repoName + config.global.scope).
 */

import {
  Migration,
  type MigrationContext,
  type MigrationResult,
  type RetrofitIntent,
} from "../../core/migration.js";
import { portPackage } from "../../core/package-port.js";

export default class AppPortMigration extends Migration {
  readonly id = "08-app/m1-app-port";
  readonly title = "Port apps/{{name}}-mcp/ (the user-facing tool)";
  readonly appliesTo = "new" as const;

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    const name = ctx.config.global.repoName.peek() ?? "starter";
    const pkgDir = `apps/${name}-mcp`;
    return portPackage(ctx, {
      pkgDir,
      libPrefix: "08-app/lib/",
    });
  }

  override retrofitIntent(ctx: MigrationContext): RetrofitIntent | undefined {
    const name = ctx.config.global.repoName.peek() ?? "<your-tool>";
    const scope = ctx.config.global.scope.peek() ?? "@your-scope";
    return {
      summary: "Lay down the canonical apps/<name>-mcp/ tree (src/, scripts/, tests/, configs).",
      rationale:
        "appliesTo=new — porting the whole app overwrites src/index.ts, src/cli.ts, src/dispatcher.ts, the tool registry, the TUI, the stress harness, package.json, vite/vitest configs, .env.example, README, .usage.kdl, etc. An existing repo almost certainly has its own MCP server layout; the safer path is to lift the load-bearing patterns into the existing source.",
      manualSteps: [
        "Apply the 6 dispatcher invariants from skills/mcp-starter-architect/SKILL.md to your dispatcher: withTimeout + perf() + noteActivity() + wrapToolError + AbortSignal + no post-stdio console.log.",
        "Wire @" +
          scope.replace(/^@/, "") +
          "/robustness installShutdownHandlers + installWatchdog + setLogFilePrefix + logStartup into your MCP entry.",
        "Adopt @" +
          scope.replace(/^@/, "") +
          "/mcp-kit: buildDispatcher + sanitize + wrapUntrusted + toMcpTools.",
        "Collapse to a single bin per app — index/cli/tui sharing a dispatcher (Vite library mode, 3 entries, shebang banner).",
        "Port scripts/stress-mcp.ts (9 lifecycle cases) and run it in CI.",
      ],
      prompt:
        `Retrofit my existing MCP server to match the architecture of ` +
        `https://github.com/george43g/mcp-cli-starter-template/tree/main/apps/{{name}}-mcp ` +
        `(the canonical app inside the scaffolder repo). The full pattern is documented in ` +
        `skills/mcp-starter-architect/SKILL.md — particularly the "6 dispatcher invariants" ` +
        `section and phase 08-app. Do NOT overwrite my src/ wholesale; instead, do these in ` +
        `order on a feature branch:\n` +
        `\n` +
        `1. Read skills/mcp-starter-architect/SKILL.md if available in the workspace, or fetch ` +
        `the file from the template repo at the URL above.\n` +
        `2. Audit my dispatcher (the function that routes JSON-RPC tool calls to handlers). ` +
        `It MUST: (a) wrap every handler in withTimeout from @${scope.replace(/^@/, "")}/robustness, ` +
        `(b) call noteActivity() to feed the idle watchdog, (c) emit a perf() span per dispatch, ` +
        `(d) wrap errors with actionable hints and the tool name, (e) honor AbortSignal in ` +
        `long-running loops, (f) NEVER use console.log after stdio transport connects.\n` +
        `3. Wire installShutdownHandlers() + installWatchdog() + setLogFilePrefix(slug) + ` +
        `logStartup() into my MCP entry point. Replace every post-connect \`console.*\` with ` +
        `the logger from @${scope.replace(/^@/, "")}/robustness.\n` +
        `4. Apply sanitize() and wrapUntrusted() (from @${scope.replace(/^@/, "")}/mcp-kit) to ` +
        `EVERY surface that emits user-controlled content into a tool response — this is the ` +
        `prompt-injection defense layer.\n` +
        `5. If I have separate \`${name}-mcp\` / \`${name}-cli\` / \`${name}-tui\` binaries, ` +
        `collapse them to ONE bin with subcommands sharing a dispatcher. Build with Vite library ` +
        `mode, 3 entries (index/cli/tui), shebang banner via rollup-plugin-banner.\n` +
        `6. Port the 9-case stress harness from \`apps/{{name}}-mcp/scripts/stress-mcp.ts\` ` +
        `(handshake, health, parallel, unknown-tool, malformed-input, timeout, SIGTERM, ` +
        `RSS-watchdog, HTTP) into my repo and run it in CI.\n` +
        `\n` +
        `After each phase, run my existing test suite. Do not move on if anything regresses. ` +
        `Summarize what changed and what I should manually verify.`,
    };
  }
}
