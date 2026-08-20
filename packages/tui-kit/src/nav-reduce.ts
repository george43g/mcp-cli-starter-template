/**
 * Cursor transitions as pure functions.
 *
 * `(state, intent) → state`, with no key handling anywhere. That boundary is
 * not a preference: three consumer sessions chose it independently, and both
 * maintained ink scroll libraries are built the same way.
 *
 * EQStack's reason is the one with an incident behind it — their INPUT-GUARD
 * LAW (one top-level `useInput`, an early-return guard per modal mode) exists
 * because `q` typed into a recipient-name field once quit the app. A component
 * that owns keys either reimplements every consumer's modal routing or
 * reintroduces that bug for all of them at once.
 */

/** Cursor position, count prefix, and whether the user has moved yet. */
export interface NavState {
  /** Item index, or **-1** for the follow-tail sentinel. */
  cursor: number;
  /** Accumulated vim count prefix (`5j`), or null. */
  count: number | null;
  /** Set by any cursor-moving intent. Read by `applyRestore("follow-until-touched")`. */
  touched: boolean;
}

export interface NavContext {
  itemCount: number;
  /**
   * Rows per page. NOT derivable from `itemCount` — it comes from the caller's
   * last layout pass, and every consumer computes it differently.
   */
  pageSize: number;
  /**
   * Boundary of the next/previous group from `from`. Group semantics are domain
   * knowledge (a sender flip, a date change), so the caller owns them. Omitted
   * means `groupJump` is a **no-op rather than a throw**.
   */
  groupBoundary?: (from: number, dir: -1 | 1) => number;
}

export type NavIntent =
  | { kind: "up" | "down" | "pageUp" | "pageDown" | "top" | "bottom" }
  | { kind: "digit"; digit: number }
  | { kind: "groupJump"; dir: -1 | 1 }
  | { kind: "set"; index: number }
  /**
   * The item array was replaced under the cursor. `remap` translates an old
   * index to a new one.
   *
   * Exists because item arrays are NOT stable and indices are NOT durable:
   * bounded-memory eviction collapses the middle of a long list, and lazy-load
   * prepends shift everything. EQStack called this "the single most likely
   * adoption-killer if missed".
   */
  | { kind: "itemsReplaced"; remap: (old: number) => number };

export type RestorePolicy = "restore" | "snap-end" | "snap-start" | "follow-until-touched";

const clampIndex = (i: number, itemCount: number): number => {
  if (itemCount <= 0) return 0;
  if (!Number.isFinite(i)) return 0;
  return Math.min(Math.max(Math.floor(i), 0), itemCount - 1);
};

/** Resolve the follow-tail sentinel to a concrete index for movement. */
const concrete = (cursor: number, itemCount: number): number =>
  cursor < 0 ? Math.max(itemCount - 1, 0) : clampIndex(cursor, itemCount);

export function navReduce(state: NavState, intent: NavIntent, ctx: NavContext): NavState {
  const { itemCount } = ctx;

  if (intent.kind === "itemsReplaced") {
    // THE SENTINEL IS NEVER REMAPPED. Following the tail is a relationship to
    // the end of the list, not to an index, so translating it is meaningless —
    // and doing so shipped as a real cursor-loss bug once (EQStack #94).
    if (state.cursor < 0) return state;
    // The remap's output is clamped HERE so a consumer whose remap points into
    // a removed region degrades to the nearest survivor. Callers should not
    // have to be defensive about their own eviction maths.
    return { ...state, cursor: clampIndex(intent.remap(state.cursor), itemCount) };
  }

  if (intent.kind === "digit") {
    const digit = Math.floor(intent.digit);
    if (digit < 0 || digit > 9) return state;
    return { ...state, count: (state.count ?? 0) * 10 + digit };
  }

  if (intent.kind === "set") {
    return { cursor: clampIndex(intent.index, itemCount), count: null, touched: true };
  }

  // Every remaining intent is a movement: it consumes the count as a repeat
  // factor, resets it, and marks the cursor touched.
  const repeat = Math.max(1, state.count ?? 1);
  const from = concrete(state.cursor, itemCount);
  const moved = (cursor: number): NavState => ({
    cursor: clampIndex(cursor, itemCount),
    count: null,
    touched: true,
  });

  switch (intent.kind) {
    case "up":
      return moved(from - repeat);
    case "down":
      return moved(from + repeat);
    case "pageUp":
      return moved(from - ctx.pageSize * repeat);
    case "pageDown":
      return moved(from + ctx.pageSize * repeat);
    case "top":
      return moved(0);
    case "bottom":
      return moved(itemCount - 1);
    case "groupJump": {
      // No boundary function means the consumer has no group semantics. Doing
      // nothing is the honest response; throwing would punish a consumer for
      // wiring a key it happens not to support.
      if (!ctx.groupBoundary) return state;
      let at = from;
      for (let n = 0; n < repeat; n += 1) at = ctx.groupBoundary(at, intent.dir);
      return moved(at);
    }
  }
}

/**
 * What the cursor should be when a column's contents are replaced wholesale —
 * switching conversation, account, or folder.
 *
 * A PARAMETER, not a hardcode. The right default is contested inside a single
 * app: a conversation pane wants snap-to-tail, a file tree wants
 * restore-last-position, a log pane wants follow-until-touched. Any component
 * that picks one fights at least one of its consumers.
 */
export function applyRestore(policy: RestorePolicy, prev: NavState, itemCount: number): NavState {
  switch (policy) {
    case "restore":
      return { ...prev, cursor: clampIndex(prev.cursor, itemCount), count: null };
    case "snap-end":
      return { cursor: clampIndex(itemCount - 1, itemCount), count: null, touched: false };
    case "snap-start":
      return { cursor: 0, count: null, touched: false };
    case "follow-until-touched":
      return prev.touched
        ? { ...prev, cursor: clampIndex(prev.cursor, itemCount), count: null }
        : { cursor: -1, count: null, touched: false };
  }
}
