/**
 * mcpsync — the single bin. Commander dispatch over subcommands.
 *
 *   doctor                          Which MCP hosts are present + their config paths
 *   list                            servers×hosts drift grid across detected hosts
 *   import --from <host>            Pull a host's servers into the canonical manifest
 *   apply [--to host|all] [--only]  Push canonical servers to a host (or all)
 *   sync [--to host|all]            Show a drift plan, then full-reconcile hosts
 *   add <name> …                    Add/overwrite a server in the canonical manifest
 *   remove <name> [--to host|all]   Remove from canonical (default) or a host
 *   deploy [source] …               Hot-deploy a built extension into Claude Desktop
 *   tui                             Interactive servers×hosts drift grid (TTY only)
 *
 * Global flags come from cli-kit's buildProgram (--json / -q / -v / --no-color)
 * plus -c/--config for a non-default manifest path.
 */

import { buildProgram, color, disableColors, isInteractive } from "@george43g/cli-kit";
import { runAdd } from "./commands/add.js";
import { runApply } from "./commands/apply.js";
import { runDeploy } from "./commands/deploy.js";
import { runDoctor } from "./commands/doctor.js";
import { runImport } from "./commands/import.js";
import { runList } from "./commands/list.js";
import { runRemove } from "./commands/remove.js";
import { runSync } from "./commands/sync.js";

const VERSION = "0.0.0";

export async function main(argv: readonly string[] = process.argv): Promise<void> {
  const program = buildProgram({
    name: "mcpsync",
    description:
      "Sync one canonical ~/.mcp.json across every MCP host (Claude Desktop, Cursor, Warp, …).",
    version: VERSION,
  });
  program.option("-c, --config <path>", "Path to the canonical manifest (default ~/.mcp.json)");
  program.hook("preAction", () => {
    if (program.opts<{ color?: boolean }>().color === false) disableColors();
  });

  const globals = () => program.opts<{ json?: boolean; config?: string }>();

  program
    .command("doctor")
    .description("Show which MCP hosts are present and their config paths")
    .action(() => runDoctor({ json: globals().json }));

  program
    .command("list")
    .description("Show a servers×hosts drift grid across detected hosts")
    .action(() => runList({ json: globals().json, config: globals().config }));

  program
    .command("import")
    .description("Pull a host's servers into the canonical manifest")
    .requiredOption("--from <host>", "Host id to import from")
    .option("--dry-run", "Preview without writing")
    .action((opts: { from: string; dryRun?: boolean }) =>
      runImport({ from: opts.from, config: globals().config, dryRun: opts.dryRun }),
    );

  program
    .command("apply")
    .description("Push canonical servers to a host (or all detected hosts)")
    .option("--to <host>", 'Target host id, or "all"', "all")
    .option("--only <names>", "Comma-separated server names to apply")
    .option("--dry-run", "Preview without writing")
    .option("-y, --yes", "Skip the confirmation prompt")
    .action(async (opts: { to?: string; only?: string; dryRun?: boolean; yes?: boolean }) => {
      await runApply({
        to: opts.to,
        only: opts.only
          ? opts.only
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
        config: globals().config,
        dryRun: opts.dryRun,
        yes: opts.yes,
      });
    });

  program
    .command("sync")
    .description("Show a drift plan, then full-reconcile a host (or all detected hosts)")
    .option("--to <host>", 'Target host id, or "all"', "all")
    .option("--dry-run", "Preview without writing")
    .option("-y, --yes", "Skip the confirmation prompt")
    .action(async (opts: { to?: string; dryRun?: boolean; yes?: boolean }) => {
      await runSync({ to: opts.to, config: globals().config, dryRun: opts.dryRun, yes: opts.yes });
    });

  program
    .command("add <name>")
    .description("Add or overwrite a server in the canonical manifest")
    .option("--command <cmd>", "Executable for a stdio server")
    .option("--arg <value>", "Argument (repeatable)", collect, [])
    .option("--env <K=V>", "Environment variable (repeatable)", collect, [])
    .option("--transport <t>", "stdio | http | sse (inferred from --url if omitted)")
    .option("--url <url>", "URL for an http/sse server")
    .option("--header <K: V>", "Header (repeatable)", collect, [])
    .option("--dry-run", "Preview without writing")
    .action(
      (
        name: string,
        opts: {
          command?: string;
          arg: string[];
          env: string[];
          transport?: string;
          url?: string;
          header: string[];
          dryRun?: boolean;
        },
      ) => {
        runAdd({
          name,
          command: opts.command,
          args: opts.arg,
          env: opts.env,
          transport: opts.transport,
          url: opts.url,
          header: opts.header,
          config: globals().config,
          dryRun: opts.dryRun,
        });
      },
    );

  program
    .command("remove <name>")
    .alias("rm")
    .description("Remove a server from the canonical manifest, or from a host with --to")
    .option("--to <host>", 'Remove from this host id, or "all" (leaves canonical untouched)')
    .option("--dry-run", "Preview without writing")
    .option("-y, --yes", "Skip the confirmation prompt")
    .action((name: string, opts: { to?: string; dryRun?: boolean; yes?: boolean }) => {
      return runRemove({
        name,
        to: opts.to,
        config: globals().config,
        dryRun: opts.dryRun,
        yes: opts.yes,
      });
    });

  program
    .command("deploy [source]")
    .description("Hot-deploy a built MCP extension (dir or .mcpb/.dxt) into Claude Desktop")
    .option("--ext-id <id>", "Match the installed extension by dir id (not manifest name)")
    .option("--from <archive>", "Deploy from a packed .mcpb/.dxt archive")
    .option("--full", "Also sync node_modules (slow)")
    .option("--list", "List installed extensions and exit (read-only)")
    .option("--dry-run", "Preview without writing")
    .option("-y, --yes", "Skip the confirmation prompt")
    .action(
      async (
        source: string | undefined,
        opts: {
          extId?: string;
          from?: string;
          full?: boolean;
          list?: boolean;
          dryRun?: boolean;
          yes?: boolean;
        },
      ) => {
        await runDeploy({
          source,
          from: opts.from,
          extId: opts.extId,
          full: opts.full,
          list: opts.list,
          dryRun: opts.dryRun,
          yes: opts.yes,
          json: globals().json,
        });
      },
    );

  program
    .command("tui")
    .description("Launch the interactive servers×hosts drift grid (TTY only)")
    .action(async () => {
      if (!isInteractive()) {
        process.stderr.write(
          `${color.yellow("Refusing to launch TUI: stdin or stdout is not a TTY.")}\n`,
        );
        process.exit(1);
      }
      const { runTui } = await import("./tui/index.js");
      await runTui(globals().config);
    });

  await program.parseAsync(argv as string[]);
}

/** Commander reducer for repeatable options (--arg x --arg y → ["x","y"]). */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
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
