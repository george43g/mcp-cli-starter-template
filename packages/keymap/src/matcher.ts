/**
 * The pure sequence + count matcher.
 *
 * Feed it one normalised key press at a time; it answers `match`, `pending` or
 * `none`. It owns no input, no timers and no React: a consumer calls `feed`
 * from inside its OWN single input router (EQStack's rule — a second
 * dispatcher is how a `q` typed into a text field once quit an app).
 *
 * Semantics, compatible with tui-kit's `useVimKeys`:
 *
 * - **Counts.** Digits 1-9, then 0-9, accumulate before a sequence starts (at
 *   most 4 digits, so at most 9999). `0` with no count typed is an ordinary key.
 *   The count is attached to the next match and reset; a count followed by a
 *   key that matches nothing is dropped. A digit that is itself the first step
 *   of a binding is still read as a count while counts are on.
 * - **Sequences.** A key that starts a longer binding answers `pending`. A
 *   pending sequence older than `sequenceTimeoutMs` is discarded on the NEXT
 *   feed (time comes from `now()`, so tests need no real timers), together with
 *   its count.
 * - **A key that breaks a pending sequence** discards the sequence and is then
 *   matched on its own, keeping the count: `5 g j` moves down five, as in
 *   `useVimKeys`.
 * - **Prefix ambiguity** (`g` and `g g` both bound): the exact match fires
 *   immediately and the longer binding is unreachable. `defineKeymap` reports
 *   it as a `prefix-ambiguity` diagnostic. Waiting for a timeout and then firing
 *   the shorter binding would need a timer callback, i.e. a matcher that owns
 *   time; this one deliberately does not.
 * - **Conflicts** (one sequence, two ids): the first-declared id wins.
 */

import type { Keymap } from "./keymap.js";
import { formatKeys, type KeyInput, type KeyStep, normalizeInput, stepId } from "./notation.js";

export type MatchResult =
  | { type: "match"; id: string; count: number }
  | { type: "pending" }
  | { type: "none" };

export interface MatcherOptions {
  /** ms a partial sequence (`g` of `g g`) survives. Default 500, as in useVimKeys. */
  sequenceTimeoutMs?: number;
  /** Read leading digits as a count prefix. Default true. */
  counts?: boolean;
  /** Clock in ms. Default `Date.now`. Inject one to test timeouts. */
  now?: () => number;
}

export interface Matcher {
  feed(key: KeyInput): MatchResult;
  reset(): void;
  /** Count and partial sequence typed so far, vim-style (`5g`), for a status hint. */
  pending(): string;
}

/** Longest count kept, in digits. 4 → at most 9999, as in useVimKeys. */
const MAX_COUNT_DIGITS = 4;

const PENDING: MatchResult = Object.freeze({ type: "pending" });
const NONE: MatchResult = Object.freeze({ type: "none" });

export function createMatcher(keymap: Keymap, options: MatcherOptions = {}): Matcher {
  const timeout = options.sequenceTimeoutMs ?? 500;
  const counts = options.counts ?? true;
  const now = options.now ?? Date.now;

  // Canonical sequence → id (first declared wins) and the set of strict prefixes.
  const exact = new Map<string, string>();
  const prefixes = new Set<string>();
  for (const b of keymap.bindings) {
    for (const seq of b.sequences) {
      const ids = seq.map(stepId);
      const full = ids.join(" ");
      if (!exact.has(full)) exact.set(full, b.id);
      for (let n = 1; n < ids.length; n += 1) prefixes.add(ids.slice(0, n).join(" "));
    }
  }

  let countBuf = "";
  let seq: KeyStep[] = [];
  let seqAt = 0;

  const reset = () => {
    countBuf = "";
    seq = [];
  };

  const take = (step: KeyStep, at: number): MatchResult => {
    const bare = !step.ctrl && !step.alt && !step.meta && !step.shift;
    if (counts && seq.length === 0 && bare && /^[0-9]$/.test(step.key)) {
      if (step.key !== "0" || countBuf !== "") {
        if (countBuf.length < MAX_COUNT_DIGITS) countBuf += step.key;
        return PENDING;
      }
    }

    const candidate = [...seq, step];
    const id = candidate.map(stepId).join(" ");
    const hit = exact.get(id);
    if (hit !== undefined) {
      const count = countBuf === "" ? 1 : Number.parseInt(countBuf, 10);
      reset();
      return { type: "match", id: hit, count };
    }
    if (prefixes.has(id)) {
      seq = candidate;
      seqAt = at;
      return PENDING;
    }
    if (seq.length > 0) {
      // The pending sequence is broken; judge this key on its own.
      seq = [];
      return take(step, at);
    }
    reset();
    return NONE;
  };

  return {
    feed(input) {
      const at = now();
      if (seq.length > 0 && at - seqAt > timeout) reset();
      return take(normalizeInput(input), at);
    },
    reset,
    pending() {
      return countBuf + (seq.length > 0 ? formatKeys(seq, "vim") : "");
    },
  };
}
