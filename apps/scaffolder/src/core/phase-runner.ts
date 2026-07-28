/**
 * Phase runner — runs all registered phases in declared order.
 *
 * Phases are statically imported via `src/phases/index.ts` (the barrel)
 * so vite can bundle the whole graph into a single `dist/cli.js`. Adding
 * a new phase means creating the dir and pushing it into PHASES.
 */

import { PHASES } from "../phases/index.js";
import {
  type Migration,
  type MigrationContext,
  type MigrationResult,
  type Phase,
} from "./migration.js";

/**
 * Return the statically-registered phase list. Kept async so future
 * variations (e.g. filtering by env or by a `--from/--to` flag) can do
 * IO without breaking callers.
 */
export async function loadPhases(): Promise<readonly Phase[]> {
  return PHASES;
}

export interface MigrationRunResult {
  migrationId: string;
  /** Reference to the migration class instance — used downstream for retrofitIntent(). */
  migration: Migration;
  result: MigrationResult;
  durationMs: number;
}

export interface PhaseRunResult {
  phaseId: string;
  results: ReadonlyArray<MigrationRunResult>;
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
        recordResult(phaseResult, migration, skipResult);
        ctx.log.record({ migrationId: migration.id, ...skipResult });
        continue;
      }
      // Generic existing repositories receive only migrations explicitly
      // marked safe. Named migrations and the full strategy are conscious
      // opt-ins to template-oriented infrastructure changes.
      if (
        ctx.mode === "existing" &&
        ctx.target.profile === "generic-existing" &&
        ctx.existingStrategy === "safe" &&
        !ctx.explicitMigration &&
        migration.existingPolicy !== "safe-any-existing"
      ) {
        const skipResult = await timed(async () => ({
          status: "skipped" as const,
          notes: [
            "existingPolicy=starter-existing, target=generic-existing; use migrate <id> or --existing-strategy full to opt in",
          ],
        }));
        recordResult(phaseResult, migration, skipResult);
        ctx.log.record({ migrationId: migration.id, ...skipResult });
        continue;
      }
      // shouldRun gating
      if ((await migration.shouldRun?.(ctx)) === false) {
        const skipResult = await timed(async () => ({
          status: "skipped" as const,
          notes: ["shouldRun() returned false"],
        }));
        recordResult(phaseResult, migration, skipResult);
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
      recordResult(phaseResult, migration, ran);
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

function recordResult(phaseResult: PhaseRunResult, migration: Migration, ran: TimedRun): void {
  (phaseResult.results as Array<MigrationRunResult>).push({
    migrationId: migration.id,
    migration,
    result: ran.result,
    durationMs: ran.durationMs,
  });
}
