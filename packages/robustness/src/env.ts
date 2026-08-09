/**
 * Environment variable helpers for the robustness library.
 *
 * Pure functions, no side effects. All helpers fall back to the provided
 * default when the variable is unset, empty, or fails validation.
 *
 * Convention: robustness knobs use the MCP_ prefix so this module is portable
 * across MCP servers. Project-specific knobs use their own prefix
 * (e.g. EXAMPLE_REPO_) and should not be read through this helper.
 */

export function envNum(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

const TRUTHY = new Set(["1", "true", "yes", "on"]);
const FALSY = new Set(["0", "false", "no", "off"]);

export function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const lower = raw.trim().toLowerCase();
  if (TRUTHY.has(lower)) return true;
  if (FALSY.has(lower)) return false;
  return fallback;
}

export function envStr(name: string, fallback: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw;
}

/**
 * Normalise a caller-supplied env-var prefix into the fragment that gets
 * spliced into variable NAMES — `"imsg_"` → `"IMSG"`, so the watchdog reads
 * `IMSG_MAX_RSS_MB` and the logger reads `IMSG_LOG_DIR`.
 *
 * Validated rather than sanitised: a prefix that is not a legal identifier
 * fragment produces variable names nobody can set from a shell, so failing at
 * configuration time beats silently reading `MY-APP_LOG_DIR` forever.
 *
 * `subject` names the caller in the error message. The watchdog's wording is
 * pinned by its own tests, so pass `"watchdog"` there.
 */
export function normalizeEnvPrefix(prefix: string, subject: string): string {
  const normalized = prefix.replace(/_+$/, "").toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*$/.test(normalized)) {
    throw new Error(`Invalid ${subject} envPrefix "${prefix}"`);
  }
  return normalized;
}
