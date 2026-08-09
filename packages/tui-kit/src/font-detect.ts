/**
 * Best-effort Nerd Font detection.
 *
 * For TUIs that offer a glyph preset requiring a patched font: without a check
 * the user selects "powerline" and gets blank boxes with no explanation.
 *
 * Strategy: run `fc-list :family` (fontconfig). If it is not on PATH, report
 * `unavailable` rather than guessing.
 *
 * THE IMPORTANT PART: never return `detected: false` because `fc-list` is
 * missing. Default macOS ships no fontconfig, and those users routinely DO
 * have a patched font installed — so `false` fires the "no Nerd Font" warning
 * at exactly the people for whom it is wrong. The three-variant result exists
 * so a caller can render a hard warning for a confirmed absence and a soft hint
 * for an unknown, which are different messages.
 *
 * `reason` is worth keeping: it distinguishes "fc-list is not installed" from
 * "fc-list hung past the timeout" when a user reports the warning.
 *
 * Synchronous with a short timeout, so TUI startup is not gated on a slow
 * shell, and cached per process because the call costs ~1s.
 */

import { spawnSync } from "node:child_process";

export type FontDetectResult =
  | { detected: true; source: "fc-list" }
  | { detected: false; source: "fc-list" }
  | { detected: null; source: "unavailable"; reason: string };

const FC_LIST_TIMEOUT_MS = 1000;

let cached: FontDetectResult | null = null;

/**
 * Whether a Nerd Font is installed.
 *
 * `detected: null` means it could not be determined — no `fc-list`, or it
 * errored or timed out. Cached per process, so repeated calls are free.
 */
export function detectNerdFont(): FontDetectResult {
  if (cached) return cached;

  const result = spawnSync("fc-list", [":family"], {
    encoding: "utf8",
    timeout: FC_LIST_TIMEOUT_MS,
    // Suppress stderr noise like "Fontconfig error: ..." from cluttering the
    // user's terminal — only stdout and exit status matter here.
    stdio: ["ignore", "pipe", "ignore"],
  });

  let next: FontDetectResult;
  if (result.error || result.status !== 0) {
    next = {
      detected: null,
      source: "unavailable",
      reason: result.error?.message ?? `fc-list exited with status ${result.status}`,
    };
  } else {
    const stdout = result.stdout ?? "";
    // Every Nerd Font patched family carries "Nerd Font" in its name.
    next = { detected: /Nerd/i.test(stdout), source: "fc-list" };
  }
  cached = next;
  return next;
}

/**
 * Reset the per-process detection cache.
 *
 * @internal Test seam only. There is deliberately no options parameter and no
 * public force-redetect: no consumer has a case for re-detection mid-process,
 * and an option added now could not be removed later. If a real case appears
 * (a settings screen that tells the user to install a font, then re-checks),
 * add it then, with the call site in hand.
 */
export function _resetDetectNerdFontCache(): void {
  cached = null;
}
