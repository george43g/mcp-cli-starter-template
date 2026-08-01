/**
 * POSIX double-quote a token, escaping \ " ` but leaving $ ACTIVE so ${VAR}
 * placeholders expand in the login shell at launch (Claude Desktop never
 * expands ${VAR} itself).
 *
 * SAFE ONLY for our own controlled manifest values — the canonical manifest is
 * ${VAR}-only with no untrusted $() / backticks. Do NOT feed untrusted input
 * through this: an active $ means `$(cmd)` in a value would execute.
 *
 * Ported verbatim from ~/dotfiles/mcp/render.js.
 */
export function shdq(s: string): string {
  return `"${String(s).replace(/([\\"`])/g, "\\$1")}"`;
}
