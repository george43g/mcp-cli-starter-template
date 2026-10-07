/**
 * Vim-style key hook: a thin `useInput` wrapper over {@link createVimKeyRouter}.
 *
 * The keys and their semantics come from `@george43g/keymap` (the
 * `vimNavigation` preset, its Ink adapter and its gg matcher); the router
 * keeps this hook's original contract on top. See `vim-key-router.ts` for both.
 *
 * Behavior:
 *   - Digits accumulate a count buffer (max 9999).
 *   - `getCount()` returns the buffer and resets it (or 1 if empty).
 *   - `gg` (two presses within `ggTimeoutMs`, default 500) triggers `onTop`.
 *   - `G` triggers `onBottom`.
 *   - `j`/`k` (or arrow down/up) call `onMove(count)`.
 *   - Ctrl-D / Ctrl-U call `onHalfPageDown` / `onHalfPageUp`.
 *   - Ctrl-E / Ctrl-Y, page down / Ctrl-F and page up / Ctrl-B call
 *     `onLineDown` / `onLineUp` / `onPageDown` / `onPageUp` with the count —
 *     but only when that handler is supplied. Otherwise the key goes to
 *     `onUnhandled`, as it did before these handlers existed.
 *
 * Mode-aware: pass `enabled: false` to suspend handling (e.g. while a modal
 * is open). The hook still runs but no-ops.
 *
 * `keymap` and `ggTimeoutMs` are read on the FIRST render only: rebuilding the
 * router would drop a pending `g` and the count, and a keymap built inline on
 * every render would then break gg. Define a custom keymap at module scope.
 *
 * Chunked input: ink delivers a fast keystroke burst or a paste as ONE
 * `useInput` call containing the whole string, not one call per key. The hook
 * fans a chunk out across its own keys — but ONLY when every character in the
 * chunk is a key it consumes. A chunk containing anything else is passed to
 * `onUnhandled` intact, so a pasted paragraph cannot drive motion or reach a
 * consumer's destructive-key handler. `jjjj` from a paste is
 * indistinguishable from `jjjj` typed fast, and is treated as motion.
 *
 * DO NOT relax that restriction to a plain per-character fan-out. A consumer
 * router had already shipped the incident it prevents: single keys bound to
 * "open file", "write to ~/Downloads" and "quit", so pasting a recipient name
 * containing `q` quit the app. Passing non-owned chunks through whole is the
 * property that makes fanning out safe at all.
 *
 * An app that must own a single `useInput` (one router, no second dispatcher)
 * should call `createVimKeyRouter` from inside it instead of this hook.
 */

import type { Keymap } from "@george43g/keymap";
import { useInput } from "ink";
import { useRef } from "react";

import { createVimKeyRouter, type VimKeyRouter, type VimKeysHandlers } from "../vim-key-router.js";

export type { KeyState, VimKeysHandlers } from "../vim-key-router.js";

export interface UseVimKeysOptions extends VimKeysHandlers {
  enabled?: boolean;
  /** ms within which a second `g` triggers gg. Default 500. Read once. */
  ggTimeoutMs?: number;
  /**
   * Bindings from `defineKeymap` (`@george43g/keymap`), to override the
   * defaults. Default: `vimNavigation` without home/end. Read once.
   */
  keymap?: Keymap;
}

export function useVimKeys(opts: UseVimKeysOptions) {
  const routerRef = useRef<VimKeyRouter | null>(null);
  if (routerRef.current === null) {
    routerRef.current = createVimKeyRouter({
      ...(opts.keymap ? { keymap: opts.keymap } : {}),
      ...(opts.ggTimeoutMs === undefined ? {} : { ggTimeoutMs: opts.ggTimeoutMs }),
    });
  }
  const router = routerRef.current;

  useInput((input, key) => {
    if (opts.enabled === false) return;
    router(input, key, opts);
  });

  return { getCount: router.getCount };
}
