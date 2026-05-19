import kleur from "kleur";
import type { PhaseRunResult } from "../core/phase-runner.js";

const GLYPH: Record<string, string> = {
  applied: kleur.green("✓"),
  "would-apply": kleur.yellow("?"),
  skipped: kleur.dim("·"),
  noop: kleur.dim("·"),
  failed: kleur.red("✗"),
};

export interface RecapOptions {
  /**
   * Number of migrations that contributed an entry to RETROFIT.md. When >0,
   * the recap footer prints a hint to open the file.
   */
  retrofitIntentCount?: number;
}

/**
 * End-of-run recap. One line per migration showing status + duration.
 * Divergent (user-customized) files are summarized at the bottom — those
 * are not failures, just preserved.
 */
export function drawRecap(phases: readonly PhaseRunResult[], opts: RecapOptions = {}): void {
  if (phases.length === 0) return;
  process.stdout.write(`\n${kleur.bold("Recap")}\n`);

  let applied = 0;
  let wouldApply = 0;
  let skipped = 0;
  let failed = 0;
  let totalDivergent = 0;
  const divergentByMigration: Array<{ id: string; files: readonly string[] }> = [];

  for (const phase of phases) {
    process.stdout.write(`\n  ${kleur.bold(phase.phaseId)}\n`);
    for (const row of phase.results) {
      const glyph = GLYPH[row.result.status] ?? "?";
      const duration = `${row.durationMs}ms`;
      const divCount = row.result.filesDivergent?.length ?? 0;
      const divHint = divCount > 0 ? kleur.cyan(` [${divCount} preserved]`) : "";
      process.stdout.write(
        `    ${glyph} ${row.migrationId} ${kleur.dim(`(${duration})`)}${divHint}\n`,
      );
      if (row.result.status === "applied") applied++;
      else if (row.result.status === "would-apply") wouldApply++;
      else if (row.result.status === "skipped" || row.result.status === "noop") skipped++;
      else if (row.result.status === "failed") {
        failed++;
        if (row.result.error) {
          process.stdout.write(`      ${kleur.red(row.result.error.message)}\n`);
        }
      }
      if (divCount > 0 && row.result.filesDivergent) {
        totalDivergent += divCount;
        divergentByMigration.push({ id: row.migrationId, files: row.result.filesDivergent });
      }
    }
  }

  const parts: string[] = [];
  if (applied) parts.push(kleur.green(`${applied} applied`));
  if (wouldApply)
    parts.push(kleur.yellow(`${wouldApply} would apply (dry-run; --execute to apply)`));
  if (skipped) parts.push(kleur.dim(`${skipped} skipped`));
  if (totalDivergent)
    parts.push(
      kleur.cyan(`${totalDivergent} divergent files preserved (pass --force to overwrite)`),
    );
  parts.push(failed > 0 ? kleur.red(`${failed} failed`) : kleur.dim(`${failed} failed`));
  process.stdout.write(`\n  ${parts.join(" · ")}\n`);

  if (divergentByMigration.length > 0) {
    process.stdout.write(`\n  ${kleur.bold("Divergent files (preserved)")}\n`);
    for (const { id, files } of divergentByMigration) {
      process.stdout.write(`    ${kleur.dim(id)}\n`);
      for (const f of files.slice(0, 10)) {
        process.stdout.write(`      ${kleur.cyan("·")} ${f}\n`);
      }
      if (files.length > 10) {
        process.stdout.write(`      ${kleur.dim(`… and ${files.length - 10} more`)}\n`);
      }
    }
  }

  if ((opts.retrofitIntentCount ?? 0) > 0) {
    process.stdout.write(
      `\n  ${kleur.cyan("→")} ${opts.retrofitIntentCount} retrofit ${
        opts.retrofitIntentCount === 1 ? "intent" : "intents"
      } captured. Open ${kleur.bold("RETROFIT.md")} for manual steps + ready-to-paste AI prompts.\n`,
    );
  }
  process.stdout.write("\n");
}
