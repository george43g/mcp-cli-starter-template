/**
 * Migration — the atomic unit of scaffolder work.
 *
 * Each phase directory under `src/phases/` contains migrations. Each migration
 * is a class extending `Migration`. They run sequentially within a phase, and
 * phases run sequentially across the run.
 *
 * Terminology (see plan §10):
 *   - migration (code) / rule (docs)
 *   - phase = directory of migrations
 *   - setting = leaf in the IoC config
 *   - apply = the act of running migrations against the target repo
 *   - plan = dry-run preview
 */

import type { CommanderOption } from "./commander-types.js";
import type { Config } from "./config.js";
import type { FsHelper } from "./fs.js";
import type { GitHelper } from "./git.js";
import type { Logger } from "./logger.js";
import type { ShellHelper } from "./shell.js";

export type ApplyMode = "new" | "existing";

export interface MigrationContext {
  /** The IoC config — reading a leaf triggers an inquirer prompt iff unset. */
  config: Config;
  /** Target repo directory — could be a fresh dir or an existing repo. */
  cwd: string;
  /** Whether we're generating fresh or applying to an existing repo. */
  mode: ApplyMode;
  /** Shell wrapper — proper stdio inheritance + error surfacing. */
  shell: ShellHelper;
  /** Filesystem helpers — idempotent writes, ensureDir, safe path. */
  fs: FsHelper;
  /** Git helpers — init, add, commit, status. */
  git: GitHelper;
  /** Logger — feeds the per-migration progress UI. */
  log: Logger;
  /** Dry-run mode — migrations should record what they WOULD do, not act. */
  dryRun: boolean;
}

export type MigrationStatus = "applied" | "would-apply" | "skipped" | "noop" | "failed";

export interface MigrationResult {
  status: MigrationStatus;
  /** Human-readable notes shown in the end-of-run recap. */
  notes?: string[];
  /** Files written/modified by this migration (for diff output). */
  filesChanged?: string[];
  /** If status === 'failed', the error. */
  error?: Error;
}

/** Pick "applied" vs "would-apply" based on the run mode. */
export function appliedStatus(dryRun: boolean): "applied" | "would-apply" {
  return dryRun ? "would-apply" : "applied";
}

/**
 * Base class — implement `apply()` and the metadata fields. The phase runner
 * handles `shouldRun?()` and `appliesTo` checks before calling `apply()`.
 */
export abstract class Migration {
  /** Stable id of the form `<phaseDir>/<filename-without-ts>` — e.g. "02-toolchain/m1-mise". */
  abstract readonly id: string;
  /** One-line title shown in progress UI and recap. */
  abstract readonly title: string;
  /** Whether this migration is safe to run against a new dir, an existing repo, or both. */
  abstract readonly appliesTo: ApplyMode | "both";

  /** Optional commander options contributed to the root program. */
  commanderOptions?(): readonly CommanderOption[];

  /** Run the migration. ctx.config.* reads may pause to prompt the user. */
  abstract apply(ctx: MigrationContext): Promise<MigrationResult>;

  /**
   * Skip-check run BEFORE `apply()`. Use for idempotency (file already exists,
   * dep already added, etc.). Returning false skips this migration entirely;
   * returning true (or omitting the method) means `apply()` runs.
   */
  shouldRun?(ctx: MigrationContext): Promise<boolean>;
}

/** A loaded phase — directory of sibling migrations. */
export interface Phase {
  /** Numeric prefix from the dir name (e.g. "02" from "02-toolchain"). */
  readonly order: number;
  /** Slug (e.g. "02-toolchain"). */
  readonly id: string;
  /** Human-readable title pulled from the phase's `index.ts` if exported. */
  readonly title?: string;
  /** Migrations in source-order — phase runner runs them in this order. */
  readonly migrations: readonly Migration[];
}
