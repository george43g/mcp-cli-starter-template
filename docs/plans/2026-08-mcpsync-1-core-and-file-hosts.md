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

## Status log

- 2026-08-01: stage opened.
