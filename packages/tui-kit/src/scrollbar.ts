/**
 * Scroll position indicator.
 *
 * A gap in the ink ecosystem rather than a preference: `ink-scroll-bar` is
 * referenced by `ink-scroll-view`'s README and is NOT PUBLISHED, and every
 * consumer surveyed had either hand-rolled a "↑ N more" line or gone without.
 */

import { finiteOr } from "./finite.js";

export interface ScrollExtent {
  /** First visible index, inclusive. */
  start: number;
  /** Last visible index, EXCLUSIVE. */
  end: number;
  /** Total item count. */
  total: number;
}

export interface ScrollThumb {
  /** Row offset of the thumb within the track. */
  thumbStart: number;
  /** Thumb length in rows. 0 means "nothing to indicate". */
  thumbRows: number;
}

/**
 * Where the thumb sits in a track `trackRows` tall.
 *
 * Returns a zero-length thumb when there is nothing to scroll, so a caller can
 * branch on `thumbRows === 0` instead of comparing extents itself. The thumb is
 * never shorter than one row while any scrolling is possible — a sub-row thumb
 * rounds to invisible, which is the same as having no indicator at all.
 */
export function scrollbarThumb(extent: ScrollExtent, trackRows: number): ScrollThumb {
  // Every one of these feeds a comparison below, so all are validated. A NaN
  // track height produced NaN geometry, which an ink layout renders as garbage
  // rather than as nothing. See `finite.ts`.
  const rows = Math.max(0, Math.floor(finiteOr(trackRows, 0)));
  const total = Math.max(0, Math.floor(finiteOr(extent.total, 0)));
  const start = Math.max(0, Math.floor(finiteOr(extent.start, 0)));
  const end = Math.max(start, Math.floor(finiteOr(extent.end, start)));
  const visible = end - start;

  if (!(rows > 0) || !(total > 0) || visible >= total) return { thumbStart: 0, thumbRows: 0 };

  const thumbRows = Math.max(1, Math.min(rows, Math.round((visible / total) * rows)));
  const maxStart = rows - thumbRows;
  const thumbStart = Math.max(0, Math.min(maxStart, Math.round((start / total) * rows)));
  return { thumbStart, thumbRows };
}

/** Items above and below the window — what an "↑ N more" indicator needs. */
export function hiddenCounts(extent: ScrollExtent): { above: number; below: number } {
  const total = Math.max(0, Math.floor(finiteOr(extent.total, 0)));
  const start = Math.max(0, Math.floor(finiteOr(extent.start, 0)));
  const end = Math.max(start, Math.min(total, Math.floor(finiteOr(extent.end, start))));
  return { above: start, below: Math.max(0, total - end) };
}
