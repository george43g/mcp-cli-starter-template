# mcpsync

Cross-host MCP config sync. One canonical manifest (`~/.mcp.json`, standard
`{ "mcpServers": { … } }` schema, `${VAR}`-only) applied to every MCP host on
the machine, with per-host fidelity, dry-run previews, and timestamped backups.

> Meta-repo tool. Like `apps/scaffolder`, this is **not** scaffolded into
> generated repos and has no `lib/` mirror. It lives here until it graduates to a
> published home. Staged build: see
> [`docs/plans/2026-08-mcpsync-overview.md`](../../docs/plans/2026-08-mcpsync-overview.md).

## Status

**Stages 1–2** — canonical core + all six automatable hosts + full reconcile:

| Host | Mechanism | Config | Notes |
|---|---|---|---|
| Claude Code | CLI | `~/.claude.json` (read) | writes via `claude mcp add/remove --scope user`; the CLI owns the file (no backup) |
| Codex | file | `~/.codex/config.toml` | managed block between `# >>> dotfiles-mcp` / `# <<< dotfiles-mcp`; `bearer_token_env_var` / `env_vars`; skips servers defined outside the block |
| Claude Desktop | file | `~/Library/Application Support/Claude/claude_desktop_config.json` | wraps each server in `$SHELL -lc '…'` so `${VAR}` resolves at launch; bridges remote servers via `npx -y mcp-remote`; tracks its managed set in `_mcpManagedByDotfiles` |
| Cursor | file | `~/.cursor/mcp.json` | direct `mcpServers` merge; `${VAR}` verbatim |
| Warp | file | `~/.warp/.mcp.json` | direct merge, symlink-aware |
| opencode | file | `~/.config/opencode/opencode.json` | outlier shape: `mcp` key, `command[]`, `environment`, `type:local\|remote`, `${VAR}`→`{env:VAR}` |

A generalized extension `deploy`, an Ink TUI, and a secrets store land in later
stages.

## Commands

```
mcpsync doctor                       # which hosts are present + config paths
mcpsync list                         # servers×hosts drift grid across detected hosts
mcpsync import --from cursor         # pull a host's servers into the canonical manifest
mcpsync apply [--to <host>|all] [--only a,b] [--dry-run] [--yes]
mcpsync sync  [--to <host>|all] [--dry-run] [--yes]   # drift plan, then full-reconcile
mcpsync add <name> --command <cmd> [--arg x]… [--env K=V]… | --url <url> [--header "K: V"]…
mcpsync remove <name> [--to <host>|all]              # canonical by default; --to targets a host
```

Global flags: `--json`, `-q/--quiet`, `-v/--verbose`, `--no-color`,
`-c/--config <path>`.

Drift-grid legend: `✓` in sync · `drift` differs · `-` would add · `extra`
host-only · `off` disabled in canonical · `skip` host won't manage it (e.g. a
codex server defined outside the managed block).

### Safety

- **Dry-run + backup by default.** Every file write is preceded by a
  `.bak.<epoch>` copy; `--dry-run` previews with no writes; a non-dry-run
  `apply`/`sync` without a TTY refuses unless `--yes` is given. CLI hosts
  (Claude Code) take no backup — the official CLI owns the file.
- **Merge vs. full-sync.** `apply --only …` (and the library `applyServer`)
  MERGE — they never delete sibling servers. A full `apply`/`sync` prunes the
  host down to the canonical set, but only servers mcpsync/dotfiles marked as
  managed (Desktop `_mcpManagedByDotfiles`, the codex block, a CLI host's
  user scope); hand-added entries outside those always survive.
- **Coexistence.** mcpsync reuses the dotfiles conventions — the Claude Desktop
  `_mcpManagedByDotfiles` marker and the codex `# >>> dotfiles-mcp` managed
  block — so it and `~/dotfiles/mcp/render.js` produce byte-identical output and
  don't clobber each other. codex servers defined outside the block are skipped.
- **`${VAR}`-only.** Canonical entries carry placeholders, never literal
  secrets; per-host rewriting happens at render time.

## Library

```ts
import { applyServer, readCanonical, HOSTS } from "@george43g/mcpsync";

const servers = readCanonical();                 // name → McpServer
applyServer("claude-desktop", servers.github);   // safe merge, backs up first
```

## Develop

```
pnpm --filter @george43g/mcpsync build      # vite → dist/{index,cli}.js
pnpm --filter @george43g/mcpsync test       # vitest (tmp fixtures, never touches real ~)
pnpm --filter @george43g/mcpsync typecheck
```
