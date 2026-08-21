/**
 * JSON serialisation that a code formatter will leave alone.
 *
 * `JSON.stringify(doc, null, 2)` expands EVERY array, one element per line.
 * Biome and Prettier both collapse an array of primitives that fits the line
 * width. So a generated config re-expanded on every reconcile and the repo's
 * formatter re-collapsed it, forever — a file with two owners.
 *
 * That was never a decision here; it was the default of the serialiser reached
 * for. Reported by the life-stack session, who asked whether the expansion was
 * deliberate — a one-line diff when a single argument changes is a real benefit
 * and would have been a fine reason to keep it. It wasn't the reason. There
 * wasn't one.
 *
 * WIDTH 80 IS NOT ARBITRARY, and it is not this repo's 100. It is both Biome's
 * and Prettier's default, and an array collapsed at 80 is left alone by any
 * formatter configured at 80 OR WIDER. Choosing 100 would satisfy this repo and
 * break a consumer on the default.
 *
 * THE HONEST LIMIT: no width fixes every case. An array between the formatter's
 * width and 80 still gets expanded here and collapsed there. For `command` and
 * `args` arrays that is vanishingly rare — the longest in any config surveyed
 * was 55 characters — but it is a narrowing of the conflict, not an elimination
 * of it. Two tools owning the same bytes cannot be fully reconciled by one.
 */

const INDENT = "  ";

const isPrimitive = (v: unknown): boolean =>
  v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";

function serialise(value: unknown, depth: number, prefixLen: number, lineWidth: number): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (value.every(isPrimitive)) {
      const collapsed = `[${value.map((v) => JSON.stringify(v)).join(", ")}]`;
      // +1 reserves the trailing comma this value may carry in its parent.
      if (prefixLen + collapsed.length + 1 <= lineWidth) return collapsed;
    }
    const pad = INDENT.repeat(depth + 1);
    const items = value.map((v) => pad + serialise(v, depth + 1, pad.length, lineWidth));
    return `[\n${items.join(",\n")}\n${INDENT.repeat(depth)}]`;
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined,
    );
    if (entries.length === 0) return "{}";
    const pad = INDENT.repeat(depth + 1);
    const items = entries.map(([k, v]) => {
      const key = `${JSON.stringify(k)}: `;
      return pad + key + serialise(v, depth + 1, pad.length + key.length, lineWidth);
    });
    return `{\n${items.join(",\n")}\n${INDENT.repeat(depth)}}`;
  }

  // Objects are always expanded, matching what both formatters do for JSON —
  // only arrays of primitives collapse.
  return JSON.stringify(value) ?? "null";
}

/** Like `JSON.stringify(value, null, 2)`, but collapses short primitive arrays. */
export function formatJson(value: unknown, lineWidth = 80): string {
  return serialise(value, 0, 0, lineWidth);
}
