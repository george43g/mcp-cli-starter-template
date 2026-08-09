# @george43g/cli-kit

Commander building blocks for local MCP-adjacent CLIs: a preconfigured program
factory, output-mode resolution, an env↔flag binder, TTY predicates, and an
interactive REPL.

The package includes:

- `buildProgram()` — a Commander program with the starter's global flags
  already wired: `--json`, `-q/--quiet`, `-v/--verbose`, `--no-color`.
- `resolveOutputMode()` / `printAuto()` / `printJson()` / `printTable()` —
  human-vs-JSON output resolution (`--json`, non-TTY, or `CI` forces JSON) and
  the renderers that follow from it.
- `bindEnvFlags()` / `applyEnvFromFlags()` — declare a flag once and have the
  matching environment variable stay in sync.
- `runRepl()` / `parseConsoleInput()` — a dispatcher-driven interactive shell.
  Any tool the dispatcher lists is callable as `<tool> <json>`; shortcuts add
  positional-argument aliases on top.
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

Output mode resolves to JSON when `--json` is passed, when stdout is not a TTY,
or when `CI` is set — so piping a command into `jq` needs no extra flag.

## Stability

This package is pre-1.0. Minor version bumps may contain breaking changes to
the public surface; patch versions will not.

## License

MIT — see [LICENSE](LICENSE).
