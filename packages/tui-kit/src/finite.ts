/**
 * Numeric input validation for anything that feeds a loop's break condition.
 *
 * THE RULE, and it is not stylistic: **validate with a POSITIVE predicate.**
 *
 * `x <= 0` silently ADMITS NaN, because every comparison with NaN is false. A
 * guard written that way lets NaN through, and once NaN reaches an accumulator
 * every `used + next > budget` is false forever — which turns a bounded walk
 * into an unbounded one. `!(x > 0)` rejects NaN and non-positives in a single
 * predicate.
 *
 * This is not hypothetical. `lineWindow` shipped in 0.5.0 with a `budgetLines
 * <= 0` guard and would walk an entire 5,000-item list when a non-TTY render
 * environment produced a NaN row count — 64MB of retained React fiber in a
 * consumer's memory test. Their hand-rolled predecessor had failed CLOSED under
 * the same input **by accident** (`x <= NaN` is also always false, so its loops
 * never ran and it rendered one item), so the extraction inverted an accidental
 * safety into a fail-open. Reported by the eqstack session, who also supplied
 * the rule above.
 */

/** `value` when it is a finite number, else `fallback`. */
export function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** True only for a finite number strictly greater than zero. Rejects NaN. */
export function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}
