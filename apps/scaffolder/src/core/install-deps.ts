/**
 * install-deps — run the target's package manager after a run that changed
 * dependency declarations.
 *
 * This exists because generated repos no longer vendor the published packages
 * (see runtime-source.ts). A scaffold that writes `"@george43g/robustness":
 * "^0.2.1"` and stops leaves a repo that cannot build until someone installs,
 * which is a worse first impression than the extra minute it costs here.
 *
 * Deliberately NOT a migration. Migrations write files and report which ones;
 * this runs a subprocess and writes nothing, so modelling it as one would make
 * `filesChanged` lie and put a network call inside the dry-run path.
 */

import type { PackageManager } from "./config.js";
import type { Logger } from "./logger.js";
import type { PhaseRunResult } from "./phase-runner.js";
import type { ShellHelper } from "./shell.js";

/**
 * Files whose contents decide what gets installed. `pnpm-workspace.yaml` counts
 * because adding a workspace member changes the install graph without any
 * package.json in the run having been touched.
 */
const DEPENDENCY_FILES = ["package.json", "pnpm-workspace.yaml"];

/**
 * Install arguments per package manager.
 *
 * `--no-frozen-lockfile` states the intent directly: this install runs BECAUSE
 * dependencies just changed, so updating the lockfile is the point, not a
 * side effect to be guarded against.
 *
 * It is also defensive. `apps/scaffolder/mise.toml`'s smoke task carries the
 * same flag and the troubleshooting notes record a real CI-vs-local divergence
 * behind it ("pnpm defaults to --frozen-lockfile in CI"). Worth stating plainly:
 * that failure did NOT reproduce here — pnpm 10.29.3 under `CI=true` installed
 * happily with both a missing lockfile and an outdated one. So this is the
 * documented safe default rather than a fix for a failure observed today.
 */
function installArgs(pm: PackageManager): string[] {
  return pm === "pnpm" ? ["install", "--no-frozen-lockfile"] : ["install"];
}

function changedDependencyFiles(phases: readonly PhaseRunResult[]): string[] {
  const hits = new Set<string>();
  for (const phase of phases) {
    for (const row of phase.results) {
      for (const file of row.result.filesChanged ?? []) {
        const base = file.split("/").pop() ?? file;
        if (DEPENDENCY_FILES.includes(base)) hits.add(file);
      }
    }
  }
  return [...hits].sort();
}

export type InstallOutcome =
  | { status: "skipped"; reason: string }
  | { status: "installed"; packageManager: PackageManager; changedFiles: string[] }
  | { status: "failed"; packageManager: PackageManager; message: string };

export interface InstallDepsInput {
  phases: readonly PhaseRunResult[];
  packageManager: PackageManager;
  shell: ShellHelper;
  log: Logger;
  cwd: string;
  dryRun: boolean;
  /** False when the user passed --no-install. */
  enabled: boolean;
}

/**
 * Install dependencies iff the run actually changed a dependency declaration.
 *
 * A failed install is reported, not thrown: the files on disk are already
 * correct and re-running the install by hand is a one-liner, so failing the
 * whole scaffold over a transient registry error would be a worse trade.
 */
export async function installDependencies(input: InstallDepsInput): Promise<InstallOutcome> {
  if (!input.enabled) return { status: "skipped", reason: "--no-install" };
  if (input.dryRun) return { status: "skipped", reason: "dry-run" };

  const changedFiles = changedDependencyFiles(input.phases);
  if (changedFiles.length === 0) {
    return { status: "skipped", reason: "no dependency files changed" };
  }

  const pm = input.packageManager;
  input.log.info(`Installing dependencies with ${pm} (${changedFiles.length} manifest(s) changed)`);

  const result = await input.shell.tryRun(pm, installArgs(pm), {
    cwd: input.cwd,
    inherit: true,
  });
  if (result.exitCode !== 0) {
    return {
      status: "failed",
      packageManager: pm,
      message: result.stderr.trim() || `${pm} install exited ${result.exitCode}`,
    };
  }
  return { status: "installed", packageManager: pm, changedFiles };
}
