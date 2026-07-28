import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ExistingStrategy, MigrationContext } from "./migration.js";
import type { PhaseRunResult } from "./phase-runner.js";

export interface RunReportInput {
  commandMode: MigrationContext["mode"];
  cwd: string;
  dryRun: boolean;
  force: boolean;
  existingStrategy: ExistingStrategy;
  explicitMigration: boolean;
  migrationFilter?: string;
  retrofitIntentCount: number;
  ctx: MigrationContext;
  phases: readonly PhaseRunResult[];
}

/**
 * Write a stable machine-readable companion to the human recap.
 * Deliberately omits wall-clock timestamps; durations remain diagnostic data.
 */
export async function writeRunReport(path: string, input: RunReportInput): Promise<void> {
  const report = {
    schemaVersion: 1,
    command: {
      mode: input.commandMode,
      cwd: input.cwd,
      dryRun: input.dryRun,
      force: input.force,
      existingStrategy: input.existingStrategy,
      explicitMigration: input.explicitMigration,
      migrationFilter: input.migrationFilter,
      runtimeSource: input.ctx.config.global.runtimeSource.peek(),
    },
    target: input.ctx.target,
    retrofitIntentCount: input.retrofitIntentCount,
    phases: input.phases.map((phase) => ({
      phaseId: phase.phaseId,
      migrations: phase.results.map((row) => ({
        migrationId: row.migrationId,
        status: row.result.status,
        durationMs: row.durationMs,
        notes: row.result.notes ?? [],
        filesChanged: row.result.filesChanged ?? [],
        filesDivergent: row.result.filesDivergent ?? [],
        followUps: row.result.followUps ?? [],
        error: row.result.error
          ? {
              name: row.result.error.name,
              message: row.result.error.message,
            }
          : undefined,
      })),
    })),
  };

  await writeFile(resolve(path), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
