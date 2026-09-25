# Project state

> Self-referential onboarding: where this repo is and why. This file was
> generated with the repo — keep it current as the project grows so a fresh
> agent (or a future you) can resume without the chat history.

## Snapshot

Freshly generated from `mcp-cli-starter-template` via `mcp-scaffold`. Names and
scopes are already substituted. All four surfaces ship wired and green:

| Surface | Entry | Status |
|---|---|---|
| MCP server | `example mcp` (stdio; `--http` for Streamable HTTP) | wired, tested |
| TUI | `example tui` | wired, tested |
| REPL | `example repl` (alias `console`) | wired, tested |
| Direct tools | `example health`, `example noop`, … | one CLI subcommand per tool |

Nothing here is a placeholder you must fill before it runs — `pnpm install &&
pnpm build && pnpm test` passes out of the box. Start building, or trim what you
don't need.

## What exists, and why

- **One bin, four surfaces.** A single `example` binary multiplexes the MCP
  server, the Ink TUI, the REPL, and direct per-tool subcommands. The patterns
  are all visible so you can copy them; delete any surface you don't need (see
  [ARCHITECTURE.md](ARCHITECTURE.md)).
- **Shared logic lives in published kits, not the app.** `@george43g/mcp-kit`
  (tool registry, dispatch, transports, sanitize + prompt-injection),
  `@george43g/cli-kit`, `@george43g/tui-kit`, `@george43g/secret-store` and
  `@george43g/robustness` (logger, watchdog, shutdown, timeouts, health) come
  from npm; the app wires them together. `packages/` holds only what is this
  repo's own: `shared-types` and the config packages (`tsconfig`,
  `biome-config`, `vitest-config`, `build-config`).
  [SHARED_RUNTIME.md](SHARED_RUNTIME.md) explains how the robustness runtime is
  consumed.
- **Safety is built in, not bolted on.** Every tool runs through a timeout,
  honors `AbortSignal`, and returns actionable errors; a self-healing watchdog
  restarts the process when it wedges; external content is sanitized and wrapped.
  The rationale and the enforced rules live in
  [GUARDRAILS_MCP_RESPONSES.md](GUARDRAILS_MCP_RESPONSES.md) and the root
  [`AGENTS.md`](../AGENTS.md).
- **Transports.** stdio by default; Streamable HTTP behind a bearer token when
  you need it ([HTTP_MODE.md](HTTP_MODE.md)).
- **Optional native acceleration.** A `napi-rs` crate under `apps/rust-accel/`
  with an automatic TS fallback ([RUST_ACCELERATION.md](RUST_ACCELERATION.md)).

## Verification — what "green" covers

The scaffold ships with its own proof; re-run it after any change (CI runs the
same set on ubuntu + macos):

- `pnpm verify` — lint + docs integrity + typecheck + tests + build (the CI shape).
- `pnpm test` / `pnpm test:no-native` — unit + integration, native and
  TS-fallback paths.
- `pnpm stress` — a 15-assertion lifecycle harness (handshake, health, timeout,
  watchdog kill, HTTP auth + session roundtrip).
- `pnpm check:docs` — this doc, the index, the relative links, and the
  agent-file symlinks stay honest.

## Next steps

1. **Trim.** Delete surfaces you won't ship — each is self-contained (see
   [ARCHITECTURE.md](ARCHITECTURE.md)).
2. **Add your first tool.** Follow
   [`.agents/skills/mcp-tool-author/SKILL.md`](../.agents/skills/mcp-tool-author/SKILL.md):
   define the Zod schema, register it, wire its timeout, add a stress case.
3. **Rename if needed.** The bin/scope are already `example` / `@george43g`;
   adjust further in `package.json` and the workspace.
4. **Enable releases** when ready ([RELEASE.md](RELEASE.md)) — the pipeline is
   present but disabled by default.

## Resume checklist

- Read [`HANDOFF.md`](../HANDOFF.md), then this file.
- `pnpm install && pnpm verify` to confirm a clean baseline.
- Check `git status` and recent commits for in-flight work.
- For multi-hour or risky work, open an ExecPlan
  ([plans/README.md](plans/README.md)).
