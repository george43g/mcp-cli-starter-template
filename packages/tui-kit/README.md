# @george43g/tui-kit

Reusable Ink/React building blocks for terminal UIs: an accent-driven theme
system, vim-style key and mouse hooks, a fullscreen renderer wired into the
graceful-shutdown registry, and bounded-memory helpers.

The package includes:

- `renderFullScreen()` — mounts an Ink tree fullscreen and registers its
  unmount with `@george43g/robustness`'s shutdown registry, so the screen tears
  down cleanly on SIGINT/SIGTERM. `fullscreen-ink` is lazy-imported.
- `ThemeProvider` / `useTheme` / `makeTheme` / `derivePalette` — a whole
  palette derived from one accent color, plus `safe`/rich glyph presets and
  contrast helpers (`contrastRatio`, `relativeLuminance`, `tint`, `rotateHue`).
- `useVimKeys` — j/k/gg/G/half-page navigation with a numeric count buffer,
  forwarding anything it doesn't handle to `onUnhandled`.
- `useMouse` — opt-in mouse reporting.
- `useDevStats` — reads watchdog state for a live diagnostics panel.
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

## Subpath exports

`@george43g/tui-kit/theme` exposes the theme and color layer on its own, for
consumers that want the palette without the components.

## Stability

This package is pre-1.0. Minor version bumps may contain breaking changes to
the public surface; patch versions will not.

## License

MIT — see [LICENSE](LICENSE).
