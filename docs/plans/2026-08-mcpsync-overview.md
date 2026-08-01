# ExecPlan: `apps/mcpsync` — cross-host MCP config sync + deploy (overview)

**Status:** `active` — Stage 1 in progress (2026-08-01).

This is the master record for the `mcpsync` work. It is self-contained: a fresh
agent should be able to read this file plus the current stage doc and resume cold.
Convention: [plans/README.md](README.md).

## Goal

One meta-repo-only workspace app `apps/mcpsync` (bin `mcpsync`) that manages MCP
servers across every automatable host from one canonical `~/.mcp.json`, plus a
generalized "deploy a built MCP extension" capability — CLI + Ink TUI. It
**consolidates two existing partial implementations** (`~/dotfiles/mcp/*` and
`imsg-mcp`) into one polished tool.

Acceptance: `mcpsync doctor|list|import|apply|sync|add|remove|deploy` + `mcpsync
tui` work across the 6 automatable hosts; dry-run + backups by default; secrets
never inlined; output is byte-parity with what `~/dotfiles/mcp` produces today
(so it can coexist, then supersede it).

## Home & meta decisions

- New `apps/mcpsync` app — **meta-repo-only**: no `lib/` mirror, no
  `LIB_TO_CANONICAL` entry, never scaffolded into generated repos (same status as
  `apps/scaffolder`). `add-mcp-app` was rejected (it scaffolds an MCP *server*).
- Auto-included by the `apps/*` workspace glob; turbo tasks inherited. Golden test
  only walks `phases/*/lib/**` ⇒ no obligation. `check:usage` is `*-mcp`-scoped ⇒
  skips it. `example/` sync + scaffolder smoke reflect generated output only.
- `private:true` for now; migrate to a published/life-stack home later (bundle the
  `workspace:*` kits via Vite or publish them at that point).

## Prior art being consolidated (load-bearing)

**`~/dotfiles/mcp/` — authoritative adapter fidelity** (port transforms verbatim):
- `render.js` (zero-dep) renders canonical `{mcpServers}` → **opencode**
  (`type:local|remote`, `command[]` array, `environment` key, `${VAR}`→`{env:VAR}`),
  **codex** (TOML managed-block `# >>> dotfiles-mcp` / `# <<< dotfiles-mcp`;
  remote→`url`+`bearer_token_env_var` only for `Bearer ${VAR}` headers; stdio env
  passthrough `env_vars=[K]` only when the value is exactly `${K}`; other headers/
  literals emit a NOTE; skips servers defined outside the block), **claude-desktop**
  (wraps each server in `$SHELL -lc '…'` so GUI launches inherit env; bridges http
  via `npx -y mcp-remote <url> --header "k: v"`; tracks managed set via top-level
  `_mcpManagedByDotfiles`; timestamped `.bak.<ts>` before write).
- `status.js` (zero-dep): host readers for all 6 + drift grid + plaintext-secret
  scanner + symlink-chain doctor.
- `sync.sh`: Claude Code adapter via `claude mcp add/remove --scope user`
  (`~/.claude.json` never edited directly) + home-symlink assertions.
- `~/dotfiles/shell/.mcp.json` = canonical global manifest (7 servers, `${VAR}`-only),
  symlinked to `~/.mcp.json`. `~/dotfiles/docs/mcp-registry.md` = scope model +
  per-repo server sets + footguns (`claude mcp add --header` double-quote baking;
  opencode `environment` vs `env`; Codex has no per-project MCP mechanism).

**`imsg-mcp` — CLI/core/structure reference:**
- `scripts/mcpsync.mjs` (441 lines): importable-library-with-CLI, `normalize()`/
  `toNative()`, `backup()` (`.bak.<epoch>`), key-preserving `readJson`/`writeJson`,
  symlink-aware writes, exports `applyServer`/`HOSTS`/`readCanonical`, commands
  `doctor/list/import/apply/sync/add/remove`.
- `src/app-config.ts`: `credentials.json` @`0600` (dir `0700`), unconditional
  `chmodSync`, read-never-throws, merge-at-resolution.
- `scripts/hot-deploy-ext.mjs`: Claude Desktop extension redeploy (locate Claude
  Extensions dir, match by `manifest.name`/`--ext-id`, `--from` unzip, `rmSync`+
  `cpSync` of `[dist,native,manifest.json,icon.png,assets]`(+`node_modules` w/`--full`),
  reload reminder).

**Consolidation rule:** CLI/core/backup **structure** from imsg; per-host **transform
fidelity + doctor/secret-scanner** from dotfiles; **generalize backup across all
hosts** (dotfiles backs up only Desktop today). Stay **convention-compatible**
(preserve codex managed-block + desktop `_mcpManagedByDotfiles`) so mcpsync never
corrupts live dotfiles-managed files while both coexist. **Deferred migration (not
this build):** once trusted, retire `~/dotfiles/mcp/{render.js,status.js,sync.sh}` +
Makefile targets and update `mcp-registry.md`.

## The Locked Contract (do not change without updating every adapter + stage doc)

**Canonical store:** `~/.mcp.json` → `{ "mcpServers": { <name>: entry } }`. `${VAR}`-only,
never literal secrets.

**Zod `McpServer`:**
```
name: string
transport: "stdio" | "http" | "sse"
command?: string        args?: string[]        env?: Record<string,string>
url?: string            headers?: Record<string,string>        cwd?: string
enabled: boolean = true  scope: "user" | "project" = "user"
```
`normalize(hostShape) -> McpServer`; per-host `toNative(McpServer) -> hostShape`.

**Adapter interface:**
```
interface HostAdapter {
  id: string; label: string;
  capabilities: { mechanism: "file" | "cli"; http: boolean; env: boolean; project: boolean };
  detect(): boolean;
  read(): McpServer[];
  write(servers: McpServer[], o?: { dryRun?: boolean }): WriteResult;
  remove(name: string, o?: { dryRun?: boolean }): WriteResult;
}
```
Adapters are interface-bounded ⇒ parallelizable across subagents once locked (Stage 1).

**Safety invariants (all stages):** dry-run + diff by default (apply/sync/deploy);
timestamped `.bak.<epoch>` before **every** file write; never clobber non-MCP keys
or sibling entries; preserve dotfiles conventions (codex managed-block, desktop
`_mcpManagedByDotfiles`); symlink-aware writes surface the resolved target;
adapters take **injectable paths** so tests use tmp fixtures, never real `~`
configs; CLI-host writes take no backup (the CLI owns the file); `${VAR}` preserved
verbatim, per-host rewrite only at `toNative`.

## Host matrix (6 automatable; ChatGPT desktop dropped — remote connectors)

Claude Code (CLI; read `~/.claude.json`) · Codex (CLI; TOML `~/.codex/config.toml`
managed-block; no per-project scope) · Claude Desktop (file; `$SHELL -lc` wrap +
`mcp-remote` http bridge; `_mcpManagedByDotfiles`; restart) · Cursor
(`~/.cursor/mcp.json`+project) · Warp (`~/.warp/.mcp.json`+project; dotfiles symlink;
`${VAR}`) · opencode (`~/.config/opencode/opencode.json`→`mcp`; outlier shape).

## Stage index

| Stage | Doc | Status |
|---|---|---|
| 1 — skeleton + core + file hosts | [1-core-and-file-hosts](2026-08-mcpsync-1-core-and-file-hosts.md) | active |
| 2 — CLI hosts + opencode + sync | [2-cli-hosts-and-sync](2026-08-mcpsync-2-cli-hosts-and-sync.md) | pending |
| 3 — generalized deploy | [3-deploy](2026-08-mcpsync-3-deploy.md) | pending |
| 4 — Ink TUI grid | [4-tui](2026-08-mcpsync-4-tui.md) | pending |
| 5 — secrets + project scope | [5-secrets-and-project-scope](2026-08-mcpsync-5-secrets-and-project-scope.md) | pending |

## Cross-cutting validation (every stage)

`pnpm install` · `pnpm --filter @george43g/mcpsync {build,test,typecheck}` · root
`pnpm lint` · live read-only/dry-run on this machine cross-checked against
`~/dotfiles/mcp` output · root `pnpm verify` green. Confirm golden test +
`example/` sync + scaffolder smoke unaffected. Include `apps/mcpsync/README.md`.

## Per-stage protocol

Work → verify → set the stage doc `Status: complete` (dated log) → update the stage
index above → commit → allow compaction → next session reads this overview + the
next stage doc and resumes.

## Decisions log

- 2026-08-01: Plan approved. Branch `feat/mcpsync-tool` stacked on
  `feat/scaffold-harness-layer` (both merge together later). Home = `apps/mcpsync`.
  Consolidate dotfiles + imsg. Everything-now scope, staged. Deploy included.

## Recovery

Branch `feat/mcpsync-tool`. If a stage's build is partial, its stage doc's Status
log records the last completed sub-step. Nothing here mutates real host configs
except explicit non-dry-run `apply`/`sync`/`deploy`; all writes are backed up.
