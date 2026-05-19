/**
 * Commander program builder.
 *
 * Subcommands:
 *   init [target]                      Fresh scaffold into <target> (default: cwd)
 *   apply [--target <dir>]             Apply migrations to an existing repo
 *   plan [--target <dir>] [--mode m]   Dry-run preview
 *   migrate <id> [--target <dir>]      Run a single migration (or one whole phase)
 *   list                               List discovered phases + migrations
 *
 * Feature flags (attached to init/apply/plan):
 *   --no-tui, --no-http, --no-rust-accel, --no-semantic-release
 *
 * Reverse-mapping the commander flags onto the IoC config happens in
 * `applyCmdOptsToConfig()` — extending it for new flags is the right place.
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
import { collectIntents, renderRetrofitMarkdown } from "./retrofit.js";
import { makeShell } from "./shell.js";

/** Common flags shared between init/apply/plan. */
function addCommonFlags(cmd: Command): Command {
  return cmd
    .option("--name <name>", "Tool name (kebab-case, BARE — no -mcp suffix)")
    .option("--scope <scope>", "Npm scope, with leading @", "@george43g")
    .option("--package-manager <pm>", "pnpm | npm | bun", "pnpm")
    .option("--no-tui", "Skip the Ink/React TUI surface")
    .option("--no-http", "Skip the Streamable HTTP transport")
    .option("--no-rust-accel", "Skip the optional Rust acceleration crate")
    .option("--no-semantic-release", "Skip the semantic-release workflow");
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("mcp-scaffold")
    .description("Programmable scaffolder + migrator for mcp-cli-starter-template")
    .version("0.0.0", "-V, --version")
    .option("-v, --verbose", "Log debug-level info to stderr")
    .option("--yes", "Non-interactive: accept defaults for any unset value")
    .option("--no-banner", "Suppress the ascii banner");

  addCommonFlags(
    program.command("init [target]").description("Fresh scaffold into <target> (defaults to cwd)"),
  ).action(async (target: string | undefined, opts) => {
    const globalOpts = program.opts<{ verbose?: boolean; banner?: boolean }>();
    if (globalOpts.banner !== false) drawBanner();
    const cwd = resolve(target ?? process.cwd());
    // init = fresh dir; force=true (overwrite freely is fine in an empty dir).
    await runScaffolder("new", cwd, globalOpts, opts, false, undefined, true);
  });

  addCommonFlags(
    program
      .command("apply")
      .description("Apply migrations to an existing repo")
      .option("--target <dir>", "Path to the existing repo", process.cwd())
      .option("--execute", "Actually apply (default is dry-run)")
      .option(
        "--force",
        "Overwrite files that diverge from the template (default: preserve user customizations)",
      ),
  ).action(async (opts) => {
    const globalOpts = program.opts<{ verbose?: boolean; banner?: boolean }>();
    if (globalOpts.banner !== false) drawBanner();
    const cwd = resolve(String(opts.target));
    const dryRun = !opts.execute;
    const force = opts.force === true;
    await runScaffolder("existing", cwd, globalOpts, opts, dryRun, undefined, force);
  });

  addCommonFlags(
    program
      .command("plan")
      .description("Dry-run preview of which migrations would apply")
      .option("--target <dir>", "Path to target repo", process.cwd())
      .option("--mode <mode>", "'new' or 'existing'", "existing"),
  ).action(async (opts) => {
    const globalOpts = program.opts<{ verbose?: boolean; banner?: boolean }>();
    if (globalOpts.banner !== false) drawBanner();
    const mode = (opts.mode === "new" ? "new" : "existing") as ApplyMode;
    const cwd = resolve(String(opts.target));
    // plan = dry-run; force semantics still matter (so the preview shows
    // would-skip vs would-write). Match the mode's default.
    await runScaffolder(mode, cwd, globalOpts, opts, true, undefined, mode === "new");
  });

  addCommonFlags(
    program
      .command("migrate <id>")
      .description(
        "Run a single migration (e.g. 04-robustness/m1-robustness-pkg) or a whole phase (e.g. 04-robustness)",
      )
      .option("--target <dir>", "Path to target repo", process.cwd())
      .option("--mode <mode>", "'new' or 'existing'", "new")
      .option("--execute", "Actually apply (default is dry-run for existing mode)")
      .option("--force", "Overwrite divergent files (default depends on mode)"),
  ).action(async (id: string, opts) => {
    const globalOpts = program.opts<{ verbose?: boolean; banner?: boolean }>();
    if (globalOpts.banner !== false) drawBanner();
    const mode = (opts.mode === "new" ? "new" : "existing") as ApplyMode;
    const cwd = resolve(String(opts.target));
    const dryRun = mode === "existing" && !opts.execute;
    const force = opts.force === true || mode === "new";
    await runScaffolder(mode, cwd, globalOpts, opts, dryRun, id, force);
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

/**
 * Translate commander flag values into config setters. Centralized so adding
 * a new flag only touches one place.
 */
function applyCmdOptsToConfig(cmdOpts: Record<string, unknown>, config: Config): void {
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

  // commander's `.option("--no-X", ...)` yields opts.X === false when the
  // user passed --no-X and opts.X === true (or undefined) otherwise.
  if (cmdOpts.tui === false) config.features.tui.set(false);
  if (cmdOpts.http === false) config.features.http.set(false);
  if (cmdOpts.rustAccel === false) config.features.rustAccel.set(false);
  if (cmdOpts.semanticRelease === false) config.features.semanticRelease.set(false);
}

async function runScaffolder(
  mode: ApplyMode,
  cwd: string,
  globalOpts: { verbose?: boolean },
  cmdOpts: Record<string, unknown>,
  dryRun: boolean,
  migrationFilter?: string,
  force = true,
): Promise<void> {
  const log = makeLogger({ verbose: globalOpts.verbose === true });
  const shell = makeShell({ cwd, dryRun });
  const fs = makeFs({ cwd, dryRun, force });
  const git = makeGit(shell);
  const config = new Config();

  config.global.mode.set(mode);
  applyCmdOptsToConfig(cmdOpts, config);

  const ctx: MigrationContext = { config, cwd, mode, shell, fs, git, log, dryRun, force };

  let phases = await loadPhases();
  if (phases.length === 0) {
    log.warn("No phases registered.");
    return;
  }

  if (migrationFilter) {
    phases = filterPhases(phases, migrationFilter, log);
    if (phases.length === 0) return;
  }

  const phaseResults = await runPhases(phases, ctx);

  // RETROFIT.md is meaningful only for `apply --execute` against an existing
  // repo. `init` writes fresh files (nothing was skipped because of mode);
  // `plan` is dry-run so we don't touch disk; `migrate` against `new` mode
  // wouldn't make sense either.
  let intentCount = 0;
  if (mode === "existing" && !dryRun) {
    const intents = collectIntents(phaseResults, ctx);
    intentCount = intents.length;
    if (intents.length > 0) {
      await ctx.fs.writeIfChanged("RETROFIT.md", renderRetrofitMarkdown(intents));
    }
  }

  drawRecap(phaseResults, { retrofitIntentCount: intentCount });
}

/**
 * Narrow the phase list to a single migration (or a single phase). The filter
 * accepts either:
 *   - "04-robustness/m1-robustness-pkg" — exact migration id
 *   - "04-robustness"                    — whole phase
 */
function filterPhases(
  phases: ReturnType<typeof loadPhases> extends Promise<infer T> ? T : never,
  filter: string,
  log: { error: (m: string) => void },
): typeof phases {
  const slashIdx = filter.indexOf("/");
  if (slashIdx >= 0) {
    const phaseId = filter.slice(0, slashIdx);
    const phase = phases.find((p) => p.id === phaseId);
    if (!phase) {
      log.error(`No phase named "${phaseId}". Run \`mcp-scaffold list\` to see phases.`);
      return [];
    }
    const migration = phase.migrations.find((m) => m.id === filter);
    if (!migration) {
      log.error(`No migration named "${filter}" in phase "${phaseId}".`);
      return [];
    }
    return [{ ...phase, migrations: [migration] }];
  }
  const phase = phases.find((p) => p.id === filter);
  if (!phase) {
    log.error(`No phase named "${filter}". Run \`mcp-scaffold list\` to see phases.`);
    return [];
  }
  return [phase];
}
