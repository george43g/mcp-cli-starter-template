/**
 * Scroll-window arithmetic for full-screen list views.
 *
 * Pure on purpose — no ink, no react. The row count comes in as a plain
 * number (from `useTerminalSize()` or anywhere else), so the maths that
 * decides what the user actually sees is testable without a renderer.
 *
 * Two steps:
 *   - `viewportRows()` turns a terminal height into usable list rows by
 *     subtracting the fixed status/help chrome.
 *   - `visibleWindow()` turns a cursor position into a `[start, end)` slice.
 */

/** Rows reserved for the status bar, help bar, and their separators. */
export const CHROME_ROWS = 4;

/** Never render an empty list, however small the terminal claims to be. */
export const MIN_VIEWPORT = 1;

/** Assumed terminal height when the reported one is not a usable number. */
const FALLBACK_TERMINAL_ROWS = 24;

export interface VisibleWindow {
  /** First visible index, inclusive. */
  start: number;
  /** Last visible index, exclusive. */
  end: number;
}

/**
 * Usable list rows for a terminal of `terminalRows` height.
 *
 * `stdout.rows` is `number | undefined` and reports 0 when stdout is a pipe
 * rather than a TTY, so anything that is not a positive finite number means
 * "unknown height" — fall back rather than treat it as a one-row screen.
 */
export function viewportRows(terminalRows: number): number {
  const rows =
    Number.isFinite(terminalRows) && terminalRows > 0
      ? Math.floor(terminalRows)
      : FALLBACK_TERMINAL_ROWS;
  return Math.max(MIN_VIEWPORT, rows - CHROME_ROWS);
}

/**
 * The slice of a `total`-item list to render with `cursor` centred.
 *
 * The window is always exactly `min(viewport, total)` tall. That invariant is
 * the whole point: an earlier version clamped only the END to `total`, so as
 * the cursor approached the bottom the start kept advancing while the end sat
 * pinned at `total` and the rendered list visibly shrank (34 items in a
 * 24-row viewport bottomed out at 13 rows). Clamping the START to
 * `total - height` slides the window back inside the list instead.
 */
export function visibleWindow(cursor: number, total: number, viewport: number): VisibleWindow {
  const count = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  const rows = Number.isFinite(viewport)
    ? Math.max(MIN_VIEWPORT, Math.floor(viewport))
    : MIN_VIEWPORT;
  const height = Math.min(count, rows);
  if (height === 0) return { start: 0, end: 0 };

  // Cursor is caller-supplied and may lag a list that shrank underneath it.
  const focus = Number.isFinite(cursor) ? Math.min(Math.max(0, Math.floor(cursor)), count - 1) : 0;
  const start = Math.min(Math.max(0, focus - Math.floor(height / 2)), count - height);
  return { start, end: start + height };
}
