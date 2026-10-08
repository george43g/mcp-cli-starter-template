/**
 * Demo TUI App — shows the layout the starter recommends:
 *   - Header (centered title)
 *   - Main content area (placeholder list — replace with your domain views)
 *   - DevStatsPanel (toggled with `d`)
 *   - StatusBar + HelpBar
 *
 * Keys come from ONE table, `./keymap.ts`: the shared vim navigation preset
 * (j/k, gg/G, ctrl-d/u half page, ctrl-e/y scroll a line, ctrl-f/b page) plus
 * the app's own keys (`d` dev stats, `q`/Esc quit). Run `example keys`
 * for the full list.
 *
 * ONE `useInput` routes every key: the vim router sees it first, and only a
 * key it did not consume reaches the app's own bindings. Two `useInput`
 * hooks would both see every key, which is how ctrl-d once also toggled the
 * dev stats here. Add a mode (a text field, a modal) by returning early at the
 * top of the same handler, never by adding a second hook.
 */

import {
  createVimKeyRouter,
  DevStatsPanel,
  HelpBar,
  StatusBar,
  useTerminalSize,
  useTheme,
  viewportRows,
  vimKeyHints,
} from "@george43g/tui-kit";
import { Box, Text, useApp, useInput } from "ink";
import { useState } from "react";
import { APP_NAME, buildStamp } from "../meta.js";
import { engineLabel } from "../native-bridge.js";
import { appAction, keymap } from "./keymap.js";
import { type ListView, moveTo, pageBy, scrollBy } from "./scroll.js";

const ITEMS = Array.from({ length: 30 }, (_, i) => ({
  id: i + 1,
  label: `Item ${i + 1} — replace this with your own data source`,
}));

/** The header row above the list; `viewportRows` already reserves the bars. */
const HEADER_ROWS = 1;

const HINTS = vimKeyHints(keymap, ["down", "top", "bottom", "halfPageDown", "devStats", "quit"]);

export function App() {
  const theme = useTheme();
  const { exit } = useApp();
  const [view, setView] = useState<ListView>({ cursor: 0, top: 0 });
  const [showStats, setShowStats] = useState(false);
  // Created once: the router holds a pending `g` and a typed count between keys.
  const [vim] = useState(() => createVimKeyRouter({ keymap }));

  const rows = Math.max(1, viewportRows(useTerminalSize().rows) - HEADER_ROWS);
  const half = Math.max(1, Math.floor(rows / 2));
  const total = ITEMS.length;

  useInput((input, key) => {
    const consumed = vim(input, key, {
      onMove: (delta) => setView((v) => moveTo(v, v.cursor + delta, total, rows)),
      onTop: () => setView((v) => moveTo(v, 0, total, rows)),
      onBottom: () => setView((v) => moveTo(v, total - 1, total, rows)),
      onHalfPageDown: () => setView((v) => pageBy(v, half, total, rows)),
      onHalfPageUp: () => setView((v) => pageBy(v, -half, total, rows)),
      onPageDown: (n) => setView((v) => pageBy(v, n * rows, total, rows)),
      onPageUp: (n) => setView((v) => pageBy(v, -n * rows, total, rows)),
      onLineDown: (n) => setView((v) => scrollBy(v, n, total, rows)),
      onLineUp: (n) => setView((v) => scrollBy(v, -n, total, rows)),
    });
    if (consumed) return;
    switch (appAction(input, key)) {
      case "quit":
        exit();
        break;
      case "devStats":
        setShowStats((s) => !s);
        break;
    }
  });

  const visible = ITEMS.slice(view.top, view.top + rows);

  return (
    <Box flexDirection="column" height="100%">
      <Box paddingX={1}>
        <Text color={theme.palette.accent} bold>
          {APP_NAME}
        </Text>
        <Text color={theme.palette.fgDim}> v{buildStamp()}</Text>
      </Box>

      <Box flexDirection="row" flexGrow={1} paddingX={1}>
        <Box flexDirection="column" flexGrow={1}>
          {visible.map((item, i) => {
            const isCursor = view.top + i === view.cursor;
            const text = `${String(item.id).padStart(3)} ${item.label}`;
            return isCursor ? (
              <Text key={item.id} color={theme.palette.bg} backgroundColor={theme.palette.accent}>
                {text}
              </Text>
            ) : (
              <Text key={item.id} color={theme.palette.fg}>
                {text}
              </Text>
            );
          })}
        </Box>
        {showStats ? (
          <Box marginLeft={2}>
            <DevStatsPanel visible engine={engineLabel()} />
          </Box>
        ) : null}
      </Box>

      <StatusBar
        mode="browse"
        message={`${view.cursor + 1} / ${total}`}
        hint={`engine: ${engineLabel()}`}
      />
      <HelpBar hints={HINTS} />
    </Box>
  );
}
