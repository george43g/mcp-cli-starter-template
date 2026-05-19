import ora, { type Ora } from "ora";

/**
 * Tiny ora wrapper — gives migrations a uniform spinner API without
 * coupling them to ora directly.
 */

export interface ProgressTracker {
  start(label: string): void;
  succeed(label?: string): void;
  fail(label?: string): void;
  stop(): void;
}

export function makeProgress(opts: { silent?: boolean } = {}): ProgressTracker {
  let spinner: Ora | undefined;

  return {
    start(label) {
      if (opts.silent) return;
      spinner = ora(label).start();
    },
    succeed(label) {
      spinner?.succeed(label);
      spinner = undefined;
    },
    fail(label) {
      spinner?.fail(label);
      spinner = undefined;
    },
    stop() {
      spinner?.stop();
      spinner = undefined;
    },
  };
}
