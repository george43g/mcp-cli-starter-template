# mcpsync

Cross-host MCP config sync. One canonical manifest (`~/.mcp.json`, standard
`{ "mcpServers": { … } }` schema, `${VAR}`-only) applied to every MCP host on
the machine, with per-host fidelity, dry-run previews, and timestamped backups.

> Meta-repo tool. Like `apps/scaffolder`, this is **not** scaffolded into
> generated repos and has no `lib/` mirror. It lives here until it graduates to a
> published home. Staged build: see
> [`docs/plans/2026-08-mcpsync-overview.md`](../../docs/plans/2026-08-mcpsync-overview.md).

## Status

**Stage 1** — canonical core + the three file-merge hosts:

| Host | Config | Notes |
|---|---|---|
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` | wraps each server in `$SHELL -lc '…'` so `${VAR}` resolves at launch; bridges remote servers via `npx -y mcp-remote`; tracks its managed set in `_mcpManagedByDotfiles` |
| Cursor | `~/.cursor/mcp.json` | direct `mcpServers` merge; `${VAR}` verbatim |
| Warp | `~/.warp/.mcp.json` | direct merge, symlink-aware |

CLI hosts (Claude Code, Codex), opencode, a generalized extension `deploy`, an
Ink TUI, and a secrets store land in later stages.

## Commands

```
mcpsync doctor                       # which hosts are present + config paths
mcpsync list                         # servers×hosts drift grid across detected hosts
mcpsync import --from cursor         # pull a host's servers into the canonical manifest
mcpsync apply [--to <host>|all] [--only a,b] [--dry-run] [--yes]
```

Global flags: `--json`, `-q/--quiet`, `-v/--verbose`, `--no-color`,
`-c/--config <path>`.

### Safety

- **Dry-run + backup by default.** Every file write is preceded by a
  `.bak.<epoch>` copy; `--dry-run` previews with no writes; a non-dry-run
  `apply` without a TTY refuses unless `--yes` is given.
- **Merge vs. full-sync.** `apply --only …` (and the library `applyServer`)
  MERGE — they never delete sibling servers. A full `apply` (no `--only`) prunes
  the host down to the canonical set, but only servers mcpsync/dotfiles marked as
  managed; hand-added entries always survive.
- **Coexistence.** The Claude Desktop marker key is `_mcpManagedByDotfiles` —
  the same key `~/dotfiles/mcp/render.js` uses — so mcpsync and the dotfiles
  renderer don't clobber each other.
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
