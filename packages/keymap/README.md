# @george43g/keymap

One vim-style keymap for every tool: terminal (Ink) and browser (webview) alike.

- **One notation** for logical keys: `ctrl+d`, `G`, `g g`.
- **Declared bindings** with ids, descriptions and groups; defaults can be
  overridden, and every override is reported.
- **A pure matcher** for sequences (`gg`), count prefixes (`5j`) and timeouts.
  You call it from your own input handler. It is not a hook and owns no input.
- **Adapters** from Ink's `useInput(input, key)` and from DOM `KeyboardEvent`.
- **Help output**: a JSON legend, `HelpBar` hints, `--keys` rows for the
  life-stack cheatsheet collectors, a plain-text cheatsheet, and a
  `keymap-legend` bin that writes a legend file at build time.

It has no runtime dependencies and no React/Ink import. It ships an ESM entry
and a single-file browser IIFE.

```sh
pnpm add @george43g/keymap
```

## Notation

A **step** is `[ctrl+][alt+][meta+][shift+]<key>`. A **sequence** is steps
separated by single spaces.

| Part | Values |
|---|---|
| `<key>` | one character, case-sensitive (`G` is not `g`), or a named key: `up` `down` `left` `right` `pageup` `pagedown` `home` `end` `enter` `escape` `tab` `space` `backspace` `delete` |
| `ctrl+` | Control |
| `alt+` | Alt/Option. A terminal sends it as an ESC prefix, which Ink calls `meta` |
| `meta+` | Cmd/Super/Win. A terminal reports it only under the kitty keyboard protocol |
| `shift+` | named keys only (`shift+tab`). On a character, write the shifted character itself (`G`, `?`) |

The notation is rejected loudly, with a `KeySpecError`, for `$mod`, physical
codes (`KeyD`, `Digit1`, `F5`), unknown names, `shift+<character>` and repeated
modifiers. Ink only ever sees logical keys, so a binding to a physical code
could never fire there.

```ts
import { formatKeys, parseKeys } from "@george43g/keymap";

parseKeys("g g");                 // [{ key: "g" }, { key: "g" }]
formatKeys("ctrl+d", "vim");      // "<C-d>"
formatKeys("g g", "vim");         // "gg"
formatKeys("ctrl+d", "plain");    // "ctrl+d"   (the notation itself; round-trips)
formatKeys("ctrl+d", "symbols");  // "⌃D"
```

## The vim presets

`vimNavigation`, group `Navigation`:

| id | default keys |
|---|---|
| `down` | `j`, `down` |
| `up` | `k`, `up` |
| `halfPageDown` | `ctrl+d` |
| `halfPageUp` | `ctrl+u` |
| `lineDown` | `ctrl+e` |
| `lineUp` | `ctrl+y` |
| `top` | `g g`, `home` |
| `bottom` | `G`, `end` |
| `pageDown` | `pagedown`, `ctrl+f` |
| `pageUp` | `pageup`, `ctrl+b` |

`vimScrollOnly` is the four `ctrl+d/u/e/y` bindings and nothing else. Use it on
surfaces where letters already mean something; on a `wm ask` card, for example,
the letters are option keys.

`gg` means top. A single `g` does not. The presets are frozen plain data, so
spread them to extend:

```ts
import { defineKeymap, vimNavigation } from "@george43g/keymap";

const keymap = defineKeymap([
  ...vimNavigation,
  { id: "quit", keys: "q", desc: "Quit", group: "App", location: "src/app.tsx:40" },
]);
```

Ids are stable API, because overrides and handlers key on them.

## Overrides: allowed, reported, discouraged

Keep the defaults. Every tool binding `ctrl+d` to the same action is the
reason this package exists. When two tools collide, override:

```ts
const keymap = defineKeymap(vimNavigation, {
  overrides: { lineDown: "ctrl+j", pageDown: [] },  // [] unbinds
});

keymap.isDefault("lineDown");  // false
keymap.diagnostics;
// [{ kind: "non-default", id: "lineDown", defaultKeys: ["ctrl+e"], keys: ["ctrl+j"], message: … },
//  { kind: "non-default", id: "pageDown", … }]
```

Diagnostics are data, not exceptions, so a user's config cannot crash a tool:

| kind | meaning | at runtime |
|---|---|---|
| `non-default` | an override changed a binding's keys (an override equal to the default is not reported) | the override applies |
| `unknown-override` | an override names an id that does not exist | ignored |
| `conflict` | one sequence is bound to two ids | the first-declared id wins |
| `prefix-ambiguity` | one binding's sequence is a strict prefix of another's (`g` and `g g`) | the shorter fires immediately; the longer can never be reached |

Pass `strict: true` to throw a `KeymapError` on `conflict` and
`prefix-ambiguity`, for example in a test that checks your tool's own keymap.
`formatCheatsheet` marks rebound keys with `*`.

## Matching

```ts
import { createMatcher } from "@george43g/keymap";

const matcher = createMatcher(keymap, { sequenceTimeoutMs: 500, counts: true });
matcher.feed({ key: "5" });  // { type: "pending" }
matcher.feed({ key: "j" });  // { type: "match", id: "down", count: 5 }
matcher.feed({ key: "g" });  // { type: "pending" }
matcher.pending();           // "g", for a status hint
matcher.feed({ key: "g" });  // { type: "match", id: "top", count: 1 }
```

- **Counts.** Digits `1`-`9` and then `0`-`9` accumulate before a sequence, up
  to 4 digits (at most 9999). A `0` with no count typed is an ordinary key. A
  count followed by a key that matches nothing is dropped. While counts are on,
  a bare digit is never matched as a binding.
- **Timeouts.** A partial sequence older than `sequenceTimeoutMs` is discarded,
  with its count, on the next `feed`. The clock is `now()`; inject one in tests.
  No timers run.
- **Broken sequences.** If a key does not continue a pending sequence, the
  sequence is discarded and that key is matched on its own, keeping the count.
  So `5 g j` moves down five, as tui-kit's `useVimKeys` does.
- `pending` means the key was consumed, so do not forward it. `none` means it is
  yours to handle.

These semantics are pinned by [`test-vectors.json`](./test-vectors.json), which
is shipped in the package as `@george43g/keymap/test-vectors.json`. A handler
written by hand, such as a webview that cannot import the package, can be
tested against it: build the named preset, feed `inputs[i]` at time `at[i]`, and
expect `expected[i]`.

## Ink: from your single input router

Call the adapter inside your one `useInput`. Do not add a second hook that
owns input: a second dispatcher is how a `q` typed into a text field once quit
an app.

```tsx
import { createMatcher, defineKeymap, fromInk, vimNavigation } from "@george43g/keymap";
import { useInput } from "ink";

const keymap = defineKeymap(vimNavigation);
const matcher = createMatcher(keymap);

useInput((input, key) => {
  if (mode === "search") return handleSearch(input, key);   // your modes first
  const steps = fromInk(input, key, keymap);
  if (steps.length === 0) return handleText(input, key);      // a paste: yours, whole
  for (const step of steps) {
    const r = matcher.feed(step);
    if (r.type === "match") dispatch({ kind: r.id, count: r.count });
    else if (r.type === "none") handleOther(input, key);
  }
});
```

Ink delivers a fast burst or a paste as one call. `fromInk` splits it into one
step per character only when every character is owned, meaning it appears
unmodified in some binding or is a digit. Otherwise it returns `[]`. This is
all-or-nothing on purpose, the same rule as tui-kit's `splitNavChunk`: a
partial split would let a pasted paragraph drive motion. Pass a predicate
instead of the keymap to decide ownership yourself. The adapter maps Ink's
`meta` to `alt` and its `super` to `meta`, and it ignores kitty key-release
events.

## DOM

```js
document.addEventListener("keydown", (e) => {
  const step = fromKeyboardEvent(e);  // null for lone modifiers, IME composition, dead keys
  if (!step) return;
  const r = matcher.feed(step);
  if (r.type !== "none") e.preventDefault();
  if (r.type === "match") scroll(r.id, r.count);
});
```

On macOS, Option+letter types a different character (`∆` for Option+j), so
`alt+<character>` bindings do not fire in a browser there.

## Browser IIFE (vendoring)

`dist/keymap.iife.js` is a single file with no imports. It defines the global
`GeorgeKeymap`, which has every export of the ESM entry except the bin. It
needs an ES2022 runtime (Safari 15.4 or later). Next to it,
`dist/keymap.iife.js.sha256` holds its hash in `shasum -a 256` format, for a
drift check:

```sh
cp node_modules/@george43g/keymap/dist/keymap.iife.js{,.sha256} web/views/lib/
(cd web/views/lib && shasum -a 256 -c keymap.iife.js.sha256)
```

```html
<script src="lib/keymap.iife.js"></script>
<script>
  const { createMatcher, defineKeymap, fromKeyboardEvent, vimScrollOnly } = GeorgeKeymap;
</script>
```

The file is also exported as `@george43g/keymap/iife`, for bundlers that copy
assets.

## Showing the keys

```ts
import { formatCheatsheet, formatKeysRows, toHints, toLegend } from "@george43g/keymap";

toHints(keymap, ["down", "top"]);
// [{ key: "j/<Down>", label: "Move down" }, { key: "gg/<Home>", label: "Go to top" }]
// The shape of tui-kit's HelpBar `hints` prop.

formatCheatsheet(keymap, { style: "vim", title: "Keys" });
// Keys
//
// Navigation
//   j, <Down>        Move down
//   gg, <Home>       Go to top
//   …

toLegend(keymap, { source: "recall", owner: "life-stack" });
// { version: 1, source, owner, style, bindings: [{ id, keys, display, desc, group, isDefault, location? }] }
```

### `--keys` (life-stack collectors)

`formatKeysRows` prints the cheatsheet collector format: tab-separated
`source  key  description  owner  file:line`, one row per key sequence, with no
header. The `file:line` column is the binding's `location`, or the `location`
option, or empty.

```ts
if (argv.includes("--keys")) {
  process.stdout.write(
    formatKeysRows(keymap, { source: "recall", owner: "mcp-cli-starter-template" }).join("\n") + "\n",
  );
}
```

### `keymap-legend` (a legend file at build time)

```sh
keymap-legend src/keys.ts --out dist/keys.legend.json
keymap-legend src/keys.ts --format tsv --source recall --owner life-stack
keymap-legend src/keys.mjs --export navKeys --style symbols
```

The bin imports the module. It reads the export named by `--export`, or else
`default`, or else `keymap`. That export may be a `Keymap` or a plain
`Binding[]`. A `.ts` module works on Node 24 or later if it uses only erasable
TypeScript syntax. Exit codes: 0 for success, 1 when the module or export is
unusable, 2 for a usage error.

## Rendered output is not covered by semver

The `vim` and `symbols` display strings, `toHints` keys, `toLegend`'s `display`
field and `formatCheatsheet`'s layout may change in a minor or patch release.
Do not snapshot them. These are stable: the `plain` style, which is the
notation itself; the legend's `keys`, `id` and `version` fields; the
`MatchResult` shape; and the five-column order of `formatKeysRows`.
