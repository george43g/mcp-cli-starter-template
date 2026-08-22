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

/**
 * Email-ish: something, an `@`, a dotted host. Deliberately UNANCHORED, because
 * a redaction rule has to find addresses inside prose.
 *
 * That is also why email redaction is OFF by default — see `RedactOptions`.
 */
const EMAIL_RE = /[^\s@<>()[\]{},;:"']+@[^\s@<>()[\]{},;:"']+\.[^\s@<>()[\]{},;:"']+/g;

/** Bearer/API-key shapes known to circulate in MCP stacks. */
const SECRET_RE =
  /\b(sk-[A-Za-z0-9-]{10,}|github_pat_[A-Za-z0-9_]{10,}|gh[pousr]_[A-Za-z0-9]{10,}|SK[a-f0-9]{32}|AC[a-f0-9]{32})\b/g;

export function lastFour(number: string): string {
  const digits = number.replace(/\D/g, "");
  return digits.slice(-4);
}

/**
 * Mask one email address: first character of the local part, then the domain.
 *
 * `george.x@gmail.com` → `g…@gmail.com`; a local part of 2 characters or fewer
 * becomes `…@gmail.com`.
 *
 * **Not the `lastFour` shape, deliberately.** Keeping first AND last would
 * mirror the phone rule, but the analogy breaks at the short end: `lastFour`
 * shows 4 of a phone's 7–15 digits and can never disclose the whole number,
 * whereas first+last of a two-character local part IS the whole local part —
 * `al@x.com` → `a…l@x.com` discloses the address it was asked to hide.
 * Raised by the EQStack session against the first proposal, and correct.
 *
 * **The domain is preserved on purpose.** It is the half that makes a log line
 * diagnostic ("the failure is on gmail.com addresses") and rarely the half that
 * identifies a person.
 *
 * Exported so a consumer can apply it at a boundary it KNOWS carries addresses
 * — an API error object quoting a recipient — without turning on the global
 * rule and its false positives.
 */
export function redactEmail(address: string): string {
  const at = address.lastIndexOf("@");
  if (at <= 0) return address;
  const local = address.slice(0, at);
  const domain = address.slice(at);
  return local.length <= 2 ? `…${domain}` : `${local[0]}…${domain}`;
}

export interface RedactOptions {
  /**
   * Also mask email addresses. **Defaults to false, and the default is a
   * measurement rather than caution.**
   *
   * An unanchored email pattern matches far more than mail. Against realistic
   * log lines, five of six matches are not addresses:
   *
   * ```
   * "sending to george.x@gmail.com failed"          → george.x@gmail.com   ← the only true positive
   * "clone git@github.com:george43g/x.git"          → the whole clone URL
   * "resolved lodash@4.17.21 from registry"         → lodash@4.17.21
   * "specifier @george43g/robustness@0.11.0"        → george43g/robustness@0.11.0
   * "postgres://svc@db.internal.corp/main"          → the whole URL
   * ```
   *
   * The phone rule earns default-on because `+` followed by 7–15 digits is an
   * unambiguous shape. `x@y.z` is also the shape of a version specifier and an
   * SSH remote, so a default-on rule would corrupt the logs of every consumer
   * to protect the two that handle mail. An exclusion list was considered and
   * rejected: `git@`, `scheme://user@host` and `name@semver` already show it is
   * a treadmill.
   */
  emails?: boolean;
}

/**
 * Redact a string: phone numbers become "…NNNN", secret shapes become
 * "[redacted]", and — only with `{ emails: true }` — addresses are masked.
 */
export function redactString(input: string, options: RedactOptions = {}): string {
  const out = input.replace(PHONE_RE, (m) => `…${lastFour(m)}`).replace(SECRET_RE, "[redacted]");
  return options.emails ? out.replace(EMAIL_RE, (m) => redactEmail(m)) : out;
}

/**
 * Deep-redact any JSON-ish value. Non-serializable leaves pass through
 * untouched; circular references become "[circular]" instead of recursing.
 */
export function redactValue(value: unknown, options: RedactOptions = {}): unknown {
  return redactInner(value, new WeakSet(), options);
}

// `seen` holds the current ancestor path, not everything visited: a diamond
// (the same object referenced twice without a cycle) survives, matching what
// JSON.stringify would accept.
function redactInner(value: unknown, seen: WeakSet<object>, options: RedactOptions): unknown {
  if (typeof value === "string") return redactString(value, options);
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    const out = value.map((v) => redactInner(v, seen, options));
    seen.delete(value);
    return out;
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactInner(v, seen, options);
    }
    seen.delete(value);
    return out;
  }
  return value;
}
