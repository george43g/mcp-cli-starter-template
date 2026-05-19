/**
 * Config — the IoC root holding every setting the scaffolder might ask about.
 *
 * Migrations read `ctx.config.global.repoName` (etc.); the leaf's `get()` may
 * pause to prompt the user via inquirer if the value hasn't been set yet.
 *
 * The shape is intentionally hand-rolled (not Proxy magic) so a migration
 * author can ⌘-click into `Config` and see exactly which settings exist.
 *
 * Adding a new setting: drop a `configLeaf<T>({ ... })(this)` into the
 * appropriate group (e.g. `this.global.X = configLeaf<...>(...)`). The
 * `(this)` invocation hands the new leaf the Config root so its `skipIf`
 * predicate can call `.peek()` on sibling leaves.
 */

import { input, select } from "@inquirer/prompts";
import { type ConfigLeaf, configLeaf } from "./config-leaf.js";

export type ApplyMode = "new" | "existing";
export type PackageManager = "pnpm" | "npm" | "bun";

export class Config {
  global: {
    /** Whether we're scaffolding a fresh repo or applying to an existing one. */
    mode: ConfigLeaf<ApplyMode>;
    /** Target tool name (kebab-case). Only asked in mode='new'. */
    repoName: ConfigLeaf<string>;
    /** Npm scope (with leading @) for the generated packages. */
    scope: ConfigLeaf<string>;
    /** Package manager to use. */
    packageManager: ConfigLeaf<PackageManager>;
    /** Set up as a Turborepo monorepo, vs flat single-package layout. */
    monorepo: ConfigLeaf<boolean>;
  };

  /**
   * Per-phase / per-feature toggles. Each group corresponds to a phase
   * directory under `src/phases/` and holds the leaves used by migrations
   * in that phase.
   */
  features: {
    /** Whether to include the Ink/React TUI in the generated scaffold. */
    tui: ConfigLeaf<boolean>;
    /** Whether to wire up the Streamable HTTP transport. */
    http: ConfigLeaf<boolean>;
    /** Whether to include the optional Rust acceleration crate. */
    rustAccel: ConfigLeaf<boolean>;
    /** Whether to enable semantic-release (workflow ships disabled by default). */
    semanticRelease: ConfigLeaf<boolean>;
  };

  constructor() {
    this.global = {
      mode: configLeaf<ApplyMode>({
        ask: async () =>
          select({
            message: "Scaffold a fresh starter or apply rules to an existing repo?",
            choices: [
              { name: "Fresh scaffold (new directory)", value: "new" as const },
              { name: "Apply rules to existing repo", value: "existing" as const },
            ],
            default: "new",
          }),
      })(this),

      repoName: configLeaf<string>({
        ask: async () =>
          input({
            message: "Tool name (kebab-case, e.g. wm-stack-mcp)?",
            validate: (v) =>
              /^[a-z][a-z0-9-]*$/.test(v) || "kebab-case lowercase, starts with letter",
          }),
        skipIf: (c) => c.global.mode.peek() === "existing",
        validate: (v) => {
          if (!/^[a-z][a-z0-9-]*$/.test(v)) {
            throw new Error(`Invalid repoName "${v}" — must be kebab-case`);
          }
        },
      })(this),

      scope: configLeaf<string>({
        ask: async () =>
          input({
            message: "Npm scope (with @) — leave empty for unscoped?",
            default: "@george43g",
          }),
      })(this),

      packageManager: configLeaf<PackageManager>({
        ask: async () =>
          select({
            message: "Package manager?",
            choices: [
              { name: "pnpm (recommended)", value: "pnpm" as const },
              { name: "npm", value: "npm" as const },
              { name: "bun", value: "bun" as const },
            ],
            default: "pnpm",
          }),
      })(this),

      monorepo: configLeaf<boolean>({
        ask: async () =>
          select({
            message: "Set up as a Turborepo monorepo (apps/* + packages/*)?",
            choices: [
              { name: "Yes — monorepo (recommended for shared infra)", value: true },
              { name: "No — single package", value: false },
            ],
            default: true,
          }),
        skipIf: (c) => c.global.mode.peek() === "existing",
      })(this),
    };

    this.features = {
      tui: configLeaf<boolean>({
        ask: async () =>
          select({
            message: "Include the Ink/React TUI surface?",
            choices: [
              { name: "Yes — full demo TUI with vim keys + dev stats", value: true },
              { name: "No — drop the TUI", value: false },
            ],
            default: true,
          }),
      })(this),

      http: configLeaf<boolean>({
        ask: async () =>
          select({
            message: "Wire up Streamable HTTP transport (in addition to stdio)?",
            choices: [
              { name: "Yes — both transports (`--http` flag flips between)", value: true },
              { name: "No — stdio only", value: false },
            ],
            default: true,
          }),
      })(this),

      rustAccel: configLeaf<boolean>({
        ask: async () =>
          select({
            message: "Include the optional Rust acceleration crate (apps/rust-accel)?",
            choices: [
              { name: "Yes — napi-rs v3 stub with drift-check", value: true },
              { name: "No — TS only", value: false },
            ],
            default: true,
          }),
      })(this),

      semanticRelease: configLeaf<boolean>({
        ask: async () =>
          select({
            message:
              "Enable semantic-release workflow (ships disabled by default — you toggle it on)?",
            choices: [
              { name: "Yes — include the workflow + .releaserc.json", value: true },
              { name: "No — skip release infra", value: false },
            ],
            default: true,
          }),
      })(this),
    };
  }
}
