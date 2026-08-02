# ExecPlan: mcpsync Stage 2 — CLI hosts + opencode + sync/add/remove

Part of [mcpsync overview](2026-08-mcpsync-overview.md).

**Status:** `complete` (2026-08-02) — all six hosts covered; byte-parity proven
for codex + opencode against render.js. See the Status log at the bottom.

## Goal

All 6 hosts covered, plus full reconcile (`sync`) and canonical edits
(`add`/`remove`).

## Deliverables

- `src/core/hosts/cli-adapter.ts` — **Claude Code** + **Codex** via official
  `mcp add`/`mcp remove` (shell out; `execa` or `node:child_process`). Read fidelity
  by parsing the source of truth directly, NOT `mcp list` (the imsg prototype's
  `mcp list` heuristic picked up noise tokens): Claude Code ← `~/.claude.json`
  top-level `mcpServers`; Codex ← `~/.codex/config.toml` managed-block.
  - Codex writes preserve the `# >>> dotfiles-mcp` / `# <<< dotfiles-mcp` block and
    skip servers defined outside it; remote→`url`+`bearer_token_env_var` (only for
    `Bearer ${VAR}`); stdio env passthrough `env_vars=[K]` only when value is `${K}`;
    other headers/literals emit a NOTE.
- `src/core/hosts/opencode.ts` — outlier shape: `mcp` key, `type:"local"|"remote"`,
  `command:[cmd,...args]`, `environment` (not `env`), `enabled:true`,
  `${VAR}`→`{env:VAR}`; overwrite the `mcp` key, preserve other top-level keys.
- `src/core/toml.ts` — minimal TOML reader for the Codex managed-block (hand-rolled;
  zero-dep, matching how `render.js` hand-emits TOML).
- `src/core/diff.ts` — drift computation (canonical vs each host's `read()`).
- Commands: `sync` (diff across all hosts + confirm), `add <name> …`,
  `remove <name>`.

## Discoveries (recorded during the build)

- **Codex is a FILE writer, not `codex mcp add`.** The Stage-2 doc originally said
  "Codex via official mcp add", but writing through the CLI lands outside the
  dotfiles `# >>> dotfiles-mcp` block (risking duplicate, invalid TOML tables) and
  diverges from render.js. Codex is implemented as a managed-block file writer
  ported from render.js — byte-parity confirmed. Deviation, documented here.
- **`matches` became a host-level method.** Drift equality is host-specific
  (byte compare for file hosts, lenient field compare for CLI hosts, table compare
  for codex), so `HostAdapter` gained `matches(canon, raw)` and an optional
  `willSkip(name)` (codex out-of-block). `diff.ts` consumes both; `list` was
  refactored onto `diffHost`. `WriteResult` gained `skipped` + `commands`.
- opencode read/write reverse `${VAR}`↔`{env:VAR}` and use a `command[]` array;
  key order matches render.js so the byte compare in `matches` is stable.
- Claude Code flag syntax (from sync.sh): `claude mcp add --scope user [-e K=V] --
  cmd args` and `--transport <t> <name> <url> --header "K: V"`; remove is
  `claude mcp remove -s user <name>`. Read fidelity from `~/.claude.json`
  top-level `mcpServers` (user scope), never `mcp list`.
- **Live drift caught two real machine divergences** (both correct, not bugs):
  codex `context7` is defined outside the managed block → `skip`; Claude Code
  `github` references `${GITHUB_MCP_TOKEN}` while canonical uses `${GH_TOKEN}` →
  `drift`. mcpsync flags both correctly.

## Decisions

- CLI-host writes take no backup (the official CLI owns the file). Codex file
  writes ARE backed up (generalized-backup invariant, an improvement on render.js
  which only backed up Desktop). `sync` = a drift-plan preamble + a full-reconcile
  (`prune`) apply; `apply --only` / `applyServer` stay merge-only.

## Validation

- vitest: 37 new tests (65 total) — TOML block parse/splice, codex
  passthrough/bearer/round-trip + out-of-block skip + merge/prune, Claude Code
  argv + lenient matches + dry-run reconcile plan (executes nothing), opencode
  round-trip + key preservation, diff statuses, add/remove.
- typecheck + build + biome green; root `pnpm lint` (257 files), `check:docs`, and
  131 scaffolder tests unaffected.
- **Live parity (read-only / temp copies, no real mutation):** codex managed-block
  tables and opencode entries **byte-match `~/dotfiles/mcp/render.js`**; `doctor`
  lists 6 hosts; `list`/`sync --dry-run` render the full grid; `sync` non-TTY
  without `--yes` refuses; Cursor/Warp writes surface the dotfiles symlink target;
  no `.bak.*` created on any real config.

## Recovery / Status log

- 2026-08-02: **Stage 2 built + verified.** New files: `core/toml.ts`,
  `core/diff.ts`, `core/hosts/{codex-adapter,cli-adapter,opencode-adapter}.ts`,
  `commands/{sync,add,remove,write-hosts}.ts`; edits to `types.ts` (+`matches`/
  `willSkip`/`skipped`/`commands`), `json-adapter.ts` (+`matches`), `hosts/index.ts`
  (register 3 hosts), `list.ts` (→`diffHost`), `apply.ts` (→shared `write-hosts`),
  `cli.ts`/`index.ts`. All six hosts live. Next: **Stage 3** — generalized
  extension `deploy` (from imsg `hot-deploy-ext`).
