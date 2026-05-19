/**
 * RETROFIT.md generator.
 *
 * Walks the phase-run results, asks each migration for its retrofitIntent()
 * when that migration was skipped (or returned divergent files in apply mode),
 * and emits a single markdown file at the target repo root.
 *
 * Only fires for `apply --execute` against an existing repo — `init` writes
 * fresh files, `plan` is dry-run, and `migrate <id>` in new mode wouldn't
 * make sense.
 */

import type { MigrationContext, RetrofitIntent } from "./migration.js";
import type { MigrationRunResult, PhaseRunResult } from "./phase-runner.js";

export interface CollectedIntent {
  phaseId: string;
  migrationId: string;
  /** "skipped" | "divergent" — which trigger caused this intent to be collected. */
  trigger: "skipped" | "divergent";
  intent: RetrofitIntent;
  /** Only set when trigger==="divergent". */
  divergentFiles?: readonly string[];
}

/**
 * Walk phase results and collect a RetrofitIntent for every entry that was
 * `skipped` OR returned at least one divergent file. Migrations that don't
 * implement retrofitIntent() are dropped (intentional — config-only ones).
 */
export function collectIntents(
  phaseResults: readonly PhaseRunResult[],
  ctx: MigrationContext,
): CollectedIntent[] {
  const out: CollectedIntent[] = [];
  for (const phase of phaseResults) {
    for (const row of phase.results) {
      const trigger = pickTrigger(row);
      if (!trigger) continue;
      const intent = row.migration.retrofitIntent?.(ctx);
      if (!intent) continue;
      const entry: CollectedIntent = {
        phaseId: phase.phaseId,
        migrationId: row.migrationId,
        trigger,
        intent,
      };
      if (trigger === "divergent" && row.result.filesDivergent?.length) {
        entry.divergentFiles = row.result.filesDivergent;
      }
      out.push(entry);
    }
  }
  return out;
}

function pickTrigger(row: MigrationRunResult): "skipped" | "divergent" | undefined {
  if (row.result.status === "skipped") return "skipped";
  if ((row.result.filesDivergent?.length ?? 0) > 0) return "divergent";
  return undefined;
}

/**
 * Render the collected intents as a single markdown document. The output is
 * deterministic given the same input (no timestamps) so re-running apply
 * with no changes leaves RETROFIT.md byte-identical.
 */
export function renderRetrofitMarkdown(intents: readonly CollectedIntent[]): string {
  const lines: string[] = [];
  lines.push("# Retrofit guide");
  lines.push("");
  lines.push(
    "This file was emitted by `mcp-scaffold apply` for migrations that could not be auto-applied to your existing repo. Each section below describes what the scaffolder *would* have done in `init` mode, why it had to skip in `apply` mode, and how to apply the change manually — including a self-contained AI prompt you can paste into your coding agent of choice.",
  );
  lines.push("");
  lines.push(
    "**Read order**: the migrations are grouped by phase, and phases are intended to be applied in numeric order. Phase 04 (robustness) carries the most leverage and is the safest to retrofit; phase 08 (the app port) is the largest refactor.",
  );
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const entry of intents) {
    lines.push(`## ${entry.migrationId}`);
    lines.push("");
    lines.push(`**What it does**: ${entry.intent.summary}`);
    lines.push("");
    lines.push(`**Why it skipped**: ${entry.intent.rationale}`);
    lines.push("");
    if (entry.divergentFiles && entry.divergentFiles.length > 0) {
      lines.push("**Divergent files (preserved — pass `--force` to overwrite):**");
      lines.push("");
      for (const f of entry.divergentFiles) lines.push(`- \`${f}\``);
      lines.push("");
    }
    lines.push("**Manual steps:**");
    lines.push("");
    for (let i = 0; i < entry.intent.manualSteps.length; i++) {
      lines.push(`${i + 1}. ${entry.intent.manualSteps[i]}`);
    }
    lines.push("");
    lines.push("**Sample AI prompt** (copy-paste verbatim into your coding agent):");
    lines.push("");
    lines.push("```");
    lines.push(entry.intent.prompt);
    lines.push("```");
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  lines.push("## Where to read more");
  lines.push("");
  lines.push(
    "- `skills/mcp-starter-architect/SKILL.md` — full retrofit playbook (manual application order, dispatcher invariants, phase dependencies).",
  );
  lines.push("- `apps/scaffolder/src/phases/<phase>/m*.ts` — canonical source for each migration.");
  lines.push(
    "- `apps/scaffolder/src/phases/<phase>/lib/**` — the template files the migration would copy in.",
  );
  lines.push("");

  return lines.join("\n");
}
