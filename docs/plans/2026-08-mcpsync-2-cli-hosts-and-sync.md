# ExecPlan: mcpsync Stage 2 — CLI hosts + opencode + sync/add/remove

Part of [mcpsync overview](2026-08-mcpsync-overview.md).

**Status:** `pending`.

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

## Discoveries

- (record TOML parsing edge cases, opencode schema confirmations, CLI flag syntax:
  `claude mcp add [-e K=V] -- cmd args` / `--transport http <n> <url>`;
  `codex mcp add [--env K=V] -- cmd args` / `--url <url>`.)

## Decisions

- CLI-host writes take no backup (the official CLI owns the file). `matches()` on
  drift compares url/type/headers or command/args/env (port from `sync.sh`).

## Validation

- vitest: CLI command-string construction; Codex managed-block round-trip preserves
  out-of-block content; opencode round-trip.
- Live `mcpsync sync --dry-run` across all 6 hosts; output parity with
  `~/dotfiles/mcp` (`make mcp-render` / `status.js`).

## Recovery / Status log

- (pending)
