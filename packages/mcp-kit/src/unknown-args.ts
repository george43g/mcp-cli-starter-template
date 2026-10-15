/**
 * `strictArgs` support: which argument names a tool declares, which a call
 * sent that it does not, and "did you mean …?" for each.
 *
 * Internal: nothing here is re-exported from the package. A general
 * string-suggestion helper is not what mcp-kit is for, and every export is
 * surface to keep stable.
 */

import type { McpJsonSchema, UnknownArgument } from "./tool-registry.js";

/**
 * Optimal-string-alignment distance: Levenshtein plus adjacent transposition,
 * so `chatIdentifer` → `chatIdentifier` is 1 and `limti` → `limit` is 1.
 *
 * Returns `max + 1` as soon as the distance is known to exceed `max`, so a
 * long unrelated key costs one row, not a full matrix.
 */
export function editDistance(a: string, b: string, max = Number.POSITIVE_INFINITY): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, (prev2[j - 2] ?? 0) + 1);
      }
      cur[j] = d;
      if (d < rowMin) rowMin = d;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length] ?? 0;
}

/**
 * The closest candidate within 2 edits, or `undefined`.
 *
 * Two guards against noise: the distance must also be at most half the
 * candidate's length (so `q` does not suggest `id`), and a tie goes to the
 * candidate listed first, so the suggestion is deterministic.
 */
export function closestMatch(input: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const limit = Math.min(2, Math.floor(candidate.length / 2));
    const d = editDistance(input, candidate, limit);
    if (d <= limit && d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * The top-level argument names an input wire schema declares, or `null` when
 * the schema declares itself open (`additionalProperties` other than `false`,
 * `patternProperties`, or `propertyNames`), in which case no name is unknown.
 *
 * Read from the wire schema rather than the Zod object so that "unknown" means
 * exactly "not advertised to the client", for every Zod shape that converts to
 * a top-level object: a refined or transformed `z.object`, and an intersection,
 * which Zod 4 merges into one `properties` map.
 */
export function declaredArgs(inputSchema: McpJsonSchema): readonly string[] | null {
  const extra = inputSchema.additionalProperties;
  if (
    (extra !== undefined && extra !== false) ||
    inputSchema.patternProperties !== undefined ||
    inputSchema.propertyNames !== undefined
  ) {
    return null;
  }
  const props = inputSchema.properties;
  return props !== null && typeof props === "object" ? Object.keys(props) : [];
}

/** Keys of `args` not in `declared`, each with its nearest declared name. */
export function findUnknownArgs(
  declared: readonly string[] | null,
  args: unknown,
): UnknownArgument[] {
  if (declared === null || args === null || typeof args !== "object" || Array.isArray(args)) {
    return [];
  }
  const known = new Set(declared);
  const out: UnknownArgument[] = [];
  for (const key of Object.keys(args)) {
    if (known.has(key)) continue;
    const suggestion = closestMatch(key, declared);
    out.push(suggestion === undefined ? { key } : { key, suggestion });
  }
  return out;
}
