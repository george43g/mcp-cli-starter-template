# @george43g/tui-kit

Reusable Ink/React building blocks for terminal UIs: an accent-driven theme
system, vim-style key and mouse hooks, a fullscreen renderer wired into the
graceful-shutdown registry, and bounded-memory helpers.

The package includes:

- `renderFullScreen()` — mounts an Ink tree fullscreen and registers its
  unmount with `@george43g/robustness`'s shutdown registry, so the screen tears
  down cleanly on SIGINT/SIGTERM. `fullscreen-ink` is lazy-imported. Returns a
  `FullScreenHandle`, which is exported so you can name it.
- `ThemeProvider` / `useTheme` / `makeTheme` / `derivePalette` — a whole
  palette derived from one accent color, plus `safe`/rich glyph presets and
  contrast helpers (`contrastRatio`, `relativeLuminance`, `tint`, `rotateHue`).
- `useVimKeys` — j/k/gg/G/half-page navigation with a numeric count buffer,
  forwarding anything it doesn't handle to `onUnhandled`.
- `useMouse` — opt-in mouse reporting, with `TuiMouseEvent` for the payload.
- `useDevStats` — reads watchdog state for a live diagnostics panel.
- `useTerminalSize` — current `{ rows, columns }`, re-read on terminal resize,
  falling back to 24x80 when stdout is not a TTY.
- `viewportRows()` and `visibleWindow()` — pure scroll-window arithmetic
  (`CHROME_ROWS`, `MIN_VIEWPORT`, `VisibleWindow`): terminal height in, a
  `[start, end)` slice with the cursor centred out.
- `StatusBar`, `HelpBar`, `DevStatsPanel` — presentational chrome.
- `boundIfNeeded()` and `MemoryCache` — bounded-list eviction and a
  TTL + memory-pressure cache.

## Install

```sh
pnpm add @george43g/tui-kit @george43g/robustness ink react
```

Node.js 24 or later and ESM are required.

`ink`, `react`, and `@george43g/robustness` are **peer dependencies** — install
them alongside this package. Keeping them peers matters: React hooks break if
two copies of React end up in the tree, and `@george43g/robustness` holds
process-global shutdown and watchdog state that `renderFullScreen` and
`useDevStats` must share with the host application.

## Basic usage

```tsx
import { useState } from "react";
import { Box, Text } from "ink";
import { renderFullScreen, StatusBar, ThemeProvider, useTheme, useVimKeys } from "@george43g/tui-kit";

function App() {
  const theme = useTheme();
  const [row, setRow] = useState(0);
  // `delta` carries the count prefix, so `5j` moves five rows.
  useVimKeys({ onMove: (delta) => setRow((r) => Math.max(0, r + delta)) });

  return (
    <Box flexDirection="column">
      <Text color={theme.palette.accent}>row {row}</Text>
      <StatusBar mode="NORMAL" hint="j/k to move · q to quit" />
    </Box>
  );
}

const screen = await renderFullScreen(
  <ThemeProvider accent="#7c5cff">
    <App />
  </ThemeProvider>,
);
await screen.waitUntilExit();
```

## Scrolling lists

```tsx
import { useTerminalSize, viewportRows, visibleWindow } from "@george43g/tui-kit";

function List({ items, cursor }: { items: string[]; cursor: number }) {
  const { rows } = useTerminalSize();
  const { start, end } = visibleWindow(cursor, items.length, viewportRows(rows));
  return <>{items.slice(start, end).map((item) => <Text key={item}>{item}</Text>)}</>;
}
```

The window is always exactly `min(viewport, items.length)` tall — it does not
shrink as the cursor nears the end of the list. `viewportRows` and
`visibleWindow` are pure functions with no Ink or React dependency, so list
maths can be unit-tested without a renderer.

## Subpath exports

`@george43g/tui-kit/theme` exposes the theme and color layer on its own, for
consumers that want the palette without the components.

## Stability

This package is pre-1.0. Minor version bumps may contain breaking changes to
the public surface; patch versions will not.

## License

MIT — see [LICENSE](LICENSE).

## Upgrading from 0.1.x

Three renames and one behaviour fix in 0.2.0:

| Before | After | Why |
|---|---|---|
| `MouseEvent` | `TuiMouseEvent` | The DOM lib declares a global `MouseEvent`. Exporting ours from the barrel shadowed it for any consumer compiling with `lib: ["dom"]`, silently turning their `MouseEvent` into this four-field terminal type. |
| `FullScreenInkProps` | *(removed)* | Nothing used it — `renderFullScreen` takes a `ReactNode` directly. |
| *(not exported)* | `FullScreenHandle` | It is the return type of `renderFullScreen`, so consumers could not write the type of a value they already held. |

`brighten(hex, stops)` now raises lightness **relative to the input colour**.
It previously set an absolute lightness derived from `stops` alone, discarding
the input entirely — so every colour in a palette brightened to the same value,
and anything lighter than L=0.55 came back *darker*. If you compensated for
that, remove the workaround.
