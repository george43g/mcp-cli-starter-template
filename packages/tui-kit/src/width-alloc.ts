/**
 * Horizontal width allocation among columns.
 *
 * NOT the horizontal twin of `viewport.ts`, and the analogy is worth resisting:
 * the vertical axis is ONE scroll window over homogeneous rows, so constants
 * like CHROME_ROWS work there. The horizontal axis is ALLOCATION among
 * heterogeneous columns with different priorities, different floors, and
 * mode-gated existence. Different problem, different function.
 */

export interface ColumnSpec {
  id: string;
  /** Never allocated less than this while present. */
  min: number;
  /** Target width when there is room. */
  preferred: number;
  /** Never allocated more than this. Unbounded when omitted. */
  max?: number;
  /**
   * WHO yields first. Lowest priority is sacrificed first.
   *
   * Ordering only — it says nothing about what yielding LOOKS like, which is
   * `collapse` below. Trying to express both with one number is what makes
   * allocators grow config objects.
   */
  priority: number;
  /**
   * WHAT yielding means for this column.
   *
   * The distinction came from two consumers wanting opposite things and being
   * right about their own columns. The rule that unifies them, from
   * browser-tab-mcp: **columns whose content is CONTEXT collapse to a
   * breadcrumb; columns whose content is ELABORATION drop.**
   *
   * Their detail pane is elaboration — the list row already carries the
   * truncated title, so a collapsed-but-present detail column would spend ten
   * columns repeating it while the list starves. Its degraded form is absence.
   * EQStack's ancestor columns are context — they say which mailbox and thread
   * you are inside, so losing them loses your place; they must stay visible.
   *
   * `"min"` is the third case: a column that must always exist, pinned at its
   * floor and never dropped.
   */
  collapse?: "drop" | "breadcrumb" | "min";
  /** Width when collapsed to a breadcrumb. Default 1. */
  collapsedWidth?: number;
}

export interface Allocation {
  /** Width per column id. Dropped columns are absent. */
  widths: Record<string, number>;
  /** Ids that were dropped or breadcrumbed, in the order they yielded. */
  collapsed: string[];
}

/**
 * Allocate `total` columns of width among `cols`.
 *
 * Integer in, integer out, deterministic. Fractions are the caller's business:
 * a detail pane that wants 35% of the terminal computes that before calling.
 *
 * Mode-gated columns are the caller's business too — a column that is closed
 * this frame is simply OMITTED from `cols`. The allocator must not know about
 * modes, or it grows a mode model.
 */
export function allocateWidths(total: number, cols: readonly ColumnSpec[]): Allocation {
  const budget = Math.max(0, Math.floor(total));
  // Ascending priority = the order in which columns are sacrificed.
  const byYieldOrder = [...cols].sort(
    (a, b) => a.priority - b.priority || a.id.localeCompare(b.id),
  );

  const present = new Map<string, { spec: ColumnSpec; floor: number; ceiling: number }>();
  for (const spec of cols) {
    present.set(spec.id, {
      spec,
      floor: Math.max(0, Math.floor(spec.min)),
      // Omitting `max` means UNBOUNDED, per the ColumnSpec contract. Defaulting
      // it to `preferred` instead silently capped growth, so the remainder had
      // nowhere to go and landed on a lower-priority column — the exact
      // inversion of the rule this function is supposed to implement.
      ceiling:
        spec.max === undefined ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(spec.max)),
    });
  }

  const collapsed: string[] = [];
  const floorSum = (): number => [...present.values()].reduce((n, c) => n + c.floor, 0);

  // Shed until the floors fit. A breadcrumbed column has already yielded all it
  // can, so it is not a candidate twice; a "min" column never is.
  for (const spec of byYieldOrder) {
    if (floorSum() <= budget) break;
    const behaviour = spec.collapse ?? "drop";
    if (behaviour === "min") continue;
    const entry = present.get(spec.id);
    if (!entry) continue;
    if (behaviour === "breadcrumb") {
      const crumb = Math.max(0, Math.floor(spec.collapsedWidth ?? 1));
      if (entry.floor <= crumb) continue;
      entry.floor = crumb;
      entry.ceiling = crumb;
    } else {
      present.delete(spec.id);
    }
    collapsed.push(spec.id);
  }

  // Everyone still present starts at their floor. If the floors still exceed
  // the budget every remaining column is pinned, and the caller's renderer
  // clips — which is honest, and better than silently dropping a column the
  // caller declared unsacrificeable.
  const widths: Record<string, number> = {};
  for (const [id, c] of present) widths[id] = c.floor;
  let remaining = budget - floorSum();

  // Growth runs in DESCENDING priority: the most important column not yet at
  // its ceiling takes the slack. Two passes so nobody reaches `max` before
  // everybody has reached `preferred`.
  const byImportance = [...present.values()].sort(
    (a, b) => b.spec.priority - a.spec.priority || a.spec.id.localeCompare(b.spec.id),
  );
  for (const target of ["preferred", "ceiling"] as const) {
    for (const c of byImportance) {
      if (remaining <= 0) break;
      const cap =
        target === "preferred" ? Math.min(Math.floor(c.spec.preferred), c.ceiling) : c.ceiling;
      const room = cap - (widths[c.spec.id] ?? 0);
      if (room <= 0) continue;
      const give = Math.min(room, remaining);
      widths[c.spec.id] = (widths[c.spec.id] ?? 0) + give;
      remaining -= give;
    }
  }

  return { widths, collapsed };
}
