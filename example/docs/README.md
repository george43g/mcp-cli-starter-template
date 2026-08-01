# Docs index

Progressive-disclosure map of `docs/`. Start from the root
[`AGENTS.md`](../AGENTS.md); load only what the task needs.

`pnpm check:docs` (part of `pnpm verify`) enforces this index: every top-level
`docs/*.md` must have a row here, every relative link must resolve, and the
`CLAUDE.md`/`.cursorrules` agent-file symlinks must stay intact.

## Start here

| Doc | Read when |
|---|---|
| [PROJECT_STATE.md](PROJECT_STATE.md) | Getting oriented: what this repo is, why it's built this way, and what to do next |
| [plans/README.md](plans/README.md) | Starting multi-hour or risky work: the checked-in ExecPlan convention |

## Reference

| Doc | Read when |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Understanding the four surfaces (MCP / TUI / REPL / direct tools) and the package layering |
| [SHARED_RUNTIME.md](SHARED_RUNTIME.md) | The shared robustness runtime — source-vs-registry modes |
| [NATIVE_SCAFFOLDERS.md](NATIVE_SCAFFOLDERS.md) | When to reach for an official `create-*` generator for a new leaf workspace |
| [RELEASE.md](RELEASE.md) | Enabling the semantic-release pipeline |
| [HTTP_MODE.md](HTTP_MODE.md) | Streamable HTTP transport details |
| [RUST_ACCELERATION.md](RUST_ACCELERATION.md) | The optional napi-rs native path |
| [TUI_DESIGN.md](TUI_DESIGN.md) | Ink TUI design decisions |
| [GUARDRAILS_MCP_RESPONSES.md](GUARDRAILS_MCP_RESPONSES.md) | MCP response sanitization and prompt-injection guardrails |

The `.mdx` files plus `docs.json` are this tool's Mintlify site
(`introduction`, `installation`, `quickstart`, `surfaces/`, `internals/`).
`screenshots/` holds generated media.

## Maintenance

When adding a top-level doc, add its row here with a one-line "read when" hook —
`pnpm check:docs` fails otherwise.
