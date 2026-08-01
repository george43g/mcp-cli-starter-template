# ExecPlan: mcpsync Stage 3 — generalized extension deploy

Part of [mcpsync overview](2026-08-mcpsync-overview.md).

**Status:** `complete` (2026-08-02) — `core/deploy.ts` + `deploy` command; 86 tests
total (+21); live read-only smoke verified. See the Status log at the bottom.

## Goal

Deploy/redeploy any built MCP extension into Claude Desktop — the generalized form
of `imsg-mcp/scripts/hot-deploy-ext.mjs` (not imsg-specific).

## Deliverables

- `src/core/deploy.ts` — locate `~/Library/Application Support/Claude/Claude
  Extensions`; enumerate installed (`manifest.json` per subdir); match target by
  `manifest.name` or `--ext-id`; resolve source (a built dir with `manifest.json` +
  `dist/`, or `--from <archive>` unzipped to a `mkdtempSync` temp via
  `execFileSync("unzip")`); sync items `[dist, native, manifest.json, icon.png,
  assets]` (+ `node_modules` with `--full`) via `rmSync`+`cpSync`; print reload
  reminder (toggle off/on or Quit+reopen).
- Command `deploy <src-dir|.mcpb> [--ext-id] [--from <archive>] [--full] [--list]
  [--dry-run]`.

## Discoveries (recorded during the build)

- **Positional `[source]` accepts a dir OR an archive.** The imsg script defaulted
  its source to `process.cwd()` (it ran from inside the ext repo). mcpsync doesn't,
  so the source is an explicit positional that may be a built dir or a `.mcpb`/`.dxt`.
  `--from <archive>` remains as an alias for the archive case; `resolveSource` treats
  a path as an archive when its extension is `.mcpb`/`.dxt`/`.zip` OR it is a plain
  file, and uses a directory in place.
- **`findManifest` descends one wrapping subdir.** `.mcpb`/`.dxt` archives usually
  hold the manifest at the root, but some wrap everything in a single top-level
  folder; if the root has no `manifest.json` and exactly one subdir, we descend.
- **`unzip` is injectable.** `resolveSource` takes an optional `unzip(archive, dest)`
  so the archive branch is unit-tested hermetically (a fake extractor copies a
  fixture) without shelling out to real zip tooling; the default uses
  `execFileSync("unzip", …)`.
- macOS Claude Extensions path is the primary target; Linux/Windows deferred
  (`defaultExtRoot` is macOS-only). A non-macOS host fails gracefully — the command
  errors "Claude Extensions dir not found" rather than mutating anything.

## Decisions

- `deploy` is a file-replace (rm+cp) of **regenerable build artifacts**, not user
  config, so — unlike host-config writes — it takes **no `.bak.*`** (the generalized
  backup invariant is about config files; a stale build is recoverable by re-deploy /
  GUI reinstall). It is still gated behind the same safety as host writes: a plan
  preview, `--dry-run` for no-write, and a TTY/`--yes` confirm (a non-TTY without
  `--yes` refuses). `--list` is read-only.
- `core/deploy.ts` is pure functions with **injectable paths** (`extRoot`, source,
  `unzip`), matching the adapter convention, so every test runs on tmp fixtures and
  never touches the real `~/Library`. `runDeploy` accepts a hidden `extRoot` for the
  same reason. `ensureConfirmed` gained an optional `refusal` message so the non-TTY
  wording fits a non-host-config mutation.

## Validation

- vitest (21 new, 86 total): `installedExtensions` (skips no-/broken-manifest dirs),
  `matchTarget` (ext-id precedence, name fallback, miss), `findManifest` (root +
  single-subdir descend + none), `isArchive`, `resolveSource` (dir in place; injected
  unzip → temp + cleanup; missing-path throw), `planDeploy` (present-items-in-order,
  `--full` node_modules), `executeDeploy` (rm-before-cp clears stale files), and
  `runDeploy` (missing root → exit 1; dry-run writes nothing; `--yes` replaces items;
  unmatched name → exit 1, no write; manifest-but-no-`dist/` → exit 1).
- typecheck + build + biome green; 86/86 mcpsync tests pass.
- **Live (read-only, no mutation):** `deploy --list` enumerated 8 installed
  extensions; `deploy <imsg-ext> --dry-run` matched by name and planned
  `[dist, native, manifest.json, icon.png]` (`assets` correctly omitted — imsg has
  none); `--full` added `node_modules`; an unmatched source name errored with the
  installed list + hint; a real matching target with no `--yes`/`--dry-run` in a
  non-TTY **refused** (manifest mtime unchanged, no `.bak.*` created).

## Recovery / Status log

- 2026-08-02: **Stage 3 built + verified.** New files: `core/deploy.ts`,
  `commands/deploy.ts`, `tests/deploy.test.ts`; edits to `cli.ts` (wire `deploy`),
  `index.ts` (export the deploy core), `commands/write-hosts.ts` (`ensureConfirmed`
  `refusal` param). No changes to the adapter contract or any other host. Next:
  **Stage 4** — Ink TUI (see the overview handoff for the tsconfig/react switch).
