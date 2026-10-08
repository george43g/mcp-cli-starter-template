/**
 * Cursor + viewport arithmetic for the demo list, vim-style. Pure, so the
 * rules are readable in one place and testable without a renderer.
 *
 * `top` is the first visible row; `rows` is how many fit on screen. Every
 * function returns a view with the cursor inside the list AND on screen.
 */

export interface ListView {
  cursor: number;
  top: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const maxTop = (total: number, rows: number) => Math.max(0, total - rows);

/** Put the cursor at `cursor`, scrolling only as far as it takes to show it (j/k, gg, G). */
export function moveTo(view: ListView, cursor: number, total: number, rows: number): ListView {
  const c = clamp(cursor, 0, total - 1);
  const top = clamp(view.top, Math.max(0, c - rows + 1), Math.min(c, maxTop(total, rows)));
  return { cursor: c, top };
}

/**
 * Scroll the viewport by `lines`; the cursor stays on its row unless that row
 * leaves the screen, then it is dragged to the nearest edge (ctrl-e/y).
 */
export function scrollBy(view: ListView, lines: number, total: number, rows: number): ListView {
  const top = clamp(view.top + lines, 0, maxTop(total, rows));
  const bottom = Math.min(total, top + rows) - 1;
  return { top, cursor: clamp(view.cursor, top, bottom) };
}

/** Scroll the viewport AND the cursor by `lines` (ctrl-d/u, page down/up). */
export function pageBy(view: ListView, lines: number, total: number, rows: number): ListView {
  return moveTo(scrollBy(view, lines, total, rows), view.cursor + lines, total, rows);
}
