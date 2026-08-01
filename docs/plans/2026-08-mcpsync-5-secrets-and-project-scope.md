# ExecPlan: mcpsync Stage 5 — secrets store + project scope

Part of [mcpsync overview](2026-08-mcpsync-overview.md).

**Status:** `pending`.

## Goal

Stop leaking API keys into world-readable configs, and support per-repo configs.

## Deliverables

- `src/core/secrets.ts` — optional `~/.mcpsync/credentials.json` at `0600` (dir
  `0700`), keyed by server name; unconditional `chmodSync` after write; read never
  throws; keys merged in at apply time, never persisted into host configs. `${VAR}`
  strings preserved verbatim (the encouraged indirection). Port from
  `imsg-mcp/src/app-config.ts`.
- `doctor` — warn on inlined plaintext secret-looking values in host configs (the
  user already has these in Cursor/Codex); port the scanner from
  `~/dotfiles/mcp/status.js`.
- `--scope project` — target repo `.mcp.json` (canonical) + `.cursor/mcp.json` +
  `.warp/.mcp.json`, matching the dotfiles per-repo model. Codex has no per-project
  MCP mechanism → skip+warn.

## Discoveries

- (record `credentials.json` mode assertions; per-repo symlink chains observed.)

## Decisions

- Secrets store is opt-in; without it, `${VAR}` indirection is the default and keys
  live in the shell env, not any file.

## Validation

- vitest: credentials file asserted `0600`; secret-scanner flags a fixture with an
  inlined key; project-scope `apply` writes repo files, not `~`.
- Live: `mcpsync doctor` flags the known plaintext keys; `--scope project` dry-run
  targets the repo files.

## Recovery / Status log

- (pending)
