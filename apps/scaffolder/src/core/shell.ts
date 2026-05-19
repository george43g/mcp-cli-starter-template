/**
 * Shell helper — execa wrapper with sane defaults for migration use.
 *
 * Why this exists rather than calling execa directly: migrations want a
 * uniform API that handles the dry-run case, surfaces errors with the same
 * shape, and lets us swap the implementation in tests.
 */

import { type Options as ExecaOptions, execa } from "execa";

export interface ShellRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ShellHelper {
  /** Run a command and return its stdout (trimmed). Throws on non-zero exit. */
  run(command: string, args?: readonly string[], opts?: ShellRunOptions): Promise<ShellRunResult>;
  /** Like `run` but doesn't throw on non-zero exit. */
  tryRun(
    command: string,
    args?: readonly string[],
    opts?: ShellRunOptions,
  ): Promise<ShellRunResult>;
  /** Whether dry-run mode is active — migrations should consult this. */
  readonly dryRun: boolean;
}

export interface ShellRunOptions {
  cwd?: string;
  env?: Record<string, string>;
  /** Inherit stdio (default) or capture into the result. */
  inherit?: boolean;
  /** Override dry-run for this single call (e.g. read-only checks must still execute). */
  dryRunOverride?: boolean;
}

export function makeShell(options: { cwd: string; dryRun: boolean }): ShellHelper {
  async function exec(
    command: string,
    args: readonly string[] = [],
    opts: ShellRunOptions = {},
    failOnError: boolean,
  ): Promise<ShellRunResult> {
    const dryRun = opts.dryRunOverride ?? options.dryRun;
    if (dryRun) {
      return { stdout: "", stderr: "[dry-run]", exitCode: 0 };
    }
    const execaOpts: ExecaOptions = opts.env
      ? {
          cwd: opts.cwd ?? options.cwd,
          stdio: opts.inherit ? "inherit" : "pipe",
          reject: failOnError,
          env: opts.env,
        }
      : {
          cwd: opts.cwd ?? options.cwd,
          stdio: opts.inherit ? "inherit" : "pipe",
          reject: failOnError,
        };
    const result = await execa(command, args, execaOpts);
    return {
      stdout: String(result.stdout ?? "").trim(),
      stderr: String(result.stderr ?? ""),
      exitCode: result.exitCode ?? 0,
    };
  }

  return {
    dryRun: options.dryRun,
    run: (command, args, opts) => exec(command, args, opts, true),
    tryRun: (command, args, opts) => exec(command, args, opts, false),
  };
}
