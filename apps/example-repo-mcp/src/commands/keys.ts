/**
 * `keys` subcommand and `--keys` flag: print the TUI's key bindings, read
 * from the same table the TUI routes (`src/tui/keymap.ts`), so the list
 * cannot drift from the keys.
 *
 * The default output is life-stack's cheatsheet collector format: one row per
 * key sequence, tab-separated `source  key  description  owner  file:line`,
 * no header. `keys --json` prints the legend object instead; `pnpm build`
 * runs exactly that (`build:keys`) to write `dist/keys.json`. It runs the
 * built bin rather than `@george43g/keymap`'s `keymap-legend` bin so the file
 * cannot differ from this output, and because pnpm does not link a workspace
 * package's bin that is not built yet at install time.
 *
 * Imports no ink or React: printing keys must not load the TUI.
 */

import { formatKeysRows, toLegend } from "@george43g/keymap";
import type { Command } from "commander";
import { APP_NAME, CLI_NAME } from "../meta.js";
import { keymap } from "../tui/keymap.js";

const LEGEND = { source: CLI_NAME, owner: APP_NAME };

export function keysOutput(json: boolean): string {
  if (json) return `${JSON.stringify(toLegend(keymap, LEGEND), null, 2)}\n`;
  return `${formatKeysRows(keymap, LEGEND).join("\n")}\n`;
}

export function registerKeysCommand(program: Command): void {
  // `--keys` is what the cheatsheet collectors call. It exits from commander's
  // option event, as `--version` does, so it needs no subcommand.
  program.option("--keys", "Print the TUI key bindings (tab-separated rows) and exit");
  program.on("option:keys", () => {
    process.stdout.write(keysOutput(false));
    process.exit(0);
  });

  program
    .command("keys")
    .description("Print the TUI key bindings (tab-separated rows; --json for the legend)")
    .action(() => {
      process.stdout.write(keysOutput(program.opts<{ json?: boolean }>().json ?? false));
    });
}
