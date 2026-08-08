/**
 * Env + .env sources, and a Vite-style .env precedence loader in plain Node.
 *
 * Absorbed from the former `@george43g/env-loader` (which had no importers) so
 * there is exactly one copy of this logic. `loadEnv`/`parseEnvFile` remain
 * exported for the standalone use case they were written for: reading env
 * *before* spawning a subprocess, with introspection of what was loaded.
 *
 * The Node-native `--env-file-if-exists` flag is preferred in production
 * because it's zero-overhead, but it loads at process start and you can't
 * introspect it.
 *
 * Precedence (later overrides earlier):
 *   .env  →  .env.local  →  .env.[mode]  →  .env.[mode].local
 *
 * Parsing is intentionally minimal — no variable interpolation, quote
 * stripping only. This package stays dependency-free.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type SecretRef, type SecretSource, varName } from "./types.js";

export interface LoadEnvOptions {
  /** Directory containing the .env files. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Mode name, e.g. "production", "test". Defaults to `NODE_ENV` or `"development"`. */
  mode?: string;
  /** If true, merge loaded values into `process.env`. Defaults to false (pure read). */
  apply?: boolean;
  /** If true, don't override values already set in process.env (real env wins). */
  preserveExisting?: boolean;
}

export interface LoadedEnv {
  /** Final merged env after precedence resolution. */
  env: Record<string, string>;
  /** Which files were loaded, in order. */
  files: string[];
}

/**
 * Parse a single `.env` file into KEY=value pairs.
 * - Ignores blank lines and lines starting with `#`.
 * - Strips matching single or double quotes around the value.
 * - Does NOT do variable interpolation.
 */
export function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Load env files using Vite-style precedence. Returns the merged env plus the
 * files actually read. Pure by default; pass `apply: true` to mutate process.env.
 */
export function loadEnv(opts: LoadEnvOptions = {}): LoadedEnv {
  const cwd = opts.cwd ?? process.cwd();
  const mode = opts.mode ?? process.env.NODE_ENV ?? "development";

  const candidates = [".env", ".env.local", `.env.${mode}`, `.env.${mode}.local`];

  const env: Record<string, string> = {};
  const files: string[] = [];

  for (const name of candidates) {
    const path = join(cwd, name);
    if (!existsSync(path)) continue;
    try {
      const parsed = parseEnvFile(readFileSync(path, "utf8"));
      Object.assign(env, parsed);
      files.push(name);
    } catch {
      // Skip unreadable files silently.
    }
  }

  if (opts.apply) {
    for (const [k, v] of Object.entries(env)) {
      if (opts.preserveExisting && k in process.env) continue;
      process.env[k] = v;
    }
  }

  return { env, files };
}

function pick(bag: Record<string, string | undefined>, ref: SecretRef): string | null {
  const v = varName(ref);
  // `_JSON` is accepted as an alias so a tool can store a structured blob under
  // an obvious name. This package returns the RAW string either way — parsing
  // (and deciding which field is the token) is the caller's policy, not ours.
  for (const key of [v, `${v}_JSON`]) {
    const value = bag[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

/**
 * Source: the real process environment. First in the default chain — an
 * explicitly exported variable is the most deliberate signal there is, and it
 * is what a secret manager (mise, direnv, opkeep, a systemd unit) populates.
 */
export const envSource: SecretSource = {
  name: "env",
  async resolve(ref: SecretRef): Promise<string | null> {
    return pick(process.env, ref);
  },
};

/**
 * Source: `.env` files, resolved with the precedence above. Second in the
 * chain — a project-local convenience that must never beat a real exported
 * env var (12-factor; also why `loadEnv` is called without `apply`).
 */
export function envFileSource(opts: LoadEnvOptions = {}): SecretSource {
  return {
    name: "env-file",
    async resolve(ref: SecretRef): Promise<string | null> {
      try {
        return pick(loadEnv(opts).env, ref);
      } catch {
        return null;
      }
    },
  };
}
