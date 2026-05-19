/**
 * Git helper — minimal wrapper around the git CLI.
 *
 * Rule (from plan §4): prefer the canonical CLI over reimplementing in JS.
 * This is just a thin layer that handles dry-run and surfaces errors.
 */

import type { ShellHelper } from "./shell.js";

export interface GitHelper {
  init(): Promise<void>;
  add(paths: readonly string[]): Promise<void>;
  commit(message: string): Promise<void>;
  /** Returns true if cwd is inside a git work tree. */
  isRepo(): Promise<boolean>;
  /** Returns the current branch name, or undefined if not a repo. */
  currentBranch(): Promise<string | undefined>;
  /** Returns the porcelain status string. */
  status(): Promise<string>;
  /** Returns the absolute path to the repo root. */
  root(): Promise<string | undefined>;
}

export function makeGit(shell: ShellHelper): GitHelper {
  return {
    async init() {
      await shell.run("git", ["init", "--initial-branch=main"]);
    },
    async add(paths) {
      if (paths.length === 0) return;
      await shell.run("git", ["add", ...paths]);
    },
    async commit(message) {
      await shell.run("git", ["commit", "-m", message]);
    },
    async isRepo() {
      const r = await shell.tryRun("git", ["rev-parse", "--is-inside-work-tree"], {
        dryRunOverride: false,
      });
      return r.exitCode === 0 && r.stdout === "true";
    },
    async currentBranch() {
      const r = await shell.tryRun("git", ["branch", "--show-current"], { dryRunOverride: false });
      return r.exitCode === 0 ? r.stdout || undefined : undefined;
    },
    async status() {
      const r = await shell.tryRun("git", ["status", "--porcelain"], { dryRunOverride: false });
      return r.stdout;
    },
    async root() {
      const r = await shell.tryRun("git", ["rev-parse", "--show-toplevel"], {
        dryRunOverride: false,
      });
      return r.exitCode === 0 ? r.stdout || undefined : undefined;
    },
  };
}
