# Handoff

> Front door for a fresh agent or a returning you. You just generated this repo
> from `mcp-cli-starter-template` — this file says where you are and what to do
> first. Keep it current; the durable record is
> [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md).

## Where you are

A Turborepo monorepo that ships four surfaces from one `example` bin: an MCP
server, an Ink TUI, a REPL, and direct per-tool subcommands. Everything is wired
and passes its own tests — nothing must be filled in before it runs. The map is
the root [`AGENTS.md`](AGENTS.md); the docs are indexed in
[docs/README.md](docs/README.md).

## First steps

```bash
pnpm install
pnpm build
pnpm test          # or: pnpm verify  (lint + docs + typecheck + test + build)
example mcp   # run the built MCP server over stdio
```

- Explore a surface: `example tui`, `example repl`, or a direct tool
  like `example health`.
- Understand the layout before changing it:
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Next decision

1. **Trim** the surfaces you won't ship (each is self-contained).
2. **Add your first tool** — see
   [the mcp-tool-author skill](.claude/skills/mcp-tool-author/SKILL.md), then
   re-run `pnpm stress`.
3. **Enable the release pipeline** when you're ready to publish
   ([docs/RELEASE.md](docs/RELEASE.md)); it's present but disabled by default.

Record what you learn in [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md) so the
next session starts where you left off.
