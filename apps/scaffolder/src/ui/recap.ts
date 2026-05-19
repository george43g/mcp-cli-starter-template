import kleur from "kleur";
import type { PhaseRunResult } from "../core/phase-runner.js";

const GLYPH: Record<string, string> = {
  applied: kleur.green("✓"),
  skipped: kleur.dim("·"),
  noop: kleur.dim("·"),
  failed: kleur.red("✗"),
};

/**
 * End-of-run recap. One line per migration showing status + duration.
 * Compact by design — Phase ε's "comprehensive skill" can render the full
 * diff if the user wants it.
 */
export function drawRecap(phases: readonly PhaseRunResult[]): void {
  if (phases.length === 0) return;
  process.stdout.write(`\n${kleur.bold("Recap")}\n`);

  let applied = 0;
  let skipped = 0;
  let failed = 0;
  for (const phase of phases) {
    process.stdout.write(`\n  ${kleur.bold(phase.phaseId)}\n`);
    for (const row of phase.results) {
      const glyph = GLYPH[row.result.status] ?? "?";
      const duration = `${row.durationMs}ms`;
      process.stdout.write(`    ${glyph} ${row.migrationId} ${kleur.dim(`(${duration})`)}\n`);
      if (row.result.status === "applied") applied++;
      else if (row.result.status === "skipped" || row.result.status === "noop") skipped++;
      else if (row.result.status === "failed") {
        failed++;
        if (row.result.error) {
          process.stdout.write(`      ${kleur.red(row.result.error.message)}\n`);
        }
      }
    }
  }

  process.stdout.write(
    `\n  ${kleur.green(`${applied} applied`)} · ${kleur.dim(`${skipped} skipped`)} · ${
      failed > 0 ? kleur.red(`${failed} failed`) : kleur.dim(`${failed} failed`)
    }\n\n`,
  );
}
