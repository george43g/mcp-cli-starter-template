# {{name}}-mcp

MCP server + CLI + TUI, cloned from `mcp-cli-starter-template`.

## Quick start

```bash
pnpm install
pnpm build           # compile TS + (optional) Rust accelerator
pnpm test            # run unit + integration tests
pnpm stress          # 9-case robustness harness
```

## Bins

| Bin | Purpose | Default transport |
|-----|---------|-------------------|
| `{{name}}-mcp` | MCP server | stdio (`--http` for Streamable HTTP) |
| `{{name}}-cli` | Commander CLI: `mcp`, `http`, `tui`, `doctor`, `health`, `noop`, `cli` (REPL) | n/a (in-process dispatch) |
| `{{name}}-tui` | Ink TUI | n/a |

## Adding a tool

1. Copy `src/tools/noop.ts` to `src/tools/<your-tool>.ts`.
2. Define Zod input/output schemas (in `@george43g/shared-types` if you want to mirror in Rust, else inline in the tool file).
3. Register the new tool in `src/tools/registry.ts`.
4. Add an integration test in `tests/integration.test.ts`.
5. If the tool affects process lifecycle, add a case in `scripts/stress-mcp.ts`.

The dispatcher already wires `withTimeout`, `perf` spans, abort propagation, structured error wrapping, and structuredContent return — your handler just needs to be a pure `(input, signal) => output` async function.

## Removing surfaces

- **Drop HTTP support**: delete the `http` subcommand from `src/cli.ts`, the `--http` branch from `src/index.ts`, and case #9 from `scripts/stress-mcp.ts`. Remove `MCP_HTTP_TOKEN` from `.env.example`.
- **Drop TUI support**: delete `src/tui/`, the `tui` subcommand from `src/cli.ts`, the `{{name}}-tui` bin entry from `package.json`, and the TUI entry from `vite.config.ts` `lib.entry`.
- **Drop Rust acceleration**: delete `apps/rust-accel/`, the `src/native-bridge.ts` file, and the `tryLoadNative()` call in `src/tools/noop.ts`.
- **Drop `get_logs`**: delete `src/tools/get-logs.ts` and remove it from the registry.

## Shell completions

Bash/zsh/fish completions are checked in under `completions/` and the manpage under `man/`. Both regenerate from `.usage.kdl` via `usage(1)`:

```bash
mise install               # one-time: installs usage(1)
pnpm artifacts             # regenerate completions + manpage + docs/cli/
pnpm completions:install   # auto-detect $SHELL and install into the right path
```

`completions:install` (script: `scripts/install-completions.sh`) handles the well-known locations for each shell:

| Shell | Default install path |
|-------|----------------------|
| bash  | `~/.local/share/bash-completion/completions/{{name}}` (XDG) or `~/.bash_completion.d/{{name}}` |
| zsh   | `${ZDOTDIR:-~}/.zsh/completion/_{{name}}` |
| fish  | `~/.config/fish/completions/{{name}}.fish` |

CI gate `scripts/check-usage-freshness.mjs` (`pnpm check:usage`) fails the build if `.usage.kdl` was edited without regenerating the artifacts.

See `../../docs/ARCHITECTURE.md` for the full package map.
