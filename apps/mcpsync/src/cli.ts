/**
 * mcpsync — the single bin. Commander dispatch over subcommands.
 *
 *   doctor                          Which MCP hosts are present + their config paths
 *   list                            servers×hosts drift grid across detected hosts
 *   import --from <host>            Pull a host's servers into the canonical manifest
 *   apply [--to host|all] [--only]  Push canonical servers to a host (or all)
 *
 * Global flags come from cli-kit's buildProgram (--json / -q / -v / --no-color)
 * plus -c/--config for a non-default manifest path.
 */

import { buildProgram, color, disableColors } from "@george43g/cli-kit";
import { runApply } from "./commands/apply.js";
import { runDoctor } from "./commands/doctor.js";
import { runImport } from "./commands/import.js";
import { runList } from "./commands/list.js";

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
