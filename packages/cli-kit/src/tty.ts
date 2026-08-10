/**
 * TTY / environment detection helpers.
 *
 * Used by CLI output helpers to switch between human-readable (tables,
 * colors) and machine-readable (JSON) output. Detect CI explicitly because
 * many CI systems set TERM=dumb but still want colors.
 */

export function isStdoutTTY(): boolean {
  return Boolean(process.stdout.isTTY);
}

export function isStderrTTY(): boolean {
  return Boolean(process.stderr.isTTY);
}

export function isStdinTTY(): boolean {
  return Boolean(process.stdin.isTTY);
}

export function isInteractive(): boolean {
  return isStdoutTTY() && isStdinTTY();
}

/**
 * Standard CI env vars set by GitHub Actions, GitLab, CircleCI, Travis, etc.
 *
 * The VALUE is parsed, not merely its presence: `CI=false` is the documented
 * way to tell a tool it is not in CI, and `Boolean(process.env.CI)` reads the
 * string "false" as true. That made `CI=false <tool> <cmd>` force JSON output
 * on a real TTY (see resolveOutputMode in output.ts).
 *
 * Matches ink's `is-in-ci` — `key in env && env[key] !== '0' && env[key] !==
 * 'false'` — with one deliberate difference: an EMPTY value is false here.
 * is-in-ci treats `CI=""` as in-CI; an empty variable conventionally reads as
 * unset, and the previous `Boolean()` already returned false for it, so
 * adopting is-in-ci literally would have been a regression.
 */
const CI_VARS = [
  "CI",
  "CONTINUOUS_INTEGRATION",
  "GITHUB_ACTIONS",
  "GITLAB_CI",
  "CIRCLECI",
  "TRAVIS",
  "BUILDKITE",
] as const;

function envFlagEnabled(value: string | undefined): boolean {
  if (value === undefined || value === "") return false;
  return value !== "0" && value !== "false";
}

export function isCI(): boolean {
  return CI_VARS.some((key) => envFlagEnabled(process.env[key]));
}

/** Respect NO_COLOR (https://no-color.org) and FORCE_COLOR conventions. */
export function colorEnabled(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return isStdoutTTY();
}
