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
- `useDevStats(visible)` — reads watchdog state for a live diagnostics panel.
  Pass the panel's visibility: while hidden it stops the 2s sampling interval
  and rides the watchdog's 60s memory sample instead, because a 2s `setState`
  on a hidden panel re-renders the whole app 30x/min forever (measured at
  ~17-20MB/min of heap churn behind two real OOM kills). Defaults to `true`.
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

## Text width and truncation

Never truncate terminal text with `String#slice`. It counts UTF-16 code units,
so it splits surrogate pairs — one emoji is two units — and paints a broken
glyph. It also assumes one unit is one cell, which is wrong for emoji and CJK.

```ts
import { truncateToWidth, visualWidth } from "@george43g/tui-kit";

visualWidth("🎉Hi");             // 4, not 3
truncateToWidth("🎉Hello", 5);   // "🎉He…"
```

`truncateToWidth` is the function you actually want; `visualWidth` and
`clusterWidth` are exposed for layout maths. Contract:

- **The ellipsis counts against the budget** — `visualWidth(result) <= maxCols`
  always holds. The alternative (appending after) overflows every truncated row
  by one column, which a flexbox parent then wraps or clips, and it presents as
  a layout bug rather than a width bug.
- A string that already fits is returned **unmodified**, with no ellipsis.
- `maxCols <= 0` returns `""`. If the ellipsis alone does not fit, as many
  clusters as fit are returned with no ellipsis.
- Best-effort and never throws: it runs on a render path over arbitrary content.

Two properties are deliberate and should not be "corrected":

1. **The width model is coarse** — a range check, not a UAX #11 table. It covers
   the failure that actually happens (emoji in user-supplied names) at a cost a
   render path can pay every frame.
2. **`0x2600`–`0x27BF` are width 1**, though UAX #11 calls them ambiguous.
   Terminals paint `▶ ◀ ● ✉ ✓ ✗ ★` single-cell, and following the standard here
   misaligns every layout drawn with them.

There is no padding counterpart on purpose — ink's flexbox handles padding.

## List primitives (added in 0.5.0)

Five pure functions extracted after a design negotiation with four TUI
consumers — imsg-mcp, gmail-cli-mcp, up-bank-mcp and browser-tab-mcp — all of
which had written the same machinery separately. Deliberately **not** a
component: no keys, no state ownership, no render loop.

The brief was a multi-column tree navigator. Two consumers argued against it
from opposite tree shapes and both were right, so what shipped is the layer
underneath one. `docs/plans/2026-08-tui-shared-primitives.md` in the
[template repo](https://github.com/george43g/mcp-cli-starter-template) has the
full record.

### `lineWindow` — windowing by RENDERED LINES

```ts
const w = lineWindow({
  itemCount: messages.length,
  cursor,                                   // -1 = follow the tail
  budgetLines: bodyHeight,
  heightOf: (i) => estimateRows(messages[i], width),
  anchor: chooseAnchor(cursor, messages.length),
});
messages.slice(w.start, w.end);
```

**Never window by row count when rows have different heights.** Row-count
windowing is what produces the height-0 overpaint bug family: a yoga-shrunk box
paints its text over the next row, and diagnosing it costs hexdump archaeology.

`heightOf` is yours because only you know how your content wraps, and it is
memoised per call — the walk revisits indices, so you do not need `useCallback`
to make an expensive estimator affordable.

Two contract points worth knowing: **the cursor is always inside the window**,
even when one item is taller than the whole budget (`usedLines` may then exceed
`budgetLines` — returning empty would clip the only thing on screen); and
`cursor: -1` forces `anchor: "end"`, because following the tail *is*
end-anchoring.

`chooseAnchor(cursor, itemCount, nearEnd = 2)` picks between the two algorithms.
They are genuinely two: near the tail you want the LAST item pinned to the
bottom edge while the cursor sits a row or two above it, and no `aboveFraction`
expresses that, because `aboveFraction` anchors the cursor.

### `navReduce` — cursor transitions, no keys

```ts
const next = navReduce(nav, { kind: "down" }, { itemCount, pageSize, groupBoundary });
```

Intents: `up`/`down`/`pageUp`/`pageDown`/`top`/`bottom`, `digit` (vim count
prefix), `groupJump`, `set`, and `itemsReplaced`.

`itemsReplaced` is the one to read twice. **Item arrays are not stable and
indices are not durable** — eviction collapses the middle of a long list, lazy
loading prepends to the front. Hand it the remap you already compute:

```ts
navReduce(nav, { kind: "itemsReplaced", remap: (old) => old + prepended }, ctx);
```

The kit clamps the remap's output, so a remap pointing into a removed region
degrades to the nearest survivor rather than crashing your window — you do not
have to be defensive about your own eviction maths. And **the `-1` sentinel is
never remapped**: following the tail is a relationship to the end of a list, not
to an index.

Count semantics: digits accumulate (`count * 10 + digit`); a movement consumes
the count as a repeat factor and resets it; anything else resets it.

`applyRestore(policy, prev, itemCount)` decides where the cursor lands when a
column's contents are replaced wholesale. It is a **parameter** because the
right default is contested inside a single app — a conversation pane wants
`snap-end`, a file tree wants `restore`, a log pane wants
`follow-until-touched`.

### `allocateWidths` — columns, not rows

```ts
const { widths, collapsed } = allocateWidths(columns, [
  { id: "list",   min: 24, preferred: 60, priority: 10, collapse: "min" },
  { id: "detail", min: 30, preferred: 40, priority: 0,  collapse: "drop" },
]);
```

Two orthogonal knobs. `priority` says **who** yields first; `collapse` says
**what yielding means**. Trying to express both with one number is how
allocators grow config objects.

The rule for choosing `collapse`: **columns whose content is CONTEXT collapse to
a breadcrumb; columns whose content is ELABORATION drop.** A detail pane whose
information is already in the selected list row should vanish rather than spend
ten columns repeating it; an ancestor column that tells you which folder you are
inside must stay visible or you lose your place. `"min"` is the third case — a
column that must always exist.

Mode-gated columns are yours: omit a closed column from the array. The allocator
does not know about modes.

### `fitToWidth` and `splitNavChunk`

`fitToWidth(s, cols)` truncates **and** pads in one call, guaranteeing
`visualWidth(result) === cols` exactly. See the width section above for why
exactness matters.

`splitNavChunk(input, owned)` fans a keystroke chunk out per character **only if
every character is one you own**, else returns `null` so you pass the chunk
through whole. Ink delivers a paste as one `useInput` call with the whole
string; all-or-nothing is what stops a paste driving navigation. It is the pure
half of a router — it knows nothing about modes and cannot quit your app.

## Nerd Font detection

For TUIs offering a glyph preset that needs a patched font. Without a check the
user picks "powerline" and gets blank boxes with no explanation.

```ts
import { detectNerdFont } from "@george43g/tui-kit";

const font = detectNerdFont();
if (font.detected === false) warnHard();       // fc-list confirmed none
else if (font.detected === null) warnSoftly(); // could not tell
```

The three-variant result is the whole point:

| Result | Meaning |
|---|---|
| `{ detected: true, source: "fc-list" }` | confirmed present |
| `{ detected: false, source: "fc-list" }` | confirmed absent |
| `{ detected: null, source: "unavailable", reason }` | could not determine |

**`null` is never collapsed to `false`.** Default macOS ships no fontconfig, and
those users routinely *do* have a patched font — so answering `false` fires the
"no Nerd Font" warning at exactly the people for whom it is wrong. Render a hard
warning only for a confirmed absence and a soft hint for `null`.

`reason` distinguishes "not on PATH" from "timed out" when a user reports the
warning. The result is cached per process (the probe costs ~1s); the exported
cache reset is a test seam only.

## Subpath exports

`@george43g/tui-kit/theme` exposes the theme and color layer on its own, for
consumers that want the palette without the components.

## Fixed after 0.4.0: `useVimKeys` lost fast keystrokes

If you are on `0.4.0` or earlier, upgrade — this one is invisible until you
look for it.

Ink delivers a fast keystroke burst or a paste as **one** `useInput` call
containing the whole string, but every comparison in the hook was
`input === "j"`. A burst matched nothing and was dropped: measured against a
real 56-row list, `jj` sent as one write moved **0** rows, and ten rapid `j`
moved **4**.

The count buffer made it worse. The digit guard was `input >= "0" && input
<= "9"` — a *lexicographic string range*, which `"5j"` satisfies. So a chunked
count landed in the buffer and was replayed on the **next** keystroke, giving
you a lone `j` that silently jumps 5 rows.

A chunk is now dispatched per character, but only when every character is a key
the hook owns (`0-9 g G j k`). Anything else still reaches `onUnhandled`
intact, so a pasted paragraph cannot drive motion or reach your
destructive-key handlers one character at a time.

Reported by a downstream consumer running an adversarial TUI stress pass. No
API change.

### Check your own `useInput` handlers for the same two bugs

This is not a `useVimKeys` bug so much as an **ink bug class**, and every
hand-written key router is exposed to it. The first consumer to read this fix
went looking and found both defects in their own router the same day — they had
filed the symptom ("`gg` ignored when both g's arrive in one chunk") as minor
polish, not realising it shared a cause with keystroke loss.

Two greps will tell you:

```console
# 1. Single-character equality — misses every burst and paste
$ grep -n 'input === "' src/**/*.tsx

# 2. A lexicographic digit range — "5j" satisfies it
$ node -e 'console.log("5j" >= "0" && "5j" <= "9")'
true
```

The fix that works: fan a chunk out **only** when every character is a key you
own, and pass anything else through whole. Do not fan out unconditionally — if
any single key of yours is destructive (quit, delete, send, write a file),
pasting text containing that character will fire it. One consumer had already
shipped exactly that incident: a paste containing `q` quit the app.

## Stability

This package is pre-1.0. Minor version bumps may contain breaking changes to
the public surface; patch versions will not.

## License

MIT — see [LICENSE](LICENSE).

## Upgrading to 0.3.0

No API breaks. `useDevStats` gained an optional `visible` parameter (defaults
to `true`, matching the 0.2.x call shape) and `DevStatsPanel` now suspends its
2s sampling while hidden — if you rendered the panel conditionally to work
around the constant re-renders, you can pass `visible` and keep it mounted.

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
