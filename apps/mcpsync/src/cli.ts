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
 *   secret set|list|rm …            Manage the local 0600 credentials vault
 *   deploy [source] …               Hot-deploy a built extension into Claude Desktop
 *   tui                             Interactive servers×hosts drift grid (TTY only)
 *
 * `apply`/`sync` take `--scope project` to target the repo-local .mcp.json +
 * .cursor/mcp.json + .warp/.mcp.json instead of the user (~) configs.
 *
 * Global flags come from cli-kit's buildProgram (--json / -q / -v / --no-color)
 * plus -c/--config for a non-default manifest path.
 */

import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildProgram, color, disableColors, isInteractive } from "@george43g/cli-kit";
import { runAdd } from "./commands/add.js";
import { runApply } from "./commands/apply.js";
import { runDeploy } from "./commands/deploy.js";
import { runDoctor } from "./commands/doctor.js";
import { runImport } from "./commands/import.js";
import { runList } from "./commands/list.js";
import { runRemove } from "./commands/remove.js";
import { runSecretList, runSecretRemove, runSecretSet } from "./commands/secret.js";
import { runSync } from "./commands/sync.js";
import type { Scope } from "./core/schema.js";

/**
 * Version read from package.json at runtime (dist/cli.js → ../package.json;
 * src/cli.ts → ../package.json) so semantic-release bumps propagate without
 * hand-syncing — same pattern as the template's meta.ts.
 */
const VERSION = (() => {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(resolve(dir, "..", "package.json"), "utf8")) as {
      version: string;
    };
    return pkg.version;
  } catch {
    return "0.0.0";
  }
})();

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
    .description("Diagnose hosts, scan for inlined plaintext secrets, check ${VAR} reachability")
    .action(() => runDoctor({ json: globals().json, config: globals().config }));

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
    .option("--scope <scope>", "user (~) | project (repo .mcp.json + .cursor/.warp)", "user")
    .option("--dry-run", "Preview without writing")
    .option("-y, --yes", "Skip the confirmation prompt")
    .option("--force", "Write Claude Desktop's config even while Desktop is running")
    .action(
      async (opts: {
        to?: string;
        only?: string;
        scope?: string;
        dryRun?: boolean;
        yes?: boolean;
        force?: boolean;
      }) => {
        await runApply({
          to: opts.to,
          only: opts.only
            ? opts.only
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
          scope: parseScope(opts.scope),
          config: globals().config,
          dryRun: opts.dryRun,
          yes: opts.yes,
          force: opts.force,
        });
      },
    );

  program
    .command("sync")
    .description("Show a drift plan, then full-reconcile a host (or all detected hosts)")
    .option("--to <host>", 'Target host id, or "all"', "all")
    .option("--scope <scope>", "user (~) | project (repo .mcp.json + .cursor/.warp)", "user")
    .option("--dry-run", "Preview without writing")
    .option("-y, --yes", "Skip the confirmation prompt")
    .option("--force", "Write Claude Desktop's config even while Desktop is running")
    .action(
      async (opts: {
        to?: string;
        scope?: string;
        dryRun?: boolean;
        yes?: boolean;
        force?: boolean;
      }) => {
        await runSync({
          to: opts.to,
          scope: parseScope(opts.scope),
          config: globals().config,
          dryRun: opts.dryRun,
          yes: opts.yes,
          force: opts.force,
        });
      },
    );

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

  const secret = program
    .command("secret")
    .description("Manage the local 0600 credentials vault (~/.mcpsync/credentials.json)");
  secret
    .command("set <server> <key>")
    .description("Store a secret value (read from stdin, or --value); vault written at mode 0600")
    .option("--value <value>", "Value to store inline (leaks into shell history — prefer stdin)")
    .action((server: string, key: string, opts: { value?: string }) =>
      runSecretSet(server, key, { value: opts.value }),
    );
  secret
    .command("list")
    .alias("ls")
    .description("List stored server + key names (values never shown)")
    .action(() => runSecretList({ json: globals().json }));
  secret
    .command("remove <server> [key]")
    .alias("rm")
    .description("Remove one key, or a whole server entry when key is omitted")
    .action((server: string, key: string | undefined) => runSecretRemove(server, key));

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

/**
 * Validate a --scope value. Fail-closed: silently coercing a typo (e.g.
 * "--scope Project") to user scope would mutate the ~ configs the user was
 * explicitly trying NOT to touch.
 */
function parseScope(scope: string | undefined): Scope {
  if (scope === undefined || scope === "user") return "user";
  if (scope === "project") return "project";
  process.stderr.write(`${color.red(`invalid --scope "${scope}" (use "user" or "project")`)}\n`);
  process.exit(2);
}

/**
 * Run main() only when this file is the executed entry point. argv[1] is
 * realpath'd because npm installs bins as `node_modules/.bin/<name>` SYMLINKS —
 * a plain `argv[1].endsWith("/dist/cli.js")` check fails there and the bin
 * exits silently (found by the packed-tarball consumer smoke).
 */
const isMain = (() => {
  try {
    const arg = process.argv[1];
    return arg !== undefined && import.meta.url === pathToFileURL(realpathSync(arg)).href;
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
