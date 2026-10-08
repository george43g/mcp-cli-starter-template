/**
 * Every key the TUI binds, in ONE table: the shared vim navigation preset
 * plus this app's own keys. Declaring them together is what lets
 * `defineKeymap` diagnose a clash (`keymap.diagnostics`), and it is the single
 * source for the HelpBar, the `keys` command / `--keys` flag, and the
 * `dist/keys.json` legend the build writes.
 *
 * Add an app key here, then handle its id in `App.tsx`. Keep the vim defaults
 * where you can: the same key doing the same thing in every tool is the point.
 *
 * This file imports only `@george43g/keymap` (no ink, no React), so the CLI
 * can print the table without loading the TUI. It uses only erasable
 * TypeScript, so `keymap-legend src/tui/keymap.ts` can also load it as-is.
 */

import {
  type Binding,
  defineKeymap,
  fromInk,
  type InkKeyLike,
  normalizeInput,
  stepId,
  vimNavigation,
} from "@george43g/keymap";

/** This app's own bindings. Ids are what `App.tsx` switches on. */
const appBindings = [
  { id: "devStats", keys: "d", desc: "Toggle dev stats", group: "App" },
  { id: "quit", keys: ["q", "escape"], desc: "Quit", group: "App" },
] as const satisfies readonly Binding[];

export type AppAction = (typeof appBindings)[number]["id"];

export const keymap = defineKeymap([...vimNavigation, ...appBindings]);

/**
 * The app binding one key press triggers, or undefined. Call it only for a
 * key the vim router did NOT consume. A multi-key chunk (a paste) triggers
 * nothing, so a pasted `q` cannot quit.
 */
export function appAction(input: string, key: InkKeyLike): AppAction | undefined {
  const steps = fromInk(input, key, keymap);
  if (steps.length !== 1 || !steps[0]) return undefined;
  const pressed = stepId(normalizeInput(steps[0]));
  return appBindings.find((b) => keymap.get(b.id)?.keys.includes(pressed))?.id;
}
