/**
 * Line-budget windowing over items of heterogeneous height.
 *
 * WINDOW BY RENDERED LINES, NEVER BY ROW COUNT. Row-count windowing is what
 * produced EQStack's height-0 overpaint bug family (#99/#101/#103): a
 * yoga-shrunk box paints its text over the next row, and the diagnosis cost
 * hexdump archaeology. The caller supplies a pure `heightOf(index)` because
 * only the caller knows how its content wraps.
 *
 * Predicted heights, not measured ones. `ink-scroll-view` (the widely-used
 * alternative) measures by rendering into a virtual DOM — correct for short
 * lists with unpredictable content, unavailable when the window is what decides
 * WHAT to render and the list is a 100k-message thread behind bounded-memory
 * eviction.
 */

export interface LineWindowSpec {
  itemCount: number;
  /** Cursor index. **-1 is the follow-tail sentinel** and forces `anchor: "end"`. */
  cursor: number;
  /** Rows available for content. `<= 0` yields a single-item window (see below). */
  budgetLines: number;
  /** Rendered height of one item, in lines. Pure; called repeatedly, memoised per call. */
  heightOf: (index: number) => number;
  /**
   * `"cursor"` centres the window on the cursor; `"end"` pins the LAST item to
   * the bottom edge and walks up.
   *
   * These are two algorithms, not one with a ratio — near the tail you want the
   * last item pinned while the cursor sits a couple of rows above it, and no
   * value of `aboveFraction` expresses that because `aboveFraction` anchors the
   * CURSOR. Use {@link chooseAnchor} to pick.
   */
  anchor?: "cursor" | "end";
  /** Share of the budget spent above the cursor. `"cursor"` anchor only. Default 0.4. */
  aboveFraction?: number;
}

export interface LineWindow {
  /** Inclusive. */
  start: number;
  /** EXCLUSIVE. */
  end: number;
  /**
   * Lines the window actually occupies. MAY EXCEED `budgetLines`, in exactly
   * one case: a single item taller than the whole budget. Returning an empty
   * window there would clip the only thing on screen.
   */
  usedLines: number;
}

/**
 * Pick the anchor. `cursor < 0`, or within `nearEnd` of the tail, means the
 * list should sit against its bottom edge.
 *
 * The sentinel and the anchor unify: follow-tail IS end-anchoring.
 */
export function chooseAnchor(cursor: number, itemCount: number, nearEnd = 2): "cursor" | "end" {
  if (cursor < 0) return "end";
  if (itemCount <= 0) return "end";
  return cursor >= itemCount - nearEnd ? "end" : "cursor";
}

export function lineWindow(spec: LineWindowSpec): LineWindow {
  const { itemCount, budgetLines } = spec;
  if (itemCount <= 0) return { start: 0, end: 0, usedLines: 0 };

  // Per-invocation memo. The walk visits some indices twice (up, then down,
  // then backfill up) and the item array cannot change mid-call, so this is
  // free and correct — and it means no consumer has to reach for `useCallback`
  // to make its estimator cheap. Cross-render memoisation stays theirs.
  const memo = new Map<number, number>();
  const h = (i: number): number => {
    const cached = memo.get(i);
    if (cached !== undefined) return cached;
    const measured = Math.max(0, Math.floor(spec.heightOf(i)));
    memo.set(i, measured);
    return measured;
  };

  const followTail = spec.cursor < 0;
  const cursor = followTail ? itemCount - 1 : Math.min(Math.max(spec.cursor, 0), itemCount - 1);
  const anchor = followTail ? "end" : (spec.anchor ?? "cursor");

  // Documented degenerate case: no budget still yields the cursor's row, so the
  // "cursor is always visible" invariant holds during a resize transient rather
  // than blinking to empty.
  if (budgetLines <= 0) return { start: cursor, end: cursor + 1, usedLines: h(cursor) };

  if (anchor === "end") {
    let start = itemCount;
    let used = 0;
    while (start > 0) {
      const next = h(start - 1);
      // `used > 0` is what admits a single over-tall tail item.
      if (used + next > budgetLines && used > 0) break;
      used += next;
      start -= 1;
    }
    // The cursor may sit above an end-anchored window (that is the point of the
    // anchor). It must still be inside it.
    while (start > cursor) {
      start -= 1;
      used += h(start);
    }
    return { start, end: itemCount, usedLines: used };
  }

  // Cursor-anchored: seed with the cursor itself, unconditionally, so an item
  // taller than the budget is shown rather than dropped.
  let start = cursor;
  let end = cursor + 1;
  let used = h(cursor);

  const aboveBudget = Math.floor(budgetLines * (spec.aboveFraction ?? 0.4));
  let aboveUsed = 0;
  while (start > 0) {
    const next = h(start - 1);
    if (aboveUsed + next > aboveBudget) break;
    if (used + next > budgetLines) break;
    start -= 1;
    used += next;
    aboveUsed += next;
  }

  while (end < itemCount) {
    const next = h(end);
    if (used + next > budgetLines) break;
    used += next;
    end += 1;
  }

  // Backfill upward with whatever the downward pass did not spend.
  while (start > 0) {
    const next = h(start - 1);
    if (used + next > budgetLines) break;
    start -= 1;
    used += next;
  }

  return { start, end, usedLines: used };
}
