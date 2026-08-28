/**
 * Sanitize untrusted user text before emitting via MCP or terminal.
 *
 * Lifted from imsg-mcp/src/sanitize.ts.
 *
 * - Strips ANSI CSI and OSC escape sequences to prevent terminal corruption.
 * - Replaces NUL bytes and C0 control characters (except \n, \t, \r) with
 *   U+FFFD (Replacement Character) — keeps text scannable while making the
 *   substitution visible.
 * - Truncates the string if it exceeds `maxLength` (default 4096),
 *   appending a horizontal ellipsis.
 *
 * Call this on every user-content surface in tool responses: chat
 * snippets, search results, anything originally typed by a human or
 * sourced from a system you don't control.
 */

const ANSI_REGEX = new RegExp(
  [
    "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
    "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))",
  ].join("|"),
  "g",
);

// Matches C0 control characters, excluding \t (0x09), \n (0x0A), and \r (0x0D)
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

export function sanitize(text: string | null | undefined, maxLength = 4096): string | null {
  if (text == null) return null;
  let sanitized = text.replace(ANSI_REGEX, "");
  sanitized = sanitized.replace(CONTROL_CHAR_REGEX, "�");
  if (sanitized.length > maxLength) {
    sanitized = `${sanitized.slice(0, maxLength - 1)}…`;
  }
  return sanitized;
}

/**
 * Default budget for {@link sanitizeContent} — 1 MiB.
 *
 * Sized for *documents*, not snippets: page text, file contents, a transcript.
 * `sanitize`'s 4096 default is right for a chat line and destroys anything
 * larger, which is why a second entry point exists rather than a different
 * default on the same one.
 */
export const CONTENT_BUDGET = 1_048_576;

/**
 * Sanitize a large untrusted CONTENT payload — page text, a file, a transcript.
 *
 * Same escape/control-character handling as {@link sanitize}. Three deliberate
 * differences, each of which is why this could not just be `sanitize(x, 1e6)`:
 *
 * 1. **Never returns `null`.** `null`/`undefined` in yields `""` out, so callers
 *    can concatenate and measure without a guard at every site. `sanitize`
 *    returning `null` is right for "was there a message?"; it is wrong for
 *    "render this body".
 * 2. **A 1 MiB budget** rather than 4096 — see {@link CONTENT_BUDGET}.
 * 3. **Truncation is ANNOUNCED**, with `…[truncated]` rather than a bare `…`.
 *    A silently shortened document is indistinguishable from a document that
 *    really ended there, and a model reading it will confidently answer from the
 *    part it received. The marker is the whole point.
 *
 * Lifted from browser-tab-mcp, which carried it in a vendored copy of this
 * package and asked for it upstream when the vendoring ended. Semantics are
 * theirs and were deliberately not "improved" during the lift.
 */
export function sanitizeContent(
  text: string | null | undefined,
  maxLength = CONTENT_BUDGET,
): string {
  if (text == null) return "";
  let sanitized = text.replace(ANSI_REGEX, "");
  sanitized = sanitized.replace(CONTROL_CHAR_REGEX, "�");
  if (sanitized.length > maxLength) {
    sanitized = `${sanitized.slice(0, maxLength)}…[truncated]`;
  }
  return sanitized;
}
