# ExecPlan: mcpsync Stage 1 — skeleton + canonical core + file hosts

Part of [mcpsync overview](2026-08-mcpsync-overview.md) (read it first for the
Locked Contract, prior-art sources, and safety invariants).

**Status:** `active` (2026-08-01).

## Goal

A working `mcpsync` that syncs the three file-merge hosts (Claude Desktop, Cursor,
Warp) at full `~/dotfiles/mcp` fidelity, with the canonical contract locked and
unit-tested. This slice already subsumes the "register mcpServers" hot-reload need.

## Deliverables

- `apps/mcpsync/` skeleton modeled on `apps/example-repo-mcp`: `package.json`
  (`@george43g/mcpsync`, `private:true`, `bin: { mcpsync }`, deps `@george43g/
  {cli-kit,tui-kit,robustness}` `workspace:*`, `commander`, `zod`; devDeps
  `tsconfig`/`vitest-config`/`biome-config`, `vite`, `tsx`, `@types/node`,
  `typescript`), `tsconfig.json`, `vite.config.ts` (library → `dist/cli.js` +
  `dist/index.js`), `vitest.config.ts`, `README.md`. Baseline via `pnpm init`.
- `src/core/schema.ts` — Zod `McpServer` (Locked Contract) + `CanonicalConfig`.
- `src/core/canonical.ts` — `readCanonical`/`writeCanonical` (`~/.mcp.json`),
  `normalize()`.
- `src/core/backup.ts` — `backup(path)` → `.bak.<epoch>` (generalized; used by all
  file adapters).
- `src/core/hosts/index.ts` — `HostAdapter` interface + `HOSTS` registry.
- `src/core/hosts/json-adapter.ts` — the three file hosts:
  - **Claude Desktop**: `toNative` wraps stdio in `$SHELL -lc '…'` (POSIX-quoted so
    `${VAR}` expands at launch) and bridges http via `npx -y mcp-remote <url>
    --header "k: v"`; write merges into `mcpServers`, maintains
    `_mcpManagedByDotfiles`, backs up first.
  - **Cursor** (`~/.cursor/mcp.json`) and **Warp** (`~/.warp/.mcp.json`): direct
    `mcpServers` merge, symlink-aware (resolve + surface the real target).
- `src/cli.ts` — commander entry (global `--json`/`-q`/`--no-color`/`--dry-run`);
  commands `doctor`, `list`, `import --from <host>`, `apply [--to host|all]
  [--only a,b] [--dry-run]`.
- `src/index.ts` — exports `applyServer`, `HOSTS`, `readCanonical`, schema.

## Discoveries (fill in as you port)

- Port desktop `$SHELL -lc` wrapping + `shdq()` POSIX quoting + `mcp-remote` bridge
  verbatim from `~/dotfiles/mcp/render.js`.
- Port key-preserving `readJson`/`writeJson` + symlink handling
  (`lstatSync`/`realpathSync`) from `imsg-mcp/scripts/mcpsync.mjs`.
- (record any format surprises here)

## Decisions

- File adapters take an injectable `configPath` (default = real host path) so tests
  point at tmp fixtures. Adapters never read `~` directly in tests.
- `apply` is dry-run by default? No — dry-run is opt-in via `--dry-run`, but `apply`
  prints a diff and (for a TTY) confirms before writing; `--yes` to skip. Non-TTY
  without `--yes` refuses to mutate. (Confirm final ergonomics during build.)

## Validation

- `pnpm --filter @george43g/mcpsync {build,typecheck,test}` green.
- vitest (tmp fixtures): desktop merge preserves other keys + `_mcpManagedByDotfiles`;
  backup created; `normalize()` round-trips; `$SHELL -lc` wrapping matches expected;
  cursor/warp merge preserves siblings.
- Live on this machine (no mutations): `mcpsync doctor`, `mcpsync list`, `mcpsync
  apply --to claude-desktop --dry-run` — diff/output matches `~/dotfiles/mcp` render.
- Root `pnpm lint`; confirm golden test + example sync unaffected.

## Recovery

If partial: the Status log below records the last completed file. Nothing mutates
real configs unless a non-dry-run `apply` was run (backed up). Re-run build+test to
re-establish the baseline.

## Refined design (worked out by the Stage 1 build agent, 2026-08-01 — follow this)

No source files were written (only empty dirs, untracked). These decisions are
ready to implement:

**Env/toolchain:** `packages/{cli-kit,robustness}/dist` already exist ⇒ typecheck
resolves without a prior build. `tsconfig` base has `verbatimModuleSyntax` (use
`import type`), `exactOptionalPropertyTypes` (never assign `undefined` to optional
props — use conditional key assignment/spreads), `noUncheckedIndexedAccess`, NodeNext
(`.js` extensions on relative imports). vitest: `import shared from
"@george43g/vitest-config/vitest.shared"; export default shared;`. vite.config = copy
example-repo-mcp exactly (entries `index`+`cli`, externals builtins+`/^@george43g\//`+
`commander`+`zod`, banner shebang on `cli` only). cli-kit values: `color`,
`disableColors`, `printAuto`, `printTable<T>(items,{head:string[],rows:(i)=>(string|number)[]})`,
`printJson`, `resolveOutputMode({json?})` (→"json" when --json/non-TTY/CI), `isInteractive`.

- **schema.ts**: `McpServerEntrySchema` (transport default "stdio"; command/args/env/url/
  headers/cwd optional; enabled default true; scope default "user"); `McpServerSchema =
  entry.extend({name})`; `CanonicalConfigSchema = {mcpServers: z.record(entry).default({})}`.
- **normalize(hostShape,name)**: conditional key assignment (no undefined) then parse.
  Transport: explicit `transport`, else `type==="sse"`→sse, else `type==="http"||url`→http,
  else stdio. env falls back to `environment`.
- **canonical.ts**: `readRawJson` (zero-throw→`{}`), `readCanonical()`, `writeCanonical(servers,
  path,{dryRun}):{backup,changed}` — **backup before overwrite**, key-preserving; a
  `toCanonicalEntry()` that STRIPS defaults (stdio/enabled=true/user) + empties so canonical
  stays `${VAR}`-clean and round-trips.
- **shell-quote.ts**: `shdq(s:string)` verbatim (`"${String(s).replace(/([\\"`])/g,"\\$1")}"`),
  `$` left active, "controlled manifest values only" comment.
- **json-adapter.ts** factory `jsonMcpServersAdapter({id,label,configPath,restart,transform,
  marker?,capabilities})`. **`prune` is the key safety lever:** `write(servers,{dryRun?,prune?})`
  — default `prune:false` = safe MERGE (add/update, never delete; marker = union(prev,names));
  `prune:true` = full-sync = render.js `renderClaudeDesktop` (delete prev-marked-now-absent;
  marker = names). Non-marker hosts never delete on write. `applyServer` + `apply --only` use
  `prune:false`; full `apply` (no `--only`) uses `prune:true`. `changed` via stringify
  before/after; backup+write only when changed & !dryRun. Symlink-aware (`lstatSync`/
  `realpathSync`→`linkTarget` set conditionally); write-through is automatic.
- **transforms**: `toClaudeDesktopServer` verbatim ($SHELL -lc + `exec` + shdq tokens; env
  `K=shdq(v)` prefix; http→`exec npx -y mcp-remote <url> --header "k: v"`); `loginShell()`
  helper reads `process.env.SHELL||"/bin/zsh"` at CALL time (deviation from render.js
  load-time const, for testability). `toDirectNative` (cursor/warp): stdio→`{command,args,env?}`,
  http/sse→`{type,url,headers?}`, `${VAR}` verbatim.
- **hosts/index.ts**: 3 adapters (claude-desktop `marker:"_mcpManagedByDotfiles"` +
  toClaudeDesktopServer; cursor `~/.cursor/mcp.json`; warp `~/.warp/.mcp.json` — both
  toDirectNative). Export `HOSTS`, `hostList()`, `detectedHosts()` (`.detect()` = configPath
  or parent dir exists).
- **commands**: doctor (printAuto table: host/detected/validity/restart); list (native-level
  drift: `host.toNative(canonical[name])` vs `host.readRaw()[name]`; cells `·`/`✓`/`drift`/
  `extra`/`off`; `--json`); import `--from` (merge→writeCanonical; NOTE: import from
  claude-desktop is lossy — $SHELL-wrapped — document, matches imsg); apply
  `--to`/`--only`/`--dry-run`/`--yes` (dry-run prints plan; non-dry-run + !isInteractive +
  !--yes → refuse+print+exit1; interactive → readline y/N).
- **index.ts** exports: schema, readCanonical/writeCanonical/normalize, backup, shdq,
  HOSTS/hostList/detectedHosts, factory+transforms, types, `applyServer(hostId,server,
  {dryRun}?)` (hostId "all"→detectedHosts; always `prune:false`; returns Record<hostId,WriteResult>).
- **cli.ts**: mirror example-repo-mcp; name `mcpsync`; global `--json`/`-q`/`-v`/`--no-color`/
  `-c,--config <path>`; preAction `disableColors()` when `--no-color`.

**Deviations to note:** `detectedHosts()` (not literal `detect()` module helper); `prune`
option (safe-merge default protects `applyServer`/`--only` from deleting desktop siblings;
full `apply` gets exact render.js semantics via `prune:true`); `loginShell()` call-time read;
`import --from claude-desktop` lossy; `@george43g/robustness` dep declared but unused until
later stages.

## Status log

- 2026-08-01: stage opened; design fully worked out (above); NO files written (empty dirs
  only). Session paused. Resume = implement the refined design + verify + commit.
