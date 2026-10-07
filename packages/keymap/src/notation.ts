/**
 * The key notation: LOGICAL keys only.
 *
 * A step is `[ctrl+][alt+][meta+][shift+]<key>`, where `<key>` is one character
 * (case-sensitive: `G` is not `g`) or a named key. A sequence is steps joined by
 * single spaces: `"g g"`.
 *
 * Logical, not physical, because Ink's `useInput` only ever sees what the
 * terminal sent — there is no `KeyD` in a TTY. The notation is therefore the
 * subset both a terminal and a browser can express, and it rejects the rest
 * (`$mod`, `KeyD`, `F13`) loudly rather than binding something that can never
 * fire.
 *
 * `shift` is only meaningful on a NAMED key (`shift+tab`). On a character the
 * character already carries it — Shift+g arrives as `G` in both Ink and the DOM
 * — so `shift+g` is rejected rather than guessed at: on a non-US layout,
 * "shift plus 1" is not `!`, and a notation that pretends otherwise binds keys
 * nobody can press.
 */

/** One normalised key press. Also the input shape the matcher consumes. */
export interface KeyInput {
  /** A single character, or a named key from {@link NAMED_KEYS}. */
  key: string;
  ctrl?: boolean;
  /** Alt/Option. Terminals report it as an ESC prefix, which Ink calls `meta`. */
  alt?: boolean;
  /** Cmd/Super/Win. Terminals only report it under the kitty protocol. */
  meta?: boolean;
  /** Only meaningful on named keys; ignored on characters. */
  shift?: boolean;
}

/** A parsed step. Same shape as {@link KeyInput}. */
export type KeyStep = KeyInput;

/** Display styles for {@link formatKeys}. */
export type DisplayStyle = "vim" | "plain" | "symbols";

/** Named keys the notation accepts, in canonical (lowercase) spelling. */
export const NAMED_KEYS = [
  "up",
  "down",
  "left",
  "right",
  "pageup",
  "pagedown",
  "home",
  "end",
  "enter",
  "escape",
  "tab",
  "space",
  "backspace",
  "delete",
] as const;

export type NamedKey = (typeof NAMED_KEYS)[number];

const NAMED = new Set<string>(NAMED_KEYS);
const MODIFIERS = ["ctrl", "alt", "meta", "shift"] as const;
type Modifier = (typeof MODIFIERS)[number];

/** Thrown for any spec the notation cannot express. */
export class KeySpecError extends Error {
  override name = "KeySpecError";
}

/** True when `key` is a single code point (a character, not a named key). */
export function isCharKey(key: string): boolean {
  return key.length > 0 && Array.from(key).length === 1;
}

function rejectReason(raw: string, keyPart: string): string {
  if (keyPart.startsWith("$")) {
    return `"${raw}": "$mod"-style platform modifiers are not supported. Write ctrl+ or meta+ explicitly.`;
  }
  if (/^(Key[A-Z]|Digit[0-9]|Numpad|F[0-9]{1,2}$)/.test(keyPart)) {
    return `"${raw}": physical key codes are not supported (Ink cannot see them). Use the logical key, e.g. "d" rather than "KeyD".`;
  }
  return `"${raw}": unknown key "${keyPart}". Use a single character or one of: ${NAMED_KEYS.join(", ")}.`;
}

/** Parse one step (`"ctrl+d"`, `"G"`, `"shift+tab"`). */
export function parseStep(raw: string): KeyStep {
  if (raw.length === 0) throw new KeySpecError("empty key step");
  let rest = raw;
  const mods = new Set<Modifier>();
  // A trailing "+" is the plus key itself ("ctrl++"), so only strip a modifier
  // when something remains after its "+".
  for (;;) {
    const m = /^(ctrl|alt|meta|shift)\+(?=.)/i.exec(rest);
    if (!m) break;
    const mod = m[1]!.toLowerCase() as Modifier;
    if (mods.has(mod)) throw new KeySpecError(`"${raw}": modifier "${mod}" given twice`);
    mods.add(mod);
    rest = rest.slice(m[0].length);
  }

  let key: string;
  if (isCharKey(rest)) {
    key = rest;
    if (rest === " ") throw new KeySpecError(`"${raw}": write a space as "space"`);
    if (mods.has("shift")) {
      throw new KeySpecError(
        `"${raw}": shift+<character> is ambiguous across layouts. Write the shifted character itself ("G", "?").`,
      );
    }
  } else {
    const lower = rest.toLowerCase();
    if (!NAMED.has(lower)) throw new KeySpecError(rejectReason(raw, rest));
    key = lower;
  }

  const step: KeyStep = { key };
  for (const mod of MODIFIERS) if (mods.has(mod)) step[mod] = true;
  return step;
}

/** Parse a space-separated sequence (`"g g"`) into steps. */
export function parseKeys(spec: string): KeyStep[] {
  if (typeof spec !== "string" || spec.trim() === "") {
    throw new KeySpecError("empty key spec");
  }
  return spec.trim().split(/ +/).map(parseStep);
}

/**
 * Normalise a raw key press so it compares equal to a parsed step.
 *
 * Drops `shift` on characters (the character carries it) and lowercases named
 * keys. Does NOT validate: an unknown key (`f5`) normalises to something no
 * binding can equal, which is the right answer for a matcher — it is a key
 * press that matches nothing, not an error.
 */
export function normalizeInput(input: KeyInput): KeyStep {
  const char = isCharKey(input.key);
  const step: KeyStep = { key: char ? input.key : input.key.toLowerCase() };
  if (input.ctrl) step.ctrl = true;
  if (input.alt) step.alt = true;
  if (input.meta) step.meta = true;
  if (input.shift && !char) step.shift = true;
  return step;
}

/** Canonical string of one step: the `plain` style. Used as a comparison key. */
export function stepId(step: KeyStep): string {
  let out = "";
  for (const mod of MODIFIERS) if (step[mod]) out += `${mod}+`;
  return out + step.key;
}

/** Canonical string of a sequence. `canonicalKeys("CTRL+D")` → `"ctrl+d"`. */
export function canonicalKeys(spec: string | readonly KeyStep[]): string {
  const steps = typeof spec === "string" ? parseKeys(spec) : spec;
  return steps.map(stepId).join(" ");
}

const VIM_NAMES: Record<NamedKey, string> = {
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  pageup: "PageUp",
  pagedown: "PageDown",
  home: "Home",
  end: "End",
  enter: "CR",
  escape: "Esc",
  tab: "Tab",
  space: "Space",
  backspace: "BS",
  delete: "Del",
};

const SYMBOL_NAMES: Record<NamedKey, string> = {
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  pageup: "⇞",
  pagedown: "⇟",
  home: "↖",
  end: "↘",
  enter: "↩",
  escape: "⎋",
  tab: "⇥",
  space: "␣",
  backspace: "⌫",
  delete: "⌦",
};

function formatVimStep(step: KeyStep): string {
  const named = NAMED.has(step.key) && !isCharKey(step.key);
  const mods = `${step.ctrl ? "C-" : ""}${step.alt ? "M-" : ""}${step.meta ? "D-" : ""}${
    step.shift ? "S-" : ""
  }`;
  if (named) return `<${mods}${VIM_NAMES[step.key as NamedKey]}>`;
  const ch = step.key === "<" ? "lt" : step.key;
  if (mods) return `<${mods}${ch}>`;
  return step.key === "<" ? "<lt>" : ch;
}

function formatSymbolStep(step: KeyStep): string {
  const named = NAMED.has(step.key) && !isCharKey(step.key);
  const char = !named;
  // Mac convention: a modified letter is shown in capitals, so an upper-case
  // character gains an explicit ⇧ to stay distinguishable from its lower case.
  const upper = char && step.key !== step.key.toLowerCase();
  const hasMods = Boolean(step.ctrl || step.alt || step.meta);
  const shift = step.shift || (hasMods && upper);
  const mods = `${step.ctrl ? "⌃" : ""}${step.alt ? "⌥" : ""}${shift ? "⇧" : ""}${step.meta ? "⌘" : ""}`;
  if (named) return mods + SYMBOL_NAMES[step.key as NamedKey];
  return mods + (hasMods ? step.key.toUpperCase() : step.key);
}

/**
 * Render a sequence for humans.
 *
 * - `vim`: `<C-d>`, `gg`, `G`, `<Down>` — steps are concatenated, as vim does.
 * - `plain`: `ctrl+d`, `g g` — the canonical notation itself; round-trips
 *   through {@link parseKeys}.
 * - `symbols`: `⌃D`, `g g`, `↓`.
 *
 * Rendered output is not covered by semver (see README); only `plain` is a
 * stable contract, because it IS the notation.
 */
export function formatKeys(spec: string | readonly KeyStep[], style: DisplayStyle = "vim"): string {
  const steps = typeof spec === "string" ? parseKeys(spec) : spec;
  switch (style) {
    case "plain":
      return steps.map(stepId).join(" ");
    case "symbols":
      return steps.map(formatSymbolStep).join(" ");
    case "vim":
      return steps.map(formatVimStep).join("");
    default:
      throw new KeySpecError(`unknown display style "${String(style)}"`);
  }
}
