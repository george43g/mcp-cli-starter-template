/**
 * The shared defaults. Plain data: spread them, filter them, append to them.
 *
 * `gg` (not a single `g`) is top, as in vim and as tui-kit's `useVimKeys`
 * already behaves. Ids are stable API — consumers' overrides and handlers key
 * on them — so renaming one is a breaking change.
 */

import type { Binding } from "./keymap.js";

const group = "Navigation";

const freeze = (bindings: Binding[]): readonly Binding[] =>
  Object.freeze(
    bindings.map((b) =>
      Object.freeze({
        ...b,
        keys: typeof b.keys === "string" ? b.keys : Object.freeze([...b.keys]),
      }),
    ),
  );

/** The full vim navigation set every list/pager view should share. */
export const vimNavigation: readonly Binding[] = freeze([
  { id: "down", keys: ["j", "down"], desc: "Move down", group },
  { id: "up", keys: ["k", "up"], desc: "Move up", group },
  { id: "halfPageDown", keys: "ctrl+d", desc: "Half page down", group },
  { id: "halfPageUp", keys: "ctrl+u", desc: "Half page up", group },
  { id: "lineDown", keys: "ctrl+e", desc: "Scroll one line down", group },
  { id: "lineUp", keys: "ctrl+y", desc: "Scroll one line up", group },
  { id: "top", keys: ["g g", "home"], desc: "Go to top", group },
  { id: "bottom", keys: ["G", "end"], desc: "Go to bottom", group },
  { id: "pageDown", keys: ["pagedown", "ctrl+f"], desc: "Page down", group },
  { id: "pageUp", keys: ["pageup", "ctrl+b"], desc: "Page up", group },
]);

const SCROLL_ONLY = new Set(["halfPageDown", "halfPageUp", "lineDown", "lineUp"]);

/**
 * Only ctrl-d/u/e/y. For surfaces whose letters already mean something else —
 * the `wm ask` card assigns option keys from labels, so j, k and g are taken.
 */
export const vimScrollOnly: readonly Binding[] = Object.freeze(
  vimNavigation.filter((b) => SCROLL_ONLY.has(b.id)),
);

/** Presets by name, as the conformance vectors refer to them. */
export const presets: Readonly<Record<"vimNavigation" | "vimScrollOnly", readonly Binding[]>> =
  Object.freeze({ vimNavigation, vimScrollOnly });
