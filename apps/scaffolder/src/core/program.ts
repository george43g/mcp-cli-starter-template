/**
 * Commander program builder.
 *
 * Subcommands:
 *   init [target]              Fresh scaffold into <target> (default: cwd)
 *   apply [--target <dir>]     Apply migrations to an existing repo
 *   plan [--target <dir>]      Dry-run preview
 *   list                       List discovered phases + migrations
 *
 * Migrations contribute additional --flags via `commanderOptions()` — those
 * are attached to `init`/`apply`/`plan` so each value can be pre-populated
 * headless.
 */

import { resolve } from "node:path";
import { Command } from "commander";
import { drawBanner } from "../ui/banner.js";
import { drawRecap } from "../ui/recap.js";
import { Config } from "./config.js";
import { makeFs } from "./fs.js";
import { makeGit } from "./git.js";
import { makeLogger } from "./logger.js";
import { type ApplyMode, type MigrationContext } from "./migration.js";
import { loadPhases, runPhases } from "./phase-runner.js";
import { makeShell } from "./shell.js";

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("mcp-scaffold")
    .description("Programmable scaffolder + migrator for mcp-cli-starter-template")
    .version("0.0.0", "-V, --version")
    .option("-v, --verbose", "Log debug-level info to stderr")
    .option("--yes", "Non-interactive: accept defaults for any unset value")
    .option("--no-banner", "Suppress the ascii banner");

  program
    .command("init [target]")
    .description("Fresh scaffold into <target> (defaults to cwd)")
    .option("--name <name>", "Tool name (kebab-case, e.g. wm-stack-mcp)")
    .option("--scope <scope>", "Npm scope, with leading @", "@george43g")
    .option("--package-manager <pm>", "pnpm | npm | bun", "pnpm")
    .action(async (target: string | undefined, opts) => {
      const globalOpts = program.opts<{ verbose?: boolean; yes?: boolean; banner?: boolean }>();
      if (globalOpts.banner !== false) drawBanner();
      const cwd = resolve(target ?? process.cwd());
      await runScaffolder("new", cwd, globalOpts, opts);
    });

  program
    .command("apply")
    .description("Apply migrations to an existing repo")
    .option("--target <dir>", "Path to the existing repo", process.cwd())
    .option("--execute", "Actually apply (default is dry-run)")
    .action(async (opts) => {
      const globalOpts = program.opts<{ verbose?: boolean; yes?: boolean; banner?: boolean }>();
      if (globalOpts.banner !== false) drawBanner();
      const cwd = resolve(opts.target);
      const dryRun = !opts.execute;
      await runScaffolder("existing", cwd, globalOpts, opts, dryRun);
    });

  program
    .command("plan")
    .description("Dry-run preview of which migrations would apply")
    .option("--target <dir>", "Path to target repo", process.cwd())
    .option("--mode <mode>", "'new' or 'existing'", "existing")
    .action(async (opts) => {
      const globalOpts = program.opts<{ verbose?: boolean; yes?: boolean; banner?: boolean }>();
      if (globalOpts.banner !== false) drawBanner();
      const mode = (opts.mode === "new" ? "new" : "existing") as ApplyMode;
      const cwd = resolve(opts.target);
      await runScaffolder(mode, cwd, globalOpts, opts, true);
    });

  program
    .command("list")
    .description("List discovered phases + migrations")
    .action(async () => {
      const phases = await loadPhases();
      if (phases.length === 0) {
        process.stdout.write("No phases registered yet (framework only).\n");
        return;
      }
      for (const phase of phases) {
        process.stdout.write(`${phase.id}${phase.title ? ` — ${phase.title}` : ""}\n`);
        for (const m of phase.migrations) {
          process.stdout.write(`  • ${m.id} — ${m.title} [${m.appliesTo}]\n`);
        }
      }
    });

  return program;
}

async function runScaffolder(
  mode: ApplyMode,
  cwd: string,
  globalOpts: { verbose?: boolean; yes?: boolean },
  cmdOpts: Record<string, unknown>,
  dryRun = false,
): Promise<void> {
  const log = makeLogger({ verbose: globalOpts.verbose === true });
  const shell = makeShell({ cwd, dryRun });
  const fs = makeFs({ cwd, dryRun });
  const git = makeGit(shell);
  const config = new Config();

  // Pre-populate config from commander flags so prompts don't fire for things
  // the user already specified on the command line.
  config.global.mode.set(mode);
  if (typeof cmdOpts.name === "string") config.global.repoName.set(cmdOpts.name);
  if (typeof cmdOpts.scope === "string") config.global.scope.set(cmdOpts.scope);
  if (
    typeof cmdOpts.packageManager === "string" &&
    (cmdOpts.packageManager === "pnpm" ||
      cmdOpts.packageManager === "npm" ||
      cmdOpts.packageManager === "bun")
  ) {
    config.global.packageManager.set(cmdOpts.packageManager);
  }

  const ctx: MigrationContext = { config, cwd, mode, shell, fs, git, log, dryRun };

  const phases = await loadPhases();
  if (phases.length === 0) {
    log.warn(
      "No phases registered yet — the scaffolder framework is operational but has no work to do.",
    );
    log.warn("Phase γ will land the actual migrations.");
    return;
  }

  const phaseResults = await runPhases(phases, ctx);
  drawRecap(phaseResults);
}
