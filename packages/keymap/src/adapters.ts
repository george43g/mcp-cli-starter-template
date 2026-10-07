/**
 * Raw events → {@link KeyInput}. Pure functions, NOT hooks: call them from your
 * own single input router and pass the result to `matcher.feed`.
 *
 * Neither adapter imports Ink or touches the DOM; both take structural types,
 * so the core stays dependency-free and runs in a webview IIFE unchanged.
 */

import type { Keymap } from "./keymap.js";
import { isCharKey, type KeyInput, stepId } from "./notation.js";

/** The parts of Ink's `Key` this reads. Ink's own `Key` satisfies it. */
export interface InkKeyLike {
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
  ctrl?: boolean;
  shift?: boolean;
  /** Ink's `meta` is Alt/Option: terminals send it as an ESC prefix. */
  meta?: boolean;
  /** Cmd/Win, kitty keyboard protocol only. */
  super?: boolean;
  eventType?: "press" | "repeat" | "release";
}

/** Decides whether a single-character step may be split out of a burst. */
export type OwnsStep = (step: KeyInput) => boolean;

export interface FromInkOptions {
  /** When `owner` is a Keymap, also own digits 1-9/0 (count prefixes). Default true. */
  counts?: boolean;
}

const INK_NAMED: ReadonlyArray<readonly [keyof InkKeyLike, string]> = [
  ["upArrow", "up"],
  ["downArrow", "down"],
  ["leftArrow", "left"],
  ["rightArrow", "right"],
  ["pageUp", "pageup"],
  ["pageDown", "pagedown"],
  ["home", "home"],
  ["end", "end"],
  ["return", "enter"],
  ["escape", "escape"],
  ["tab", "tab"],
  ["backspace", "backspace"],
  ["delete", "delete"],
];

/**
 * Build the paste-safety predicate from a keymap: a character is owned when it
 * appears, unmodified, as a step of some binding (or is a digit, for counts).
 */
export function ownsFromKeymap(keymap: Keymap, options: FromInkOptions = {}): OwnsStep {
  const owned = new Set<string>();
  for (const b of keymap.bindings) {
    for (const seq of b.sequences) {
      for (const step of seq) {
        if (isCharKey(step.key) && !step.ctrl && !step.alt && !step.meta) owned.add(step.key);
      }
    }
  }
  if (options.counts ?? true) for (const d of "0123456789") owned.add(d);
  return (step) => owned.has(stepId(step));
}

function mods(key: InkKeyLike, step: KeyInput): KeyInput {
  if (key.ctrl) step.ctrl = true;
  if (key.meta) step.alt = true;
  if (key.super) step.meta = true;
  // Shift is carried by the character itself ("G"); keep it only on named keys.
  if (key.shift && !isCharKey(step.key)) step.shift = true;
  return step;
}

/**
 * Ink `useInput(input, key)` → steps.
 *
 * Ink delivers a fast burst or a paste as ONE call carrying the whole string.
 * It is split into one step per character ONLY when every character is owned
 * (`owner`); otherwise this returns `[]` and the chunk is yours to handle
 * whole — typically as text. All-or-nothing is the safety property: a partial
 * split is how a pasted paragraph drives motion or reaches a destructive key
 * (the same rule as tui-kit's `splitNavChunk`).
 */
export function fromInk(
  input: string,
  key: InkKeyLike,
  owner: Keymap | OwnsStep,
  options: FromInkOptions = {},
): KeyInput[] {
  if (key.eventType === "release") return [];

  for (const [flag, name] of INK_NAMED) {
    if (key[flag]) return [mods(key, { key: name })];
  }
  // With ctrl held Ink passes the key NAME as input ("d", or "space").
  if (input === " " || (key.ctrl && input === "space")) return [mods(key, { key: "space" })];

  const chars = Array.from(input);
  if (chars.length === 0) return [];
  if (chars.length === 1) return [mods(key, { key: input })];

  if (key.ctrl || key.meta || key.super) return [];
  const owns = typeof owner === "function" ? owner : ownsFromKeymap(owner, options);
  const steps = chars.map((ch): KeyInput => ({ key: ch }));
  return steps.every(owns) ? steps : [];
}

/** The parts of a DOM `KeyboardEvent` this reads. */
export interface KeyboardEventLike {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
}

const DOM_NAMED: Readonly<Record<string, string>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  PageUp: "pageup",
  PageDown: "pagedown",
  Home: "home",
  End: "end",
  Enter: "enter",
  Escape: "escape",
  Esc: "escape",
  Tab: "tab",
  Backspace: "backspace",
  Delete: "delete",
  " ": "space",
  Spacebar: "space",
};

const DOM_IGNORED = new Set([
  "Shift",
  "Control",
  "Alt",
  "AltGraph",
  "Meta",
  "OS",
  "Super",
  "Hyper",
  "Fn",
  "FnLock",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "Symbol",
  "SymbolLock",
  "Dead",
  "Process",
  "Unidentified",
  "",
]);

/**
 * DOM `keydown` → one step, or `null` for events that are not a key press a
 * binding could name: a lone modifier, IME composition, a dead key.
 *
 * Note for macOS: Option+letter produces a different character (`∆` for
 * Option+j), so `alt+<character>` bindings do not fire in a browser there.
 */
export function fromKeyboardEvent(e: KeyboardEventLike): KeyInput | null {
  if (e.isComposing || DOM_IGNORED.has(e.key)) return null;
  const named = DOM_NAMED[e.key];
  const step: KeyInput = { key: named ?? (isCharKey(e.key) ? e.key : e.key.toLowerCase()) };
  if (e.ctrlKey) step.ctrl = true;
  if (e.altKey) step.alt = true;
  if (e.metaKey) step.meta = true;
  // Shift is carried by the character itself; keep it only on named keys.
  if (e.shiftKey && !isCharKey(step.key)) step.shift = true;
  return step;
}
