/**
 * Optional local credentials vault — `~/.mcpsync/credentials.json` at mode 0600
 * (its dir at 0700). Ported from imsg-mcp's `app-config.ts`: an unconditional
 * `chmodSync` after every write, and a read that NEVER throws (a missing or
 * corrupt file resolves to `{}`), so a broken vault degrades to "no secrets"
 * rather than crashing a sync.
 *
 * Contract (the Locked Contract's secrets invariant): the vault holds real
 * secret VALUES keyed by server name; `${VAR}` placeholders in the canonical
 * manifest stay verbatim in every host config. mcpsync NEVER inlines a resolved
 * value into a host file — the vault only ever backs env-var indirection and
 * powers `doctor`'s reachability report. Getting a secret out of the shell env
 * and into a 0600 file is the whole point; writing it into a world-readable
 * config would defeat it.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { McpServer } from "./schema.js";

export const CREDENTIALS_DEFAULT = join(homedir(), ".mcpsync", "credentials.json");

/** server name → { ENV_VAR: value }. Real values; private to this machine. */
export type Credentials = Record<string, Record<string, string>>;

/** Parse the vault; return {} on a missing or unparseable file (never throws). */
export function readCredentials(path: string = CREDENTIALS_DEFAULT): Credentials {
  if (!existsSync(path)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed || typeof parsed !== "object") return {};
    const out: Credentials = {};
    for (const [name, vars] of Object.entries(parsed as Record<string, unknown>)) {
      if (!vars || typeof vars !== "object") continue;
      const entry: Record<string, string> = {};
      for (const [k, v] of Object.entries(vars as Record<string, unknown>)) {
        if (typeof v === "string") entry[k] = v;
      }
      out[name] = entry;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Persist the vault, then unconditionally tighten permissions: dir 0700, file
 * 0600. The chmod is unconditional (not gated on "did we just create it") so a
 * vault whose mode drifted is repaired on the next write — this is imsg's
 * behaviour and the reason the mode assertion in the tests holds.
 */
export function writeCredentials(creds: Credentials, path: string = CREDENTIALS_DEFAULT): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  chmodSync(dir, 0o700);
  writeFileSync(path, `${JSON.stringify(creds, null, 2)}\n`);
  chmodSync(path, 0o600);
}

/** Set one `server.KEY = value`, merging into the existing vault. Returns the new vault. */
export function setCredential(
  server: string,
  key: string,
  value: string,
  path: string = CREDENTIALS_DEFAULT,
): Credentials {
  const creds = readCredentials(path);
  creds[server] = { ...(creds[server] ?? {}), [key]: value };
  writeCredentials(creds, path);
  return creds;
}

/** Remove one KEY (or the whole server entry when `key` is omitted). Returns the new vault. */
export function removeCredential(
  server: string,
  key: string | undefined,
  path: string = CREDENTIALS_DEFAULT,
): Credentials {
  const creds = readCredentials(path);
  if (key === undefined) {
    delete creds[server];
  } else if (creds[server]) {
    delete creds[server][key];
    if (Object.keys(creds[server]).length === 0) delete creds[server];
  }
  writeCredentials(creds, path);
  return creds;
}

const VAR_RE = /\$\{([A-Z0-9_]+)\}/g;

/** Every `${VAR}` name referenced anywhere in a server's command/args/env/url/headers. */
export function referencedVars(server: McpServer): string[] {
  const fields: string[] = [];
  if (server.command) fields.push(server.command);
  if (server.args) fields.push(...server.args);
  if (server.url) fields.push(server.url);
  if (server.env) fields.push(...Object.values(server.env));
  if (server.headers) fields.push(...Object.values(server.headers));
  const names = new Set<string>();
  for (const f of fields) for (const m of f.matchAll(VAR_RE)) names.add(m[1] as string);
  return [...names].sort((a, b) => a.localeCompare(b));
}

export type RefSource = "credentials" | "env" | "unresolved";

/**
 * Where a `${VAR}` a server references would resolve from — the vault entry for
 * that server first, then the process env, else unresolved. Reports the SOURCE,
 * never the value; `doctor` uses this to answer "is this secret reachable?"
 * without printing anything sensitive.
 */
export function resolveRef(
  varName: string,
  serverName: string,
  creds: Credentials,
  env: NodeJS.ProcessEnv = process.env,
): RefSource {
  if (creds[serverName]?.[varName] !== undefined) return "credentials";
  if (typeof env[varName] === "string" && env[varName] !== "") return "env";
  return "unresolved";
}
