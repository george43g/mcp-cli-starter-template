/**
 * Output mode switch.
 *
 * Every CLI subcommand should produce *either* a human-readable form
 * (tables, colors, multi-line) or a machine-readable JSON blob. Precedence,
 * highest first — explicit requests always outrank inferred ones:
 *   1. `json: true` (explicit machine request, e.g. `--json`)
 *   2. `human: true` (explicit human request, e.g. `--human` / `--no-json`)
 *   3. `FORCE_HUMAN` set to anything but "0"/"false"/"" (explicit, env)
 *   4. stdout is not a TTY (inferred — being piped)
 *   5. `CI=true` (inferred — automation)
 *
 * The default is human form when stdout is a TTY, JSON otherwise.
 *
 * Levels 2 and 3 exist because the inferred signals had no inverse: the moment
 * stdout was not a terminal, the human view became unreachable, so
 * `mytool list | less` was impossible and testing a renderer meant running the
 * CLI under a pty. Reported by a downstream consumer with exactly that
 * workaround in place.
 */

import Table from "cli-table3";
import { isCI, isStdoutTTY } from "./tty.js";

export type OutputMode = "human" | "json";

export interface OutputFlags {
  json?: boolean;
  /**
   * Force human output even when piped or under CI. Bind to `--human` (or a
   * `--no-json` negation). Ignored when `json` is also true: two contradictory
   * explicit requests resolve to the machine-readable one, which is the safer
   * result for something that is probably a pipeline.
   */
  human?: boolean;
  noColor?: boolean;
  quiet?: boolean;
}

/** Env opt-in for the human view, for tools that have not bound a flag. */
function forceHumanEnv(): boolean {
  const raw = process.env.FORCE_HUMAN;
  if (raw === undefined) return false;
  const v = raw.trim().toLowerCase();
  return v !== "" && v !== "0" && v !== "false";
}

export function resolveOutputMode(flags: OutputFlags = {}): OutputMode {
  if (flags.json) return "json";
  if (flags.human || forceHumanEnv()) return "human";
  if (!isStdoutTTY() || isCI()) return "json";
  return "human";
}

export interface TableSpec<T> {
  head: string[];
  rows: (item: T) => Array<string | number>;
}

export function printTable<T>(items: T[], spec: TableSpec<T>): void {
  if (items.length === 0) {
    process.stdout.write("(no results)\n");
    return;
  }
  const table = new Table({ head: spec.head, style: { head: ["cyan"] } });
  for (const item of items) {
    table.push(spec.rows(item) as string[]);
  }
  process.stdout.write(`${table.toString()}\n`);
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Print either a JSON blob or a human-rendered table based on resolved mode.
 * The most common use case for CLI subcommands.
 */
export function printAuto<T>(items: T[], spec: TableSpec<T>, flags?: OutputFlags): void {
  if (resolveOutputMode(flags) === "json") {
    printJson(items);
  } else {
    printTable(items, spec);
  }
}
