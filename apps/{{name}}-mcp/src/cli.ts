/**
 * {{name}}-cli — Commander bin.
 *
 * Subcommands:
 *   mcp                 Run the MCP stdio server
 *   http [--port] ...   Run the MCP via Streamable HTTP
 *   tui                 Launch the Ink TUI
 *   doctor              Run preflight checks
 *   health              Print a health snapshot (calls health_check in-process)
 *   noop --input ...    Demo: call the noop tool in-process
 *   cli                 Drop into an interactive REPL driving the dispatcher
 *
 * To remove HTTP support: delete the `http` subcommand below.
 * To remove TUI support: delete the `tui` subcommand below.
 */

import { color, isInteractive } from "@george43g/cli-kit";
import { Command } from "commander";
import { checkLocalAccess, formatAccessReport } from "./access-check.js";
import { callMcpTool } from "./dispatcher.js";
import { runMcpServer } from "./index.js";
import { APP_NAME, APP_VERSION } from "./meta.js";

async function printResult(result: Awaited<ReturnType<typeof callMcpTool>>, json: boolean) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result.structuredContent ?? result, null, 2)}\n`);
    return;
  }
  for (const item of result.content ?? []) {
    process.stdout.write(`${item.text}\n`);
  }
  if (result.isError) process.exit(1);
}

export async function main(argv: readonly string[] = process.argv): Promise<void> {
  const program = new Command();
  program
    .name(APP_NAME.replace(/^@[^/]+\//, "").replace(/-mcp$/, "-cli"))
    .description("{{name}} — CLI surface for the MCP server (same dispatcher, in-process).")
    .version(APP_VERSION, "-V, --version")
    .option("--json", "Emit machine-readable JSON")
    .option("-q, --quiet", "Suppress non-error output")
    .option("-v, --verbose", "Log debug-level info to stderr")
    .option("--no-color", "Disable colors");

  program
    .command("mcp")
    .description("Run the MCP stdio server")
    .action(async () => {
      await runMcpServer({ transport: "stdio" });
    });

  program
    .command("http")
    .description("Run the MCP via Streamable HTTP (requires MCP_HTTP_TOKEN)")
    .option("--port <port>", "Port to bind", "8080")
    .option("--bind <host>", "Bind address", "127.0.0.1")
    .action(async (opts) => {
      if (opts.port) process.env.MCP_HTTP_PORT = String(opts.port);
      if (opts.bind) process.env.MCP_HTTP_BIND = String(opts.bind);
      await runMcpServer({ transport: "http" });
    });

  program
    .command("tui")
    .description("Launch the Ink TUI")
    .action(async () => {
      if (!isInteractive()) {
        process.stderr.write(
          `${color.yellow("Refusing to launch TUI: stdin or stdout is not a TTY.")}\n`,
        );
        process.exit(1);
      }
      const { runTui } = await import("./tui/index.js");
      await runTui();
    });

  program
    .command("doctor")
    .description("Run preflight checks (Node version, native module, config dir)")
    .action(async () => {
      const report = await checkLocalAccess();
      process.stdout.write(`${formatAccessReport(report)}\n`);
      if (!report.ok) process.exit(1);
    });

  program
    .command("health")
    .description("Print server health snapshot")
    .action(async () => {
      const json = program.opts<{ json?: boolean }>().json ?? false;
      const result = await callMcpTool("health_check", {});
      await printResult(result, json);
    });

  program
    .command("noop")
    .description("Demo: call the noop tool")
    .requiredOption("--input <text>", "Input string to echo")
    .option("--upper", "Return upper-cased", false)
    .action(async (opts: { input: string; upper: boolean }) => {
      const json = program.opts<{ json?: boolean }>().json ?? false;
      const result = await callMcpTool("noop", { input: opts.input, upper: opts.upper });
      await printResult(result, json);
    });

  program
    .command("cli")
    .alias("console")
    .description("Interactive REPL driving the in-process dispatcher")
    .action(async () => {
      const { runRepl } = await import("@george43g/cli-kit");
      await runRepl({
        prompt: APP_NAME.replace(/^@[^/]+\//, "").replace(/-mcp$/, ""),
        banner: color.dim(`${APP_NAME} ${APP_VERSION} — type 'help' for commands.`),
        dispatcher: {
          async listTools() {
            const { makeAppRegistry } = await import("./tools/registry.js");
            return makeAppRegistry().tools.map((t) => ({
              name: t.name,
              description: t.description,
            }));
          },
          async callTool(name, args) {
            return callMcpTool(name, args);
          },
        },
        shortcuts: [
          {
            command: "health",
            tool: "health_check",
            help: "Print server health snapshot",
            buildArgs: () => ({}),
          },
          {
            command: "noop",
            tool: "noop",
            help: "noop <input> [upper]",
            buildArgs: (a) => ({ input: a[0] ?? "", upper: a[1] === "upper" }),
          },
        ],
      });
    });

  await program.parseAsync(argv as string[]);
}

const isMain = (() => {
  try {
    const arg = process.argv[1] ?? "";
    return arg.endsWith("/dist/cli.js") || arg.endsWith("/src/cli.ts");
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((err) => {
    process.stderr.write(`${color.red((err as Error).message)}\n`);
    process.exit(1);
  });
}
