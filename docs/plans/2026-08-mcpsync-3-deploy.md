# ExecPlan: mcpsync Stage 3 — generalized extension deploy

Part of [mcpsync overview](2026-08-mcpsync-overview.md).

**Status:** `pending`.

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

## Discoveries

- macOS Claude Extensions path is the primary target; Linux/Windows flagged
  best-effort (record actual paths if verified).

## Decisions

- `deploy` is a file-replace (rm+cp), so gate behind `--dry-run` default preview +
  confirm; `--list` is read-only.

## Validation

- vitest: dry-run computes the correct sync set against a fixture extension dir;
  `--from` unzip path; `--list` enumerates.
- Live `mcpsync deploy <ext> --dry-run` and `--list` (no mutations).

## Recovery / Status log

- (pending)
