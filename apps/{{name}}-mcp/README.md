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

See `../../docs/ARCHITECTURE.md` for the full package map.
