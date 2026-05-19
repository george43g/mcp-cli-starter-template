/**
 * Prompter — inquirer wrapper that enforces non-interactive behavior cleanly.
 *
 * In a real interactive session we just defer to @inquirer/prompts directly
 * (config.ts does this). This module exists for the cases where the
 * scaffolder runs non-interactively (CI, `--yes` flag) — there we want
 * unanswered required prompts to fail loudly rather than hang on stdin.
 */

import { isatty } from "node:tty";

export function isInteractive(): boolean {
  return isatty(process.stdout.fd) && isatty(process.stdin.fd) && !process.env.CI;
}

/**
 * Guard called before any prompt fires. In non-interactive mode, this
 * throws — the caller should have pre-populated the config via commander
 * flags or `--yes` defaults.
 */
export function assertInteractive(promptLabel: string): void {
  if (isInteractive()) return;
  throw new Error(
    `Non-interactive run needs a value for "${promptLabel}". ` +
      `Pass it via a commander flag or run with --yes to accept defaults.`,
  );
}
