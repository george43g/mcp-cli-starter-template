/**
 * Phase runner — discovers phases under src/phases/* and runs them in order.
 *
 * Each phase directory must export a `phase` object from its `index.ts`
 * matching the `Phase` interface (or be empty — phase β ships zero phases;
 * phase γ populates them).
 */

import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { type MigrationContext, type MigrationResult, type Phase } from "./migration.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PHASES_DIR = resolve(__dirname, "..", "phases");

/**
 * Load all phases by scanning `src/phases/*` for directories. Each dir is
 * expected to export a `phase: Phase` from its `index.{ts,js}`. Dirs that
 * don't export anything are silently ignored (so phase γ can land new
 * phases incrementally).
 */
export async function loadPhases(opts: { phasesDir?: string } = {}): Promise<readonly Phase[]> {
  const dir = opts.phasesDir ?? PHASES_DIR;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return []; // phases dir doesn't exist yet (phase β state)
  }

  const phaseDirs = entries
    .filter((name) => /^\d{2}-/.test(name))
    .sort((a, b) => a.localeCompare(b));

  const loaded: Phase[] = [];
  for (const name of phaseDirs) {
    const indexPath = join(dir, name, "index.js");
    try {
      const mod = await import(pathToFileURL(indexPath).href);
      if (mod.phase) loaded.push(mod.phase as Phase);
    } catch {
      // skip dirs that don't export a phase yet
    }
  }
  return loaded;
}

export interface PhaseRunResult {
  phaseId: string;
  results: ReadonlyArray<{ migrationId: string; result: MigrationResult; durationMs: number }>;
}

export async function runPhases(
  phases: readonly Phase[],
  ctx: MigrationContext,
): Promise<PhaseRunResult[]> {
  const output: PhaseRunResult[] = [];
  for (const phase of phases) {
    const phaseResult: PhaseRunResult = { phaseId: phase.id, results: [] };
    for (const migration of phase.migrations) {
      // Mode gating
      if (migration.appliesTo !== "both" && migration.appliesTo !== ctx.mode) {
        const skipResult = await timed(async () => ({
          status: "skipped" as const,
          notes: [`appliesTo=${migration.appliesTo}, current mode=${ctx.mode}`],
        }));
        recordResult(phaseResult, migration.id, skipResult);
        ctx.log.record({ migrationId: migration.id, ...skipResult });
        continue;
      }
      // shouldRun gating
      if ((await migration.shouldRun?.(ctx)) === false) {
        const skipResult = await timed(async () => ({
          status: "skipped" as const,
          notes: ["shouldRun() returned false"],
        }));
        recordResult(phaseResult, migration.id, skipResult);
        ctx.log.record({ migrationId: migration.id, ...skipResult });
        continue;
      }
      // Apply
      const ran = await timed(async () => {
        try {
          return await migration.apply(ctx);
        } catch (err) {
          return {
            status: "failed" as const,
            error: err instanceof Error ? err : new Error(String(err)),
          };
        }
      });
      recordResult(phaseResult, migration.id, ran);
      ctx.log.record({ migrationId: migration.id, ...ran });
    }
    output.push(phaseResult);
  }
  return output;
}

interface TimedRun {
  result: MigrationResult;
  durationMs: number;
}

async function timed(fn: () => Promise<MigrationResult>): Promise<TimedRun> {
  const start = Date.now();
  const result = await fn();
  return { result, durationMs: Date.now() - start };
}

function recordResult(phaseResult: PhaseRunResult, migrationId: string, ran: TimedRun): void {
  (
    phaseResult.results as Array<{
      migrationId: string;
      result: MigrationResult;
      durationMs: number;
    }>
  ).push({ migrationId, result: ran.result, durationMs: ran.durationMs });
}
