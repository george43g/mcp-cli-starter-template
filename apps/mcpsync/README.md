# mcpsync

Cross-host MCP config sync. One canonical manifest (`~/.mcp.json`, standard
`{ "mcpServers": { … } }` schema, `${VAR}`-only) applied to every MCP host on
the machine, with per-host fidelity, dry-run previews, and timestamped backups.

> Meta-repo tool. Like `apps/scaffolder`, this is **not** scaffolded into
> generated repos and has no `lib/` mirror. It is publish-ready as
> `@george43g/mcpsync` (the workspace kits are bundled into its
> `dist/`; npm publish itself is deferred — see Install). Staged build: see
> [`docs/plans/2026-08-mcpsync-overview.md`](../../docs/plans/2026-08-mcpsync-overview.md).

## Install

npm publish is deferred (the package is publish-ready; the release job runs on
manual dispatch only). Until it lands on npm, install the global bin from a
checkout of this repo:

```
pnpm --filter @george43g/mcpsync build
cd apps/mcpsync && pnpm add -g .
mcpsync doctor
```

Once published: `npm i -g @george43g/mcpsync` (or `npx @george43g/mcpsync doctor`
one-shot). As a library: `npm i @george43g/mcpsync` and import — see
[Library](#library).

## Status

**Complete** — canonical core + all six automatable hosts + full reconcile +
Claude Desktop extension `deploy` + an interactive `tui` grid + a local 0600
credentials vault, a redacted plaintext-secret scanner, and per-repo project scope:

| Host | Mechanism | Config | Notes |
|---|---|---|---|
| Claude Code | CLI | `~/.claude.json` (read) | writes via `claude mcp add/remove --scope user`; the CLI owns the file (no backup) |
| Codex | file | `~/.codex/config.toml` | managed block between `# >>> dotfiles-mcp` / `# <<< dotfiles-mcp`; `bearer_token_env_var` / `env_vars`; skips servers defined outside the block |
| Claude Desktop | file | `~/Library/Application Support/Claude/claude_desktop_config.json` | wraps each server in `$SHELL -lc '…'` so `${VAR}` resolves at launch; bridges remote servers via `npx -y mcp-remote`; tracks its managed set in `_mcpManagedByDotfiles` |
| Cursor | file | `~/.cursor/mcp.json` | direct `mcpServers` merge; `${VAR}` verbatim |
| Warp | file | `~/.warp/.mcp.json` | direct merge, symlink-aware |
| opencode | file | `~/.config/opencode/opencode.json` | outlier shape: `mcp` key, `command[]`, `environment`, `type:local\|remote`, `${VAR}`→`{env:VAR}` |

## Commands

```
mcpsync doctor                       # hosts present + inlined-secret scan + ${VAR} reachability
mcpsync list                         # servers×hosts drift grid across detected hosts
mcpsync import --from cursor         # pull a host's servers into the canonical manifest
mcpsync apply [--to <host>|all] [--only a,b] [--scope user|project] [--dry-run] [--yes]
mcpsync sync  [--to <host>|all] [--scope user|project] [--dry-run] [--yes]   # drift plan, then full-reconcile
mcpsync add <name> --command <cmd> [--arg x]… [--env K=V]… | --url <url> [--header "K: V"]…
mcpsync remove <name> [--to <host>|all]              # canonical by default; --to targets a host
mcpsync secret set <server> <KEY>    # store a value in the 0600 vault (read from stdin)
mcpsync secret list | rm <server> [KEY]             # list (names only) / remove vault entries
mcpsync deploy [source] [--ext-id <id>] [--from <archive>] [--full] [--list] [--dry-run] [--yes]
mcpsync tui                          # interactive servers×hosts grid (TTY only)
```

`tui` opens the same servers×hosts drift grid as `list`, interactively: rows are
servers, columns are detected hosts, cells are the drift-status glyphs. Navigate with
`j/k` (server) and `h/l` (host) — plus `gg`/`G` and `^d`/`^u`; press `a` to apply the
current server to the focused host or `A` to apply it to all hosts (both ask for a
`y/n` confirm first — the same gate as the CLI's `--yes`); `r` re-reads from disk; `q`
quits. Applies route through the same `applyServer` merge path as the CLI, so the TUI
and CLI never disagree. It refuses to launch when stdin/stdout isn't a TTY. Theme via
`MCPSYNC_TUI_THEME` (`safe`|`powerline`) and `MCPSYNC_TUI_ACCENT` (hex).

`deploy` hot-installs a built MCP extension into Claude Desktop — no GUI reinstall.
`source` is a built extension dir (with `manifest.json` + `dist/`) or a packed
`.mcpb`/`.dxt`. It matches the installed extension by `manifest.name` (or `--ext-id`)
and replaces `dist`, `native`, `manifest.json`, `icon.png`, `assets` (add
`node_modules` with `--full`). `--list` enumerates installed extensions (read-only);
the replace is gated behind a `--dry-run` preview and a TTY/`--yes` confirm. After a
deploy, reload the extension in Claude Desktop (toggle off/on, or Quit + reopen).

`secret` manages an **optional** local vault at `~/.mcpsync/credentials.json`
(file mode `0600`, dir `0700`). It holds real secret values keyed by server name —
`secret set` reads the value from stdin (so it never lands in shell history or the
process table; `--value` is the explicit escape hatch), `secret list` shows only
server + key names, never values. The vault is **never inlined into a host config**:
`${VAR}` placeholders stay verbatim everywhere. Its jobs are getting a secret out of
the shell env into a `0600` file, powering `doctor`'s reachability report — which
tells you, per `${VAR}` your servers reference, whether it resolves from the vault, the
shell env, or is `UNRESOLVED` — and backing the library's `resolveServerEnv()` (the
concrete launch env for a server, vault-first, in memory only). `doctor` also scans the
canonical manifest and every detected host config for inlined plaintext secrets and
warns (redacted — never the value); for codex it scans the whole `config.toml`,
including tables **outside** the managed block, where such leaks actually live. It
additionally reports symlinked config chains, codex servers defined outside the
managed block, and a missing Claude Desktop managed-set marker.

`--scope project` (on `apply`/`sync`) targets the **repo-local** config set instead of
your `~` files: canonical `<cwd>/.mcp.json` → `<cwd>/.cursor/mcp.json` +
`<cwd>/.warp/.mcp.json` + `<cwd>/opencode.json` (the hosts with a per-project MCP
mechanism; the opencode `mcp` key replaces the old `render.js --opencode` flow).
Claude Code / Claude Desktop / codex have none and are refused with a clear
message. `-c/--config` still overrides the canonical path.

Global flags: `--json`, `-q/--quiet`, `-v/--verbose`, `--no-color`,
`-c/--config <path>`.

Drift-grid legend: `✓` in sync · `drift` differs · `-` would add · `extra`
host-only · `off` disabled in canonical · `skip` host won't manage it (e.g. a
codex server defined outside the managed block).

### Safety

- **Dry-run + backup by default.** Every file write is preceded by a
  `.bak.<epoch>` copy; `--dry-run` previews with no writes; a non-dry-run
  `apply`/`sync` without a TTY refuses unless `--yes` is given. CLI hosts
  (Claude Code) take no backup — the official CLI owns the file. `deploy` replaces
  regenerable build artifacts (not config), so it takes no backup either, but is
  gated by the same dry-run preview + TTY/`--yes` confirm.
- **Won't write Claude Desktop's config while Desktop is running.** Desktop keeps
  `mcpServers` in memory and flushes that (stale) state back to the file when it
  quits — silently clobbering an external write. So `apply`/`sync` **skip** the
  Desktop host while it's running (other hosts still apply), print a warning, and
  tell you to quit Desktop and re-run. `--force` writes anyway (then fully Quit +
  reopen to load it). Detection is macOS-only and fail-open (a detection error is
  treated as "not running"), so it never wedges a legitimate write.
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
  secrets; per-host rewriting happens at render time. The optional `secret` vault
  (`~/.mcpsync/credentials.json`, mode `0600`) is the one place real values may
  live — mcpsync never copies them into a host config. `doctor` scans for any that
  leaked in anyway (redacted).

## Generated JSON is formatter-compatible

Config files are written with a small width-aware serialiser, not
`JSON.stringify(doc, null, 2)`. Arrays of primitives that fit on one line stay
on one line:

```json
"command": ["/opt/homebrew/bin/tmux-mcp-rs", "--shell-type", "zsh"]
```

`JSON.stringify` expands every array, one element per line, while Biome and
Prettier both collapse short primitive arrays — so a generated config was
re-expanded on every reconcile and re-collapsed by the repo's formatter,
forever. A consumer had to exclude the file from `biome check` to keep their
build green.

**The width is 80, deliberately, and not any particular repo's setting.** It is
both Biome's and Prettier's default, so an array collapsed at 80 is left alone
by a formatter configured at 80 *or wider*.

**It narrows the conflict rather than eliminating it.** An array longer than 80
columns is still expanded here and would be collapsed by a formatter set wider
than that. For `command` and `args` arrays this is vanishingly rare — the
longest in any config surveyed was 55 columns — but two tools owning the same
bytes cannot be fully reconciled by one of them. If you hit it, exclude the
generated file from your formatter; that is the honest resolution, not a
workaround.

## Library

```ts
import { applyServer, readCanonical, resolveServerEnv, HOSTS } from "@george43g/mcpsync";

const servers = readCanonical();                 // name → McpServer
applyServer("claude-desktop", servers.github);   // safe merge, backs up first

// Launching a server yourself? Materialize its ${VAR}s (vault-first, then
// process env) — in memory only, never written to a config:
spawn(cmd, args, { env: { ...process.env, ...resolveServerEnv(servers.github) } });
```

## Develop

```
pnpm --filter @george43g/mcpsync build      # vite → dist/{index,cli}.js
pnpm --filter @george43g/mcpsync test       # vitest (tmp fixtures, never touches real ~)
pnpm --filter @george43g/mcpsync typecheck
```
