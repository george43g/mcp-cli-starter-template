/**
 * External-command source — the escape hatch to whatever secret manager the
 * user actually runs.
 *
 * Deliberately GENERIC: this package names no specific tool. You supply the
 * binary and its arguments; `{VAR}` in any argument is replaced with the
 * canonical `{TOOL_PREFIX}_{NAME}`. That keeps a published package free of any
 * one person's local conventions while still letting them plug theirs in.
 *
 * Configure programmatically:
 *   resolveSecret(ref, { exec: { bin: "/abs/path/to/mgr", args: ["get", "{VAR}"] } })
 *
 * …or by environment (so a tool needs no code change):
 *   SECRET_STORE_EXEC_BIN=/absolute/path/to/manager
 *   SECRET_STORE_EXEC_ARGS="get {VAR} --cached-only"
 *
 * NOT in the default chain unless configured — an unconfigured exec source is
 * a no-op.
 *
 * Two hard-won rules for whatever you point this at:
 *   1. It MUST be non-interactive and fail closed. A manager that falls back to
 *      an interactive/biometric unlock will hang here, then get killed by the
 *      timeout — from a GUI- or launchd-spawned process there is no TTY to
 *      prompt on. Prefer an explicit cache-only flag.
 *   2. Prefer an ABSOLUTE path. A GUI-launched process does not inherit your
 *      shell's PATH, so a bare command name resolves in your terminal and
 *      silently fails everywhere else.
 */

import { execFileSync } from "node:child_process";
import { type SecretRef, type SecretSource, varName } from "./types.js";

export interface ExecSourceConfig {
  /** Binary to run. Use an absolute path. */
  bin: string;
  /** Arguments; any `{VAR}` is replaced with the canonical var name. Defaults to ["{VAR}"]. */
  args?: string[];
  /** Milliseconds before the call is abandoned. Defaults to 5000. */
  timeoutMs?: number;
}

/** Build an exec config from SECRET_STORE_EXEC_* env vars, or null if unset. */
export function execConfigFromEnv(): ExecSourceConfig | null {
  const bin = process.env.SECRET_STORE_EXEC_BIN;
  if (!bin || bin.trim().length === 0) return null;
  const raw = process.env.SECRET_STORE_EXEC_ARGS;
  // Only set `args` when present — the repo compiles with
  // exactOptionalPropertyTypes, so an explicit `undefined` is not assignable.
  if (raw && raw.trim().length > 0) {
    return { bin: bin.trim(), args: raw.trim().split(/\s+/) };
  }
  return { bin: bin.trim() };
}

export function execSource(cfg: ExecSourceConfig): SecretSource {
  return {
    name: "exec",
    async resolve(ref: SecretRef): Promise<string | null> {
      const v = varName(ref);
      const args = (cfg.args ?? ["{VAR}"]).map((a) => a.replaceAll("{VAR}", v));
      try {
        const out = execFileSync(cfg.bin, args, {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
          timeout: cfg.timeoutMs ?? 5_000,
        });
        const trimmed = out.trim();
        return trimmed.length > 0 ? trimmed : null;
      } catch {
        // Missing binary, non-zero exit (e.g. not cached), or timeout.
        return null;
      }
    },
  };
}
