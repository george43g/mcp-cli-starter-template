/**
 * Grapheme-aware visual width and truncation for terminal rendering.
 *
 * Lifted from a downstream consumer that hit the bug this exists to prevent:
 * truncating with `String#slice` counts UTF-16 code units, so it splits
 * surrogate pairs (one emoji is two code units) and paints a broken glyph. It
 * also assumes one unit is one cell, which is wrong for emoji and CJK.
 *
 * Approach:
 *   - Walk with `Intl.Segmenter` (granularity: "grapheme") so a cluster — a
 *     single emoji, a ZWJ family sequence, a flag — is never split.
 *   - Approximate each cluster's cell width with a range check: emoji, CJK,
 *     Hangul and fullwidth forms are 2 cells; everything else, including ASCII,
 *     Latin diacritics and combining marks, is 1.
 *
 * TWO DELIBERATE SEMANTICS — do not "correct" either of them:
 *
 * 1. **The width model is intentionally coarse.** It is a range check, not a
 *    UAX #11 table. It covers the failure mode that actually occurs (emoji in
 *    user-supplied display names) at a cost that a render path can pay on every
 *    frame.
 * 2. **`0x2600`–`0x27BF` (misc symbols and dingbats) stay width 1** even though
 *    UAX #11 calls them ambiguous. Monospaced terminals render `▶ ◀ ● ✉ ✓ ✗ ★`
 *    as single-cell, and following the standard here misaligns every box-drawn
 *    layout that uses them.
 *
 * Best-effort by contract: this runs on a render path over arbitrary content,
 * so it never throws. A lone surrogate or dangling ZWJ segments as its own
 * cluster and counts as width 1.
 */

const SEG = new Intl.Segmenter("en", { granularity: "grapheme" });

/**
 * Approximate width, in monospaced terminal cells, of a single grapheme
 * cluster. 2 for emoji / CJK / Hangul / fullwidth, 1 otherwise.
 */
export function clusterWidth(cluster: string): number {
  // ASCII fast path — one code unit, one cell.
  if (cluster.length === 1) {
    const code = cluster.charCodeAt(0);
    if (code < 0x80) return 1;
  }
  for (const ch of cluster) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    // See semantic 2 above: 0x2600..0x27BF is deliberately NOT in this list.
    if (
      // CJK Unified Ideographs + Compatibility — wide.
      (cp >= 0x3000 && cp <= 0x9fff) ||
      // Hangul Syllables.
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      // CJK Compatibility Ideographs.
      (cp >= 0xf900 && cp <= 0xfaff) ||
      // Fullwidth forms.
      (cp >= 0xff00 && cp <= 0xff60) ||
      // Halfwidth / fullwidth fence range (still 2-cell for fullwidth).
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      // Misc symbols and pictographs — the true emoji plane.
      cp >= 0x1f300
    ) {
      return 2;
    }
  }
  return 1;
}

/** Total monospaced cell width of a string. */
export function visualWidth(str: string): number {
  let w = 0;
  for (const { segment } of SEG.segment(str)) {
    w += clusterWidth(segment);
  }
  return w;
}

/**
 * Truncate `str` to fit `maxCols` terminal cells, never splitting a cluster.
 *
 * The ellipsis counts AGAINST the budget: `visualWidth(result) <= maxCols`
 * always holds. Getting this backwards overflows every truncated row by one
 * column, which a flexbox layout then wraps or clips — and it presents as a
 * layout bug rather than a width bug.
 *
 * Three contract points worth knowing:
 *   - A string that already fits is returned UNMODIFIED, with no ellipsis.
 *   - `maxCols <= 0` returns "".
 *   - If the ellipsis alone does not fit (`ellipsisW >= maxCols`), as many
 *     clusters as fit are returned with NO ellipsis — deliberately better than
 *     "" or a clipped ellipsis.
 *
 * There is intentionally no padding counterpart: ink's flexbox handles
 * padding, and a pad helper here would have no call sites.
 */
export function truncateToWidth(str: string, maxCols: number, ellipsis = "…"): string {
  if (maxCols <= 0) return "";
  if (visualWidth(str) <= maxCols) return str;

  const ellipsisW = visualWidth(ellipsis);
  // If the ellipsis itself doesn't fit, take whatever clusters do and
  // skip the ellipsis — better than returning "" or a clipped ellipsis.
  if (ellipsisW >= maxCols) {
    let usedFallback = 0;
    let outFallback = "";
    for (const { segment } of SEG.segment(str)) {
      const w = clusterWidth(segment);
      if (usedFallback + w > maxCols) break;
      outFallback += segment;
      usedFallback += w;
    }
    return outFallback;
  }

  let used = 0;
  let out = "";
  for (const { segment } of SEG.segment(str)) {
    const w = clusterWidth(segment);
    if (used + w + ellipsisW > maxCols) break;
    out += segment;
    used += w;
  }
  return out + ellipsis;
}
