# ExecPlan: `apps/mcpsync` — cross-host MCP config sync + deploy (overview)

**Status:** `complete` — all five stages built + verified (2026-08-02). Feature
branch still local (unpushed); merge/publish pending explicit authorization.

This is the master record for the `mcpsync` work. It is self-contained: a fresh
agent should be able to read this file plus the current stage doc and resume cold.
Convention: [plans/README.md](README.md).

## Resume handoff (2026-08-02)

**Where we are.** Branch `feat/mcpsync-tool` (stacked on `feat/scaffold-harness-layer`;
both unpushed, both merge together later). **ALL FIVE STAGES ARE BUILT + verified.**
All six automatable hosts are live (Claude Code, Codex, Claude Desktop, Cursor, Warp,
opencode) plus the full command surface —
`doctor`/`list`/`import`/`apply`/`sync`/`add`/`remove`/`secret`/`deploy`/`tui` — with a
0600 credentials vault, a redacted plaintext-secret scanner + `${VAR}` reachability
report in `doctor`, and `--scope project`. **128 tests**; codex + opencode + Desktop
render byte-identically to `~/dotfiles/mcp/render.js`; the TUI grid is byte-identical
to `list`. See each stage doc's Status log for the evidence. `dist/` is gitignored.

**The build is functionally done.** No stage remains. The only open items are the
DEFERRED, non-build follow-ups and the merge/publish decision (below) — none to be
started without explicit user authorization.

**Deferred (not build tasks; do NOT start unprompted):**
- Retire `~/dotfiles/mcp/{render.js,status.js,sync.sh}` + Makefile targets and update
  `~/dotfiles/docs/mcp-registry.md` — the user's "migrate later," only once mcpsync is
  trusted in daily use.
- In-TUI per-cell env/args editing (text-input modals) + `useMouse` nav — the pure
  model + single write path make both additive (see Stage 4 doc).
- **Merge/publish:** `feat/scaffold-harness-layer` + `feat/mcpsync-tool` merge together,
  ONLY with explicit authorization. `mcpsync` is `private:true` (bundle the `@george43g/*`
  kits via Vite, or publish them, when it graduates to a published home). NO `NPM_TOKEN`
  (OIDC only); do not enable `release.yml` or push without being asked.

**First thing next session (if resuming):** `git status --short` (tree clean on
`feat/mcpsync-tool`); `pnpm install`; sanity `pnpm --filter @george43g/mcpsync test`
(expect 128 passing).

**Stage 5 recap:** `core/secrets.ts` = opt-in `~/.mcpsync/credentials.json` @`0600`
(dir `0700`, unconditional `chmodSync`, read-never-throws), values keyed by server
name and NEVER inlined into a host config — `${VAR}` stays verbatim; the vault only
gets secrets out of the shell env and powers `doctor` reachability. `core/secret-scan.ts`
runs the dotfiles `status.js` guards over each adapter's `readRaw()` map (one read path
for sync + scan). `doctor` adds a redacted secret scan + `${VAR}` resolution report
(`from credentials`/`from env`/`UNRESOLVED`); `--json` returns `{hosts,secrets,resolution}`.
A `secret set|list|rm` command manages the vault (values via stdin, never shell history).
`apply`/`sync --scope project` read `<cwd>/.mcp.json` and target cwd-bound cursor+warp
(`projectHosts`); non-project hosts refuse with a scope-aware message.

**Invariants (do not violate):** meta-repo-only (no `lib/` mirror, not in
`LIB_TO_CANONICAL`, never scaffolded); adapters take injectable paths; tests never touch
real `~` configs; secrets never inlined into host configs (`${VAR}` verbatim; the vault
is 0600 and never written to a world-readable file); dry-run + backup by default (CLI
hosts excepted — the CLI owns the file); the `prune` merge/full-sync safety lever
(`applyServer` + `--only` never delete; only a full `apply`/`sync` prunes managed
servers); preserve dotfiles conventions for coexistence (codex managed-block, desktop
`_mcpManagedByDotfiles`). The full contract is below.

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
| 1 — skeleton + core + file hosts | [1-core-and-file-hosts](2026-08-mcpsync-1-core-and-file-hosts.md) | complete |
| 2 — CLI hosts + opencode + sync | [2-cli-hosts-and-sync](2026-08-mcpsync-2-cli-hosts-and-sync.md) | complete |
| 3 — generalized deploy | [3-deploy](2026-08-mcpsync-3-deploy.md) | complete |
| 4 — Ink TUI grid | [4-tui](2026-08-mcpsync-4-tui.md) | complete |
| 5 — secrets vault + project scope | [5-secrets-and-project-scope](2026-08-mcpsync-5-secrets-and-project-scope.md) | complete |
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
- 2026-08-01: **Stage 1 complete** — canonical core + Claude Desktop/Cursor/Warp
  adapters + `doctor`/`list`/`import`/`apply`, 28 tests, byte-parity with
  `~/dotfiles/mcp/render.js`. Deviations (all documented in the stage doc): tsconfig
  `node.json` (React deferred to Stage 4), `vitest.app` preset, `toDirectNative`
  omits empty `args`/`env`, robustness dep declared-but-unused until Stage 4.
- 2026-08-02: **Stage 2 complete** — Claude Code (CLI), Codex (managed-block file
  writer, NOT `codex mcp add`), opencode; `sync`/`add`/`remove`; `diff.ts`;
  host-level `matches`/`willSkip`. 65 tests; codex + opencode byte-match render.js.
  Live drift correctly flagged real machine divergences (codex context7 out-of-block
  → skip; Claude Code github `${GITHUB_MCP_TOKEN}` vs canonical `${GH_TOKEN}` → drift).
- 2026-08-02: **Stage 3 complete** — `core/deploy.ts` (pure, injectable-path
  functions) + `deploy` command. 86 tests (+21). Deviations (documented in the stage
  doc): positional `[source]` accepts a dir OR `.mcpb`/`.dxt` (mcpsync isn't run from
  the ext repo, unlike the imsg script's cwd default); injectable `unzip` + a
  single-wrapping-subdir `findManifest` fallback for archive layouts; deploy takes NO
  backup (it replaces regenerable build artifacts, not user config) but is gated
  behind the same dry-run + TTY/`--yes` confirm as host writes. Live read-only smoke:
  `--list` enumerated 8 installed extensions; `--dry-run` matched imsg by name and
  computed the plan; non-TTY without `--yes` refused a real matching target (mtime
  unchanged). `ensureConfirmed` gained an optional `refusal` message.
- 2026-08-02: **Stage 4 complete** — `tui` command + Ink servers×hosts grid. 99 tests
  (+13). tsconfig flipped `node.json` → `react.json`; added `react`/`ink`/
  `fullscreen-ink`/`@george43g/tui-kit` (+ `@types/react`), so `@george43g/robustness`
  is finally used (by `runTui`). Key decisions (documented in the stage doc): the grid
  model (`src/tui/model.ts` — `buildMatrix`/`statusTone`/`cellText`/`clampIndex`) is a
  pure, React-free seam reusing `diffHost`, so the TUI and CLI `list` can't diverge and
  it tests against the same stub adapters; the only disk I/O is `useHostMatrix`. Apply
  routes through the CLI's `applyServer` merge path, gated by an in-TUI y/n confirm
  (the confirm IS the `--yes` equivalent); host-only servers refuse to apply. Deferred:
  per-cell env/args editing + `useMouse`. Live: non-TTY guard refuses (exit 1); a PTY
  render smoke (read-only, only `q` sent) drew the full grid byte-identical to `list`
  and exited cleanly.
- 2026-08-02: **Stage 5 complete** — 0600 credentials vault + redacted secret scanner
  in `doctor` + `--scope project`. 128 tests (+29). New: `core/secrets.ts`,
  `core/secret-scan.ts`, `commands/secret.ts`. imsg-mcp source was gone, so the vault
  was ported from the contract recorded in this overview (0600/0700, unconditional
  `chmodSync`, read-never-throws). Key decisions (in the stage doc): the vault holds
  real values keyed by server name but is NEVER inlined — `${VAR}` stays verbatim
  (live-verified); it only moves secrets out of the shell env into a 0600 file and
  powers `doctor`'s reachability report. The scanner walks each adapter's `readRaw()`
  map (not per-file re-parsing like `status.js`), reusing the ported redaction guards.
  Added a `secret set|list|rm` command (values via stdin, never shell history) beyond
  the doc's three deliverables so the vault is usable + its 0600 path live-testable.
  `doctor --json` shape widened to `{hosts,secrets,resolution}`. `resolveOutputMode`
  used consistently (fixed a mixed-output bug: auto-JSON array + human sections when
  piped). Live (writes to a throwaway HOME/tmp repo, real `~` untouched): vault at
  `-rw-------`/dir `drwx------`; `doctor --json` = `{hosts:6,secrets:0,resolution:3}`
  (all `${VAR}` from env, no leaks); `--scope project` targeted the repo files with
  `${DEMO_TOKEN}` verbatim; `--to codex` under project scope refused (exit 1).
- 2026-08-02: **Post-build parity audit + adversarial review** (user-requested,
  full-code, against the real prior art — `~/dotfiles/mcp/*` and `~/repos/imsg-mcp`,
  which EXISTS; the Stage 5 "imsg is gone" note looked at `~/imsg-mcp`). 144 tests
  (+16). Headline: the codex secret scan only saw the managed block and missed the
  actual out-of-block context7 `--api-key` leak — `scanCodexText` (full-file) now
  catches it live. Also: doctor scans the canonical manifest + shows symlink chains +
  codex out-of-block servers + Desktop marker note; vault file created at 0600 (no
  transient window); `resolveServerEnv` (imsg merge-at-resolution — the vault was
  write-only before); order-insensitive claude env/header matching (churn fix);
  `spliceBlock` `$&`-substitution fix; corrupt-config writes refuse instead of
  silently discarding non-MCP keys; `--scope` fail-closed. Details + accepted-as-is
  list in the [Stage 5 doc](2026-08-mcpsync-5-secrets-and-project-scope.md) log.

- 2026-08-03: **Publish prep (user-authorized).** Decisions: mcpsync publishes as
  `@george43g/mcpsync` from this repo; the unpublished kits (cli-kit/tui-kit) are
  BUNDLED into its dist (moved to devDependencies — consumers never install them;
  PROJECT_STATE #9 "kits stay unpublished" holds); `@george43g/robustness` becomes a
  real `^0.1.1` npm dep; the kits' runtime deps (cli-table3, picocolors) become
  direct deps. Version 0.1.0 for the one-time manual bootstrap publish (trusted
  publishing needs the package to exist — robustness-0.1.0 pattern), then
  `release-packages.yml` (new `mcpsync` job, serialized `needs: robustness`, checks
  out `main` tip to avoid bump-commit races) takes over via OIDC. Types via
  `tsconfig.build.json` (declarations for the `index` + `core` graph only). Verified
  by a packed-tarball consumer smoke, which caught a REAL bug: the bin's
  `argv[1].endsWith("/dist/cli.js")` is-main gate fails through npm's
  `node_modules/.bin` SYMLINK — the installed bin exited 0 silently. Fixed with
  `import.meta.url === pathToFileURL(realpathSync(argv[1])).href` in mcpsync AND the
  golden template (canonical + 08-app lib mirror + example/ regen — same latent bug
  shipped to every generated repo). `--version` now reads package.json at runtime
  (meta.ts pattern) instead of a hardcoded string. Consumer smoke green: bin via
  symlink, doctor JSON, library import + types, non-TTY tui guard.

- 2026-08-03: **npm publish DEFERRED (user decision).** The package stays
  publish-ready (bundled kits, d.ts, pack:check, .releaserc all in place), but
  the `release-packages.yml` mcpsync job is gated to `workflow_dispatch` only
  and `apps/mcpsync/**` is removed from the workflow's push paths — merges no
  longer attempt a publish that would fail without the bootstrap. Interim
  install is the local global bin (`pnpm --filter @george43g/mcpsync build`,
  then `pnpm add -g .` from `apps/mcpsync`). To publish later: one-time manual
  `npm publish` of 0.1.0, add the npm trusted publisher, then dispatch the
  workflow (optionally re-enable the push trigger for automatic releases).

## Recovery

Branch `feat/mcpsync-tool`. If a stage's build is partial, its stage doc's Status
log records the last completed sub-step. Nothing here mutates real host configs
except explicit non-dry-run `apply`/`sync`/`deploy`; all writes are backed up.
