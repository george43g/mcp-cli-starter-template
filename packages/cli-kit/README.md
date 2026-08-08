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
- `runRepl()` — a dispatcher-driven interactive shell with shortcuts.
- `isInteractive()`, `isCI()`, `isStdoutTTY()`, `colorEnabled()` and friends —
  TTY/CI detection, plus `color` / `disableColors`.

## Install

```sh
pnpm add @george43g/cli-kit
```

Node.js 24 or later and ESM are required.

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
