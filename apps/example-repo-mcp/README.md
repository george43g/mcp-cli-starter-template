# example-repo-mcp

MCP server + CLI + TUI, cloned from `mcp-cli-starter-template`.

## Quick start

```bash
pnpm install
pnpm build           # compile TS + (optional) Rust accelerator
pnpm test            # run unit + integration tests
pnpm stress          # 13-assertion robustness harness
```

## Bins

| Bin | Purpose | Default transport |
|-----|---------|-------------------|
| `example-repo-mcp` | MCP server | stdio (`--http` for Streamable HTTP) |
| `example-repo-cli` | Commander CLI: `mcp`, `http`, `tui`, `doctor`, `health`, `noop`, `cli` (REPL) | n/a (in-process dispatch) |
| `example-repo-tui` | Ink TUI | n/a |

## Adding a tool

1. Copy `src/tools/noop.ts` to `src/tools/<your-tool>.ts`.
2. Define Zod input/output schemas (in `@george43g/shared-types` if you want to mirror in Rust, else inline in the tool file).
3. Register the new tool in `src/tools/registry.ts`.
4. Add an integration test in `tests/integration.test.ts`.
5. If the tool affects process lifecycle, add a case in `scripts/stress-mcp.ts`.

The dispatcher already wires `withTimeout`, `perf` spans, abort propagation, structured error wrapping, and structuredContent return — your handler just needs to be a pure `(input, signal) => output` async function.

## Secrets

`@george43g/secret-store` resolves a secret through one ordered chain, most explicit first: **env var → `.env` file → OS keychain → external command** (the last is opt-in via `SECRET_STORE_EXEC_BIN`/`_ARGS`). It contains no vault code and never will — pulling a secret *out of* 1Password/Vault/AWS SM is a secret manager's job, and keeping that boundary is what stops vault credentials reaching every tool's dependency tree.

HTTP mode's bearer token is the worked example (`src/commands/http.ts`). `MCP_HTTP_TOKEN` is still checked first, so exporting it behaves exactly as before; the rest of the chain only adds places to look when it is unset. Reads degrade to `null`, so a container that only ever sees env vars pays nothing for the layers beneath.

To use it for your own tool's secrets:

```ts
import { resolveSecret } from "@george43g/secret-store";

const found = await resolveSecret({ toolPrefix: "example-repo", name: "api_key" });
// → { value, source } | null — looks for EXAMPLE_REPO_API_KEY, then .env, then the keychain
```

## Logging

Logs go through `@george43g/robustness` — never `console.log`, which would
corrupt the JSON-RPC stream once the stdio transport is open.

In **stdio mode** the server calls `setStderrMirror(true)`, so info/warn/error
lines are mirrored to stderr and your MCP host (Claude Desktop, Cursor, …)
surfaces them in its own connection log. That is the difference between "the
server just stopped" and an actual error message. The mirror is deliberately
NOT enabled in HTTP or TUI mode: the TUI renders to the same terminal and stray
stderr writes would garble it.

Useful knobs, all read at call time so CLI flags still reach them:

| Variable | Effect |
|---|---|
| `MCP_LOG_TO_FILE=0` | Stop writing NDJSON to disk. Set this if your users should not accumulate `$TMPDIR` logs. |
| `MCP_LOG_REDACT=0` | Disable redaction. On by default: phone numbers and secret-shaped strings are rewritten before any sink sees them. |
| `MCP_LOG_DIR` | Where NDJSON files go (default `$TMPDIR/<tool>/`, 10MB rotation). |

The equivalent programmatic setters (`setFileLogging`, `setLogRedaction`,
`setStderrMirror`) take precedence over the environment.

## Removing surfaces

- **Drop HTTP support**: delete the `http` subcommand from `src/cli.ts`, the `--http` branch from `src/index.ts`, and case #9 from `scripts/stress-mcp.ts`. Remove `MCP_HTTP_TOKEN` from `.env.example`. If nothing else in your tool resolves a secret, drop `@george43g/secret-store` from `package.json` too.
- **Drop TUI support**: delete `src/tui/`, the `tui` subcommand from `src/cli.ts`, the `example-repo-tui` bin entry from `package.json`, and the TUI entry from `vite.config.ts` `lib.entry`.
- **Drop Rust acceleration**: delete `apps/rust-accel/`, the `src/native-bridge.ts` file, and the `tryLoadNative()` call in `src/tools/noop.ts`.
- **Drop `get_logs`**: delete `src/tools/get-logs.ts` and remove it from the registry.

## Shell completions

Bash/zsh/fish completions + manpage + per-subcommand markdown docs are generated from `.usage.kdl` via `usage(1)`. The scaffold ships the spec, a generated baseline using the clone's real bin name, regeneration tasks, and a byte-level freshness check.

The intended workflow is: edit `.usage.kdl`, regenerate, review the diff, and commit the spec and artifacts together. CI's `pnpm check:usage` step (and the matching `cli-artifacts-drift` workflow on the scaffolder side) fails any edit that changes `.usage.kdl` without a matching regeneration.

Update flow:

```bash
mise install                                  # one-time: installs pinned usage(1)
pnpm artifacts                                # regenerate completions/ + man/ + docs/cli/
pnpm check:usage                              # byte-check the committed baseline
git add .usage.kdl completions man docs/cli
pnpm completions:install                      # auto-detect $SHELL and install into the right path
```

`pnpm check:usage` and CI enforce freshness from the initial scaffold onward.

`completions:install` (script: `scripts/install-completions.sh`) handles the well-known locations for each shell:

| Shell | Default install path |
|-------|----------------------|
| bash  | `~/.local/share/bash-completion/completions/example-repo` (XDG) or `~/.bash_completion.d/example-repo` |
| zsh   | `${ZDOTDIR:-~}/.zsh/completion/_example-repo` |
| fish  | `~/.config/fish/completions/example-repo.fish` |

CI gate `scripts/check-usage-freshness.mjs` (`pnpm check:usage`) fails the build if `.usage.kdl` was edited without regenerating the artifacts.

## Install in Claude Desktop (.mcpb bundle)

Claude Desktop loads MCP servers from `.mcpb` bundles — zip archives with a `manifest.json` + the runtime files. Build one with:

```bash
pnpm pack:mcpb         # runs `pnpm build` then bundles into example-repo-mcp-<version>.mcpb
```

The output `.mcpb` drops into Claude Desktop via drag-and-drop (or **Settings → Extensions → Install from file**). Claude reads `manifest.json` (MCPB spec v0.3), spawns `node ${__dirname}/dist/index.js` for stdio transport, and surfaces this server's tools + resources in the catalogue.

The shipping manifest lives at `manifest.json` and pins:

- `manifest_version: "0.3"` — MCPB spec pin
- `server.type: "node"`, `entry_point: dist/index.js`
- `compatibility.platforms: ["darwin", "linux", "win32"]`
- `compatibility.runtimes.node: ">=24.0.0"`

To customize: edit `manifest.json` (e.g. add a `icon` field, update the description) — the build script reads it verbatim and only overrides `version` from `package.json`.

See `../../docs/ARCHITECTURE.md` for the full package map.
