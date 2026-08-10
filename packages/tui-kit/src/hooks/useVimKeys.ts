/**
 * Vim-style key parser hook.
 *
 * Generalizes imsg-mcp's App.tsx number-buffer + gg double-press pattern
 * into a reusable hook. Caller provides handlers for the standard motion
 * keys; the hook tracks the number-prefix buffer and the gg timer.
 *
 * Behavior:
 *   - Digits accumulate a count buffer (max 9999).
 *   - `getCount()` returns the buffer and resets it (or 1 if empty).
 *   - `gg` (two presses within 500ms) triggers `onTop`.
 *   - `G` triggers `onBottom`.
 *   - `j`/`k` (or arrow down/up) call `onMove(count)`.
 *   - Ctrl-D / Ctrl-U call `onHalfPageDown` / `onHalfPageUp`.
 *
 * Mode-aware: pass `enabled: false` to suspend handling (e.g. while a modal
 * is open). The hook still runs but no-ops.
 *
 * Chunked input: ink delivers a fast keystroke burst or a paste as ONE
 * `useInput` call containing the whole string, not one call per key. The hook
 * fans a chunk out across its own keys — but ONLY when every character in the
 * chunk is a key it owns (`0-9 g G j k`). A chunk containing anything else is
 * passed to `onUnhandled` intact, so a pasted paragraph cannot drive motion or
 * reach a consumer's destructive-key handler. `jjjj` from a paste is
 * indistinguishable from `jjjj` typed fast, and is treated as motion.
 */

import { useInput } from "ink";
import { useCallback, useRef } from "react";

export interface VimKeysHandlers {
  onMove?(delta: number): void;
  onTop?(): void;
  onBottom?(): void;
  onHalfPageDown?(): void;
  onHalfPageUp?(): void;
  /** Forward unhandled keys (single character or named) to the host. */
  onUnhandled?(input: string, key: KeyState): void;
}

export interface KeyState {
  ctrl?: boolean;
  shift?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
}

export interface UseVimKeysOptions extends VimKeysHandlers {
  enabled?: boolean;
  /** ms within which a second `g` triggers gg. Default 500. */
  ggTimeoutMs?: number;
}

const MAX_COUNT = 9999;

/**
 * The keys this hook consumes. Used to decide whether a multi-character chunk
 * is a keystroke burst (fan out) or a paste (forward whole).
 */
const OWNED_KEY = /^[0-9gGjk]$/;

/**
 * Single-digit test.
 *
 * Deliberately a regex, not `input >= "0" && input <= "9"`. That comparison is
 * a LEXICOGRAPHIC string range, so a multi-character chunk like "5j" satisfies
 * it ("5j" sorts after "0" and before "9") and lands in the count buffer, to be
 * replayed as a stale count on the next keystroke. The fan-out below now
 * guarantees single characters here, but this stays explicit so the footgun
 * cannot come back if that guarantee is ever relaxed.
 */
const DIGIT = /^[0-9]$/;

export function useVimKeys(opts: UseVimKeysOptions) {
  const numBufferRef = useRef("");
  const ggPendingRef = useRef(false);
  const ggTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabled = opts.enabled !== false;
  const ggTimeout = opts.ggTimeoutMs ?? 500;

  const getCount = useCallback((): number => {
    const raw = numBufferRef.current;
    numBufferRef.current = "";
    if (!raw) return 1;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_COUNT) : 1;
  }, []);

  const handleKey = (input: string, key: KeyState) => {
    // Digit accumulation
    if (DIGIT.test(input) && !key.ctrl) {
      // Avoid bumping `0` as a count starter when buffer is empty (vim convention).
      if (numBufferRef.current === "" && input === "0") return;
      numBufferRef.current = (numBufferRef.current + input).slice(0, 4);
      return;
    }

    // gg double-press → onTop
    if (input === "g" && !key.ctrl && !key.shift) {
      if (ggPendingRef.current) {
        ggPendingRef.current = false;
        if (ggTimerRef.current) clearTimeout(ggTimerRef.current);
        ggTimerRef.current = null;
        opts.onTop?.();
        numBufferRef.current = "";
        return;
      }
      ggPendingRef.current = true;
      ggTimerRef.current = setTimeout(() => {
        ggPendingRef.current = false;
      }, ggTimeout);
      ggTimerRef.current.unref?.();
      return;
    }

    // G → onBottom
    if (input === "G" || (input === "g" && key.shift)) {
      opts.onBottom?.();
      return;
    }

    // Ctrl-D / Ctrl-U
    if (key.ctrl && input === "d") {
      opts.onHalfPageDown?.();
      return;
    }
    if (key.ctrl && input === "u") {
      opts.onHalfPageUp?.();
      return;
    }

    // j / k or arrows
    if (input === "j" || key.downArrow) {
      opts.onMove?.(getCount());
      return;
    }
    if (input === "k" || key.upArrow) {
      opts.onMove?.(-getCount());
      return;
    }

    opts.onUnhandled?.(input, key);
  };

  useInput((input, key) => {
    if (!enabled) return;

    // Ink delivers a burst or a paste as ONE call. Fan out only when the whole
    // chunk is keys we own — otherwise a pasted paragraph would drive motion
    // and reach the consumer's destructive-key handlers one character at a
    // time. Anything else falls through to handleKey unchanged, preserving
    // onUnhandled's existing contract for pastes.
    if (!key.ctrl && input.length > 1 && [...input].every((ch) => OWNED_KEY.test(ch))) {
      for (const ch of input) handleKey(ch, key);
      return;
    }

    handleKey(input, key);
  });

  return { getCount };
}
