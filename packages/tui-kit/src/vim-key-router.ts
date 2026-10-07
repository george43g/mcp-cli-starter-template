/**
 * The vim key router behind `useVimKeys`, as a pure function with no React or
 * Ink import, so an app with ONE input router (EQStack's rule) can call it
 * from inside its own `useInput` instead of adding a second dispatcher.
 *
 * Which key means what comes from `@george43g/keymap`: its `vimNavigation`
 * preset, its `fromInk` adapter (with the all-or-nothing paste split) and its
 * sequence matcher (gg and its timeout). This file adds only what
 * `useVimKeys` promised before the keymap package existed, so that no existing
 * caller sees a change:
 *
 * - **The count buffer stays here, with its old semantics.** `getCount()` is
 *   public API whose documented use is a count bound to the CALLER's own key
 *   (`5x`, read in `onUnhandled`). The matcher drops a count when the next key
 *   matches nothing, so `getCount()` would always answer 1 there. Hence the
 *   matcher runs with `counts: false` and the router keeps the digits. Also
 *   preserved: a lone `0` is swallowed, a count survives `G` / ctrl-d / ctrl-u
 *   and a `g` timeout, and a digit typed between the two `g`s of gg is counted
 *   without cancelling the gg.
 * - **Modifier leniency.** The old hook compared `input === "j"` and ignored
 *   ctrl/alt, so ctrl-k and shift-down moved. A key whose exact step is not
 *   bound in the keymap falls back to the bare key it was matched as before.
 * - **Opt-in for new keys.** A binding the old hook did not have (ctrl-e/y,
 *   ctrl-f/b, page up/down) is consumed only when its handler is supplied.
 *   Otherwise it reaches `onUnhandled` exactly as before, so an app that bound
 *   ctrl-f itself keeps it. home/end are left out of the default keymap for the
 *   same reason; pass `keymap: defineKeymap(vimNavigation)` to bind them.
 *
 * One deliberate difference from the old hook: any key other than a digit or
 * the second `g` cancels a pending `g`. The old hook kept the `g` alive, so
 * `g j g` moved down and THEN jumped to the top. That is the matcher's (and
 * vim's) semantics, pinned in the keymap package's conformance vectors.
 */

import {
  createMatcher,
  type DisplayStyle,
  defineKeymap,
  fromInk,
  type KeyInput,
  type Keymap,
  stepId,
  toHints,
  vimNavigation,
} from "@george43g/keymap";

import type { KeyHint } from "./components/HelpBar.js";

/**
 * The key flags the router reads. Ink's `Key` satisfies it, and so does the
 * smaller `{ ctrl, shift, upArrow, downArrow }` shape this type used to be.
 */
export interface KeyState {
  ctrl?: boolean;
  shift?: boolean;
  /** Alt/Option in Ink (terminals send it as an ESC prefix). */
  meta?: boolean;
  /** Cmd/Super, kitty keyboard protocol only. */
  super?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
  pageUp?: boolean;
  pageDown?: boolean;
  home?: boolean;
  end?: boolean;
  return?: boolean;
  escape?: boolean;
  tab?: boolean;
  backspace?: boolean;
  delete?: boolean;
  eventType?: "press" | "repeat" | "release";
}

export interface VimKeysHandlers {
  /** j/k and the arrows; `delta` is the count, signed (`5k` → -5). */
  onMove?(delta: number): void;
  /** `gg`. Clears any typed count. */
  onTop?(): void;
  /** `G`. */
  onBottom?(): void;
  /** ctrl-d. */
  onHalfPageDown?(): void;
  /** ctrl-u. */
  onHalfPageUp?(): void;
  /** ctrl-e. Consumed only when supplied. */
  onLineDown?(count: number): void;
  /** ctrl-y. Consumed only when supplied. */
  onLineUp?(count: number): void;
  /** page down and ctrl-f. Consumed only when supplied. */
  onPageDown?(count: number): void;
  /** page up and ctrl-b. Consumed only when supplied. */
  onPageUp?(count: number): void;
  /** Every key (or whole pasted chunk) the router did not consume, unchanged. */
  onUnhandled?(input: string, key: KeyState): void;
}

export interface VimKeyRouterOptions {
  /**
   * Bindings to route, from `defineKeymap`. Default: the `vimNavigation`
   * preset without home/end (see the module comment). Ids the router does not
   * know are not dispatched; their keys reach `onUnhandled`.
   */
  keymap?: Keymap;
  /** ms within which a second `g` triggers gg. Default 500. */
  ggTimeoutMs?: number;
  /** Clock in ms, for tests. Default `Date.now`. */
  now?: () => number;
}

export interface VimKeyRouter {
  /**
   * Route one Ink `useInput` call. Returns true when consumed; otherwise calls
   * `handlers.onUnhandled` (when supplied) and returns false. Pass the
   * handlers on every call, so they always close over the current state.
   */
  (input: string, key: KeyState, handlers?: VimKeysHandlers): boolean;
  /** The typed count, then reset. 1 when none was typed. At most 9999. */
  getCount(): number;
  /** Forget any typed count and pending `g`, e.g. when a mode changes. */
  reset(): void;
}

/**
 * The default keymap: `vimNavigation`, with home/end unbound from top/bottom
 * because the hook passed them to `onUnhandled` before it used this package.
 */
const DEFAULT_KEYMAP: Keymap = defineKeymap(vimNavigation, {
  overrides: { top: "g g", bottom: "G" },
});

/** Ids the old hook always consumed, whether or not a handler was supplied. */
const ALWAYS_CONSUMED = new Set(["down", "up", "top", "bottom", "halfPageDown", "halfPageUp"]);

const OPT_IN: Readonly<Record<string, keyof VimKeysHandlers>> = {
  lineDown: "onLineDown",
  lineUp: "onLineUp",
  pageDown: "onPageDown",
  pageUp: "onPageUp",
};

const MAX_COUNT_DIGITS = 4;
const MAX_COUNT = 9999;

/** Single digit. A regex, not a string range: `"5j" >= "0"` is true. */
const DIGIT = /^[0-9]$/;

function isConsumable(id: string, handlers: VimKeysHandlers): boolean {
  if (ALWAYS_CONSUMED.has(id)) return true;
  const name = OPT_IN[id];
  return name !== undefined && handlers[name] !== undefined;
}

/**
 * The bare key the old hook matched a modified key as, or the step unchanged.
 * Applied only when the exact step is not bound, so a keymap that binds
 * `ctrl+j` still gets `ctrl+j`.
 */
function legacyStep(step: KeyInput): KeyInput {
  const k = step.key;
  if (k === "j" || k === "k" || k === "G" || k === "down" || k === "up") return { key: k };
  if (k === "g" && !step.ctrl) return { key: "g" };
  if ((k === "d" || k === "u") && step.ctrl) return { key: k, ctrl: true };
  return step;
}

export function createVimKeyRouter(options: VimKeyRouterOptions = {}): VimKeyRouter {
  const keymap = options.keymap ?? DEFAULT_KEYMAP;
  const matcher = createMatcher(keymap, {
    sequenceTimeoutMs: options.ggTimeoutMs ?? 500,
    counts: false,
    ...(options.now ? { now: options.now } : {}),
  });

  const boundSteps = new Set<string>();
  // Unmodified characters that may be split out of a burst, by binding id.
  const charIds = new Map<string, Set<string>>();
  for (const b of keymap.bindings) {
    for (const seq of b.sequences) {
      for (const step of seq) {
        boundSteps.add(stepId(step));
        if (step.ctrl || step.alt || step.meta || Array.from(step.key).length !== 1) continue;
        const ids = charIds.get(step.key) ?? new Set<string>();
        ids.add(b.id);
        charIds.set(step.key, ids);
      }
    }
  }

  let countBuf = "";

  const getCount = (): number => {
    const raw = countBuf;
    countBuf = "";
    if (!raw) return 1;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_COUNT) : 1;
  };

  const fire = (id: string, h: VimKeysHandlers): boolean => {
    switch (id) {
      // `h.onMove?.(getCount())` does not evaluate getCount() when onMove is
      // absent, so the count then survives — exactly as before.
      case "down":
        h.onMove?.(getCount());
        return true;
      case "up":
        h.onMove?.(-getCount());
        return true;
      case "top":
        h.onTop?.();
        countBuf = "";
        return true;
      case "bottom":
        h.onBottom?.();
        return true;
      case "halfPageDown":
        h.onHalfPageDown?.();
        return true;
      case "halfPageUp":
        h.onHalfPageUp?.();
        return true;
      case "lineDown":
        if (!h.onLineDown) return false;
        h.onLineDown(getCount());
        return true;
      case "lineUp":
        if (!h.onLineUp) return false;
        h.onLineUp(getCount());
        return true;
      case "pageDown":
        if (!h.onPageDown) return false;
        h.onPageDown(getCount());
        return true;
      case "pageUp":
        if (!h.onPageUp) return false;
        h.onPageUp(getCount());
        return true;
      default:
        return false;
    }
  };

  const step = (input: KeyInput, h: VimKeysHandlers): boolean => {
    if (DIGIT.test(input.key) && !input.ctrl) {
      // A leading 0 is not a count (vim); it is swallowed, as it always was.
      if (countBuf === "" && input.key === "0") return true;
      if (countBuf.length < MAX_COUNT_DIGITS) countBuf += input.key;
      return true;
    }
    const exact = boundSteps.has(stepId(input));
    const result = matcher.feed(exact ? input : legacyStep(input));
    if (result.type === "pending") return true;
    if (result.type === "none") return false;
    return isConsumable(result.id, h) ? fire(result.id, h) : false;
  };

  const route = (input: string, key: KeyState, handlers: VimKeysHandlers = {}): boolean => {
    // Shift+g is G: the old hook checked `key.shift`, and fromInk drops shift
    // from characters (it expects the terminal to send "G").
    const effective = input === "g" && key.shift ? "G" : input;
    const owns = (s: KeyInput) =>
      DIGIT.test(s.key) || [...(charIds.get(s.key) ?? [])].some((id) => isConsumable(id, handlers));
    const steps = fromInk(effective, key, owns);

    let handled = false;
    if (steps.length > 1) {
      // A burst made only of keys we consume: every one of them is consumed.
      for (const s of steps) step(s, handlers);
      handled = true;
    } else if (steps.length === 1 && steps[0]) {
      handled = step(steps[0], handlers);
    }
    if (!handled) handlers.onUnhandled?.(input, key);
    return handled;
  };

  return Object.assign(route, {
    getCount,
    reset: () => {
      countBuf = "";
      matcher.reset();
    },
  });
}

/**
 * HelpBar hints for the vim keys, from the same table the router matches.
 * Pass `ids` for the keys your app actually handles; an unknown id throws.
 * The default keymap is the router's (no home/end).
 */
export function vimKeyHints(
  keymap: Keymap = DEFAULT_KEYMAP,
  ids?: readonly string[],
  style: DisplayStyle = "vim",
): KeyHint[] {
  return toHints(keymap, ids, style);
}
