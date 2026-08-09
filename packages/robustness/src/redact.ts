/**
 * Redaction rules — full phone numbers and secret-shaped strings never leave
 * the process boundary: the ring buffer, NDJSON files, and the stderr mirror
 * only ever see a last-four suffix or "[redacted]".
 *
 * Lifted from EQStack's voice-mcp (domain/redact.ts), which enforced the same
 * invariant at its config boundary. One deviation: `redactValue` carries a
 * cycle guard, because here it runs on the logger's hot path where the
 * never-throw invariant applies and caller-supplied data can be circular.
 */

/** E.164-ish: "+" followed by 7–15 digits, optionally spaced/hyphenated. */
const PHONE_RE = /\+\d[\d\s\-().]{5,17}\d/g;

/** Bearer/API-key shapes known to circulate in MCP stacks. */
const SECRET_RE =
  /\b(sk-[A-Za-z0-9-]{10,}|github_pat_[A-Za-z0-9_]{10,}|gh[pousr]_[A-Za-z0-9]{10,}|SK[a-f0-9]{32}|AC[a-f0-9]{32})\b/g;

export function lastFour(number: string): string {
  const digits = number.replace(/\D/g, "");
  return digits.slice(-4);
}

/** Redact a string: phone numbers become "…NNNN", secret shapes become "[redacted]". */
export function redactString(input: string): string {
  return input.replace(PHONE_RE, (m) => `…${lastFour(m)}`).replace(SECRET_RE, "[redacted]");
}

/**
 * Deep-redact any JSON-ish value. Non-serializable leaves pass through
 * untouched; circular references become "[circular]" instead of recursing.
 */
export function redactValue(value: unknown): unknown {
  return redactInner(value, new WeakSet());
}

// `seen` holds the current ancestor path, not everything visited: a diamond
// (the same object referenced twice without a cycle) survives, matching what
// JSON.stringify would accept.
function redactInner(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    const out = value.map((v) => redactInner(v, seen));
    seen.delete(value);
    return out;
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactInner(v, seen);
    }
    seen.delete(value);
    return out;
  }
  return value;
}
