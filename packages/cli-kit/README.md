# @george43g/cli-kit

Commander building blocks for local MCP-adjacent CLIs: a preconfigured program
factory, output-mode resolution, an env↔flag binder, TTY predicates, and an
interactive REPL.

The package includes:

- `buildProgram()` — a Commander program with the starter's global flags
  already wired: `--json`, `-q/--quiet`, `-v/--verbose`, `--no-color`.
- `resolveOutputMode()` / `printAuto()` / `printJson()` / `printTable()` —
  human-vs-JSON output resolution and the renderers that follow from it.
  Explicit requests (`json`, `human`) outrank the inferred signals (non-TTY,
  `CI`).
- `bindEnvFlags()` / `applyEnvFromFlags()` — declare a flag once and have the
  matching environment variable stay in sync.
- `runRepl()` / `parseConsoleInput()` — a dispatcher-driven interactive shell.
  Any tool the dispatcher lists is callable as `<tool> <json>`; shortcuts add
  positional-argument aliases on top. Works over a pipe as well as a terminal.
- `isInteractive()`, `isCI()`, `isStdoutTTY()`, `colorEnabled()` and friends —
  TTY/CI detection, plus `color` / `disableColors`.

## Install

```sh
pnpm add @george43g/cli-kit commander
```

Node.js 24 or later and ESM are required.

`commander` is a **peer dependency**, not a bundled one. `buildProgram()`
returns a `Command` and `applyEnvFromFlags()` accepts one, so Commander's types
cross the public API boundary — if the consumer resolved a second copy, those
types would be structurally similar but nominally distinct, and `instanceof`
checks against it would fail. Declaring it as a peer makes the single shared
instance explicit. (`ink` and `react` are peers of `@george43g/tui-kit` for the
same reason.)

### Upgrading from 0.1.x

`commander` moved from a regular dependency to a peer in 0.2.0. Add it to your
own `package.json` if it is not already there — most consumers of this package
already depend on Commander directly.

The REPL also changed, all of it fixes:

- **`raw` works.** The tokenizer used to consume every quote character as shell
  quoting, so `raw {"name":"x"}` reached `JSON.parse` as `{name:x}` and threw.
  Since `raw` was the only route to a tool without a registered shortcut, that
  made those tools unreachable.
- **`<tool> <json>` dispatch exists.** The docblock and `help` had advertised it
  for a long time; nothing implemented it. Any tool the dispatcher lists is now
  callable by name, so `raw` is a fallback rather than the only route.
- **Backslash escapes are honoured**, so `foo "she said \"hi\""` yields one
  argument containing a literal quote.
- **The command word keeps its case**, so a tool named `getLogs` is reachable.
  Built-ins (`help`, `quit`, …) still match case-insensitively.
- **EOF exits.** A piped or redirected stdin used to run out of input and leave
  the returned promise unsettled, hanging the process.
- `parseConsoleInput` is now exported and returns `{ cmd, rest, args }`. `rest`
  is the remainder of the line verbatim — read JSON from it; `args` is the
  shell-style split, for positional shortcuts.

### What arrived in 0.3.1

Everything in this section shipped in **0.3.1**, which is a patch version
carrying four additive API changes — the release was mis-typed as a fix because
the headline was the bug below, and semantic-release reads the commit type, not
the diff. Nothing here is breaking, so `^0.3.0` consumers are unaffected; the
version simply under-signals what it contains.

**Piped multi-command input works.** Up to and including 0.3.0, `runRepl` read
lines with a recursive `rl.question()`. That arms a *one-shot* listener, so
while an async command was being awaited no listener existed and every line
readline had already buffered was emitted into nothing:

```sh
printf 'help\ntools\nquit\n' | mytool console   # 0.3.0: ran only `help`
```

EOF then closed the stream cleanly, so the loss was silent. Input is now
consumed through a serial queue that also waits for the queue to drain before
resolving at EOF. Two independent consumers reported this; if you worked around
it by invoking one command per process, you can stop.

Four additions to `runRepl`, all opt-in and all backwards compatible:

| Addition | What it does |
|---|---|
| `formatResult(result)` | Pretty-print a successful result yourself. Receives the whole result, so it can read `structuredContent`. |
| `showMeta: true` | Print a dim `· 12ms · engine=ts` footer after each call, from the dispatcher's `_meta`. Both `duration_ms` and `dur_ms` are read. |
| `json` built-in | Toggles raw `structuredContent` output. Outranks `formatResult` — the point is to see what the tool actually returned. |
| `last-error` built-in | Reprints the last error, whether it came back as an `isError` result or was thrown while parsing. |

`ToolCallResult` gained `structuredContent?: unknown` and
`_meta?: Record<string, unknown>` to carry what those read. Both are optional,
so existing dispatchers still typecheck.

### Upgrading from 0.3.x

**One breaking change: `ToolCallResult.content` is now a discriminated union.**

```ts
// before
content?: Array<{ type: string; text: string }>
// after
content?: ContentBlock[] | undefined

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };
```

The old shape could not describe any MCP server with an image tool: every block
was required to carry `text`, so a screenshot had to be cast or faked. Two
consumers reported it under-modelled within a day of each other, which is what
moved it from "usage problem" to "the type is wrong".

**What breaks:** reading `.text` off a block without narrowing.

```ts
const text = result.content?.[0]?.text;          // TS2339 from 0.4.0
const first = result.content?.[0];               // narrow instead
const text = first?.type === "text" ? first.text : undefined;
```

That error is the point, and it lands exactly where a decision is needed: at the
render site, which now has to say what it does with a non-text block. The union
is deliberately **closed** — no `{ type: string; … }` catch-all. A catch-all
overlaps `type: "text"`, so narrowing would need a cast everywhere, and it would
silently accept block shapes nothing can render.

**What you probably do not need to change:** if you let the REPL render results,
nothing. `runRepl` now prints non-text blocks itself, one line each, in the order
the dispatcher returned them:

```
[image image/jpeg, 61.4 KB]
{"saved": true}
· 12ms · engine=ts
```

Sizes are **decoded bytes**, not base64 characters — the raw string length
overstates the real size by 4/3 and is not a unit anyone can act on. Block order
is preserved because it is a dispatcher contract: a dispatcher that appends its
text block last means a screenshot arrives as `[image, text]`, and reordering
would misreport what the tool returned. The meta footer always comes last.

`resource` and `audio` blocks are not modelled yet — no known caller emits them,
and guessing their shape from the spec rather than from a real producer is how
the text-only version got written. If one arrives at runtime the renderer prints
a `[resource]` placeholder rather than crashing.

**Also in 0.4.0, non-breaking:** the optional fields are declared
`?: T | undefined` rather than `?: T`, so a consumer compiling with
`exactOptionalPropertyTypes` can pass a result through verbatim instead of
rebuilding it with conditional spreads to avoid `isError: undefined`.

## Basic usage

```ts
import { buildProgram, printAuto } from "@george43g/cli-kit";

const program = buildProgram({
  name: "my-tool",
  description: "Does the thing",
  version: "1.0.0",
});

program.command("list").action(() => {
  printAuto(
    items,
    { head: ["Name", "Status"], rows: (i) => [i.name, i.status] },
    program.opts(),
  );
});

await program.parseAsync();
```

### Output mode

`resolveOutputMode` picks JSON or human form by this precedence, highest first:

| # | Signal | Result |
|---|---|---|
| 1 | `json: true` (bind to `--json`) | `json` |
| 2 | `human: true` (bind to `--human` / `--no-json`) | `human` |
| 3 | `FORCE_HUMAN` set to anything but `0`/`false`/empty | `human` |
| 4 | stdout is not a TTY | `json` |
| 5 | `CI` is set | `json` |
| — | otherwise | `human` |

Levels 4–5 mean piping into `jq` needs no extra flag. Levels 2–3 are the
inverse that used to be missing: without them the human view was unreachable
the moment stdout was not a terminal, so `mytool list | less` was impossible
and testing a renderer meant running the CLI under a pty. Two contradictory
explicit requests resolve to `json`, on the grounds that something asking for
`--json` is probably a pipeline.

## Stability

This package is pre-1.0. Minor version bumps may contain breaking changes to
the public surface; patch versions will not.

## License

MIT — see [LICENSE](LICENSE).
