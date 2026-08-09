# Docs index

Progressive-disclosure map of `docs/`. Start from the root
[`AGENTS.md`](../AGENTS.md); load only what the task needs.

`docs/` serves two audiences at once. **Golden-output docs** are shipped
verbatim into generated repos and are byte-checked against
`apps/scaffolder/src/phases/10-docs-readme/lib/docs/` — editing one requires
syncing its lib mirror (and usually `example/docs/`). **Repo-only docs** exist
solely for this repo and can be edited freely.

## Repo-only (this repo's working knowledge)

| Doc | Read when |
|---|---|
| [PROJECT_STATE.md](PROJECT_STATE.md) | Resuming work: continuation state, verification evidence, dependency decisions, deferred work |
| [plans/README.md](plans/README.md) | Starting multi-hour/risky work: the checked-in ExecPlan convention |
| [scaffolder-cli/index.md](scaffolder-cli/index.md) | Generated CLI reference for `mcp-scaffold` (via `mise run docs`) |
| [scaffolder-cli/retrofit-findings.md](scaffolder-cli/retrofit-findings.md) | Retrofit safety invariants and their resolution history — preserve these |
| [scaffolder-cli/evaluations/imsg-mcp-2026-07.md](scaffolder-cli/evaluations/imsg-mcp-2026-07.md) | Evidence from the real-repository retrofit probe |
| [agent-handoff/EQSTACK-16B-MESSAGE.md](agent-handoff/EQSTACK-16B-MESSAGE.md) | Handing the kit adoption to EQStack's agent: paste this into it |
| [agent-handoff/EQSTACK-16B-BRIEF.md](agent-handoff/EQSTACK-16B-BRIEF.md) | The detail behind that message — verified parity, blockers, migration order |

## Golden-output (shipped into generated repos; lib-mirrored)

| Doc | Read when |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Understanding the generated tool's four surfaces and package layering |
| [SHARED_RUNTIME.md](SHARED_RUNTIME.md) | Source-vs-registry runtime modes for `@george43g/robustness` |
| [NATIVE_SCAFFOLDERS.md](NATIVE_SCAFFOLDERS.md) | Why official `create-*` generators are used for leaf workspaces, never the root |
| [RELEASE.md](RELEASE.md) | Enabling the semantic-release pipeline |
| [HTTP_MODE.md](HTTP_MODE.md) | Streamable HTTP transport details |
| [RUST_ACCELERATION.md](RUST_ACCELERATION.md) | Optional napi-rs native path |
| [TUI_DESIGN.md](TUI_DESIGN.md) | Ink TUI design decisions |
| [GUARDRAILS_MCP_RESPONSES.md](GUARDRAILS_MCP_RESPONSES.md) | MCP response sanitization and prompt-injection guardrails |

The `.mdx` files plus `docs.json` are the generated tool's Mintlify site
(`introduction`, `installation`, `quickstart`, `surfaces/`, `internals/`) —
also lib-mirrored. `screenshots/` holds VHS-generated media.

## Maintenance

`pnpm check:docs` (part of `pnpm verify`) enforces this index: every
top-level `docs/*.md` file must have a row here, relative links must resolve,
and the agent-file symlinks must stay intact. When adding a doc, add its row
with a one-line "read when" hook.
