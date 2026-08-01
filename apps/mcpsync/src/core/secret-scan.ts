/**
 * Redacted plaintext-secret scanner. Flags string values that look like a real
 * secret and are NOT a `${VAR}` / `{env:VAR}` placeholder. NEVER prints the
 * value — a hit reports only its location. Ported from `~/dotfiles/mcp/status.js`
 * (the guards there encode hard-won false-positive lessons), but it walks each
 * host adapter's `readRaw()` map instead of re-parsing config files — so it and
 * the sync path read hosts exactly one way.
 */

import type { HostAdapter } from "./hosts/types.js";

const SECRET_HINT = /(key|token|secret|authorization|password|bearer|api[_-]?key)/i;
const SECRET_FLAG = /^--?(api[-_]?key|apikey|key|token|secret|auth|password|pat|bearer)$/i;
const SECRETY = [
  /sk-[A-Za-z0-9]/,
  /gh[posru]_[A-Za-z0-9]/,
  /github_pat_/,
  /xox[baprs]-/,
  /AIza[0-9A-Za-z_-]{10}/,
  /ctx7sk[-_]/i,
];

/** A `${VAR}` (Cursor/Warp/Desktop) or `{env:VAR}` (opencode) reference — never a literal. */
export const isPlaceholder = (v: unknown): boolean =>
  typeof v === "string" && (v.includes("${") || v.includes("{env:"));

const knownSecretToken = (v: string): boolean =>
  !isPlaceholder(v) && SECRETY.some((re) => re.test(v));

/** Whether `field = val` looks like an inlined literal secret (redaction target). */
export function looksSecret(field: string, val: unknown): boolean {
  if (typeof val !== "string" || isPlaceholder(val)) return false;
  // Fields that hold an env-var NAME, not a value (codex bearer_token_env_var, env_vars).
  if (/env[_-]?vars?$|_env_var$/i.test(field)) return false;
  // A SCREAMING_SNAKE_CASE value is an env-var name reference, not a literal.
  if (/^[A-Z][A-Z0-9_]{3,}$/.test(val)) return false;
  if (knownSecretToken(val)) return true;
  if (SECRET_HINT.test(field) && /[A-Za-z0-9_-]{20,}/.test(val.replace(/^Bearer\s+/i, "")))
    return true;
  return false;
}

/**
 * Scan a command/args array: a value right after a secret flag (`--api-key <X>`)
 * or one matching a known secret shape. Deliberately NOT generic high-entropy —
 * that false-positives on the UUIDs / session ids that live in these configs.
 */
function scanArgs(arr: unknown[], where: string, out: string[], trail: (string | number)[]): void {
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (typeof v !== "string" || isPlaceholder(v)) continue;
    const prev = arr[i - 1];
    const afterFlag = i > 0 && typeof prev === "string" && SECRET_FLAG.test(prev);
    if ((afterFlag && v.length >= 8) || knownSecretToken(v)) {
      out.push(
        `${where}: literal secret in ${[...trail, i].join(".")}` +
          (afterFlag ? ` (after ${String(prev)})` : "") +
          " (redacted) — use ${VAR}",
      );
    }
  }
}

function walk(obj: unknown, where: string, out: string[], trail: (string | number)[]): void {
  if (obj == null) return;
  if (Array.isArray(obj)) {
    const last = trail[trail.length - 1];
    if (last === "args" || last === "command") scanArgs(obj, where, out, trail);
    obj.forEach((v, i) => {
      if (v && typeof v === "object") walk(v, where, out, [...trail, i]);
    });
    return;
  }
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      if (looksSecret(k, v))
        out.push(`${where}: literal secret in ${[...trail, k].join(".")} (redacted) — use \${VAR}`);
      else walk(v, where, out, [...trail, k]);
    }
  }
}

/** Redacted secret warnings for one host's native `mcpServers` map. */
export function scanHostSecrets(hostLabel: string, servers: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [name, native] of Object.entries(servers)) {
    walk(native, `${hostLabel}:${name}`, out, []);
  }
  return out;
}

export interface HostSecretReport {
  host: string;
  warnings: string[];
}

/** Scan every given host's `readRaw()` for inlined plaintext secrets (read-only). */
export function scanHostsForSecrets(hosts: HostAdapter[]): HostSecretReport[] {
  return hosts
    .map((h) => ({ host: h.id, warnings: scanHostSecrets(h.id, h.readRaw()) }))
    .filter((r) => r.warnings.length > 0);
}
