/**
 * Logger — feeds the per-migration progress UI and the end-of-run recap.
 *
 * Tiny by design. The UI module decorates this with spinners / colors;
 * the logger itself just collects records.
 */

import kleur from "kleur";
import type { MigrationResult } from "./migration.js";

export interface LogRecord {
  migrationId: string;
  result: MigrationResult;
  durationMs: number;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  /** Record a migration's outcome — consumed by the recap. */
  record(rec: LogRecord): void;
  /** Get all records (in the order they were recorded). */
  records(): readonly LogRecord[];
}

export function makeLogger(options: { verbose: boolean }): Logger {
  const records: LogRecord[] = [];
  return {
    info(message) {
      if (options.verbose) process.stderr.write(`${kleur.dim("·")} ${message}\n`);
    },
    warn(message) {
      process.stderr.write(`${kleur.yellow("!")} ${message}\n`);
    },
    error(message) {
      process.stderr.write(`${kleur.red("✗")} ${message}\n`);
    },
    record(rec) {
      records.push(rec);
    },
    records() {
      return records;
    },
  };
}
