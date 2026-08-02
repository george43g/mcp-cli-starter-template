# ExecPlan: mcpsync Stage 5 — secrets store + project scope

Part of [mcpsync overview](2026-08-mcpsync-overview.md).

**Status:** `complete` (2026-08-02) — credentials vault (0600) + redacted secret
scanner in `doctor` + `--scope project`; 128 tests total (+29); live-verified on
this machine (real `~` untouched). See the Status log at the bottom.

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

## Discoveries (recorded during the build)

- **imsg-mcp source is gone** (`~/imsg-mcp` no longer exists). The overview's
  master plan had already captured its `app-config.ts` shape — vault at `0600`
  (dir `0700`), unconditional `chmodSync` after every write, read-never-throws,
  merge-at-resolution — so the port was from the recorded contract, not the file.
  Mode assertions live in `tests/secrets.test.ts` (write, then simulate drift with
  `chmodSync(…,0o644)`, re-write, assert `0600` again).
- **The scanner walks `readRaw()`, not files.** `~/dotfiles/mcp/status.js`
  re-parses each host config format by hand; here every adapter's `readRaw()`
  already returns a `name → native-server` map (JSON, opencode `{env:VAR}`, codex
  tables via the minimal TOML reader, `~/.claude.json`), so `core/secret-scan.ts`
  runs the ported guards (`SECRETY`, `SECRET_HINT`, `SECRET_FLAG`, the
  env-var-name exclusions for codex `bearer_token_env_var`/`env_vars`) over those
  maps. One read path for both sync and scan; the redaction guards ported verbatim.
- **cli-kit auto-selects JSON when piped/CI**, so `doctor` must resolve the mode
  once with `resolveOutputMode({ json })` and emit ONE object — the first cut
  branched on the raw `--json` flag and, when piped, printed `printAuto`'s JSON
  array followed by the human secret/resolution sections (mixed garbage). Fixed;
  `secret list` uses the same resolution.
- **`exactOptionalPropertyTypes`:** `resolveOutputMode({ json: opts.json })` fails
  when `opts.json` is `boolean | undefined` (the flag is `json?: boolean`, which
  rejects an explicit `undefined`); coerce with `?? false`.
- **Project scope needs cwd-bound adapters.** Host `configPath`s are baked into the
  factory closure and can't be rebound, so `projectHosts(cwd)` constructs fresh
  cursor/warp adapters at `<cwd>/.cursor/mcp.json` + `<cwd>/.warp/.mcp.json` (the
  two `capabilities.project` hosts), returned UNFILTERED by `detect()` so a fresh
  repo can have the files created.

## Decisions

- **Vault is opt-in and never inlined.** `~/.mcpsync/credentials.json` (0600) holds
  real values keyed by server name, but mcpsync NEVER writes a resolved value into
  a host config — `${VAR}` stays verbatim everywhere (live-verified: a project
  apply of `env.TOK = "${DEMO_TOKEN}"` writes `${DEMO_TOKEN}`, not the value). The
  vault's only jobs are (a) getting a secret out of the shell env into a 0600 file
  and (b) powering `doctor`'s reachability report. Default without it is `${VAR}`
  indirection resolved from the shell env.
- **Added a `secret set|list|rm` command** (beyond the doc's original three
  deliverables) so the vault is usable and its 0600 write path is live-testable.
  `set` reads the value from stdin by default (never shell history / process
  table); `--value` is the explicit history-leaking escape hatch. `list` shows
  server + KEY names only, never values.
- **`doctor` gained two read-only sections:** a redacted plaintext-secret scan over
  detected hosts, and a `${VAR}` reachability report (per referenced var: `from
  credentials` / `from env` / `UNRESOLVED`). `--json` returns one
  `{ hosts, secrets, resolution }` object (a richer shape than Stage 1's host
  array — noted; nothing depended on the old shape).
- **`--scope project`** on `apply`/`sync`: canonical source becomes `<cwd>/.mcp.json`
  (unless `-c` overrides), targets are cursor+warp bound to the repo. A non-project
  `--to` (codex/Claude Code/Desktop/opencode) refuses with a scope-aware message
  (exit 1) rather than silently doing nothing — codex has no per-project MCP mechanism.

## Validation

- **vitest (+29, 128 total):** `secrets.test.ts` (file `0600` + dir `0700`;
  unconditional re-chmod after drift; read-never-throws on missing/garbage;
  set/remove merge; `referencedVars`; `resolveRef` credentials>env>unresolved).
  `secret-scan.test.ts` (`looksSecret` flags known shapes + long hinted values;
  does NOT flag `${VAR}`/`{env:VAR}`/SCREAMING_SNAKE names/codex env-var-name
  fields; `scanHostSecrets` reports location but never the value). `scope.test.ts`
  (`projectHosts` cwd binding, never a home path; `resolveTargets` scope matrix;
  a project write lands under the tmp repo with `${VAR}` verbatim).
- lint + typecheck + build + test all green (`pnpm --filter @george43g/mcpsync`);
  repo `check:docs` passes (38 files).
- **Live (real machine, `~` untouched — writes went to a throwaway `HOME`/tmp repo):**
  `doctor --json` → `{ hosts:6, secrets:0, resolution:3 }` (all `${VAR}` resolve
  from `env`; 0 inlined secrets — the user is all-`${VAR}`; no value leaked).
  `secret set` (value piped in) → file `-rw-------`, dir `drwx------`; `secret list`
  shows only KEY names; `secret rm` empties the vault. `apply --scope project
  --dry-run` targets `<repo>/.cursor/mcp.json` + `<repo>/.warp/.mcp.json` and wrote
  nothing; `--to codex` under project scope refused (exit 1); a real project apply
  created the repo files with `${DEMO_TOKEN}` preserved verbatim.

## Recovery / Status log

- 2026-08-02 (later): **Post-build parity audit + adversarial review** (all five
  stages, against the actual prior-art sources — `~/dotfiles/mcp/*` AND
  `~/repos/imsg-mcp` (the imsg repo exists; the earlier "gone" claim looked at the
  wrong path). 7 fixes + 5 absorptions, 144 tests total (+16):
  - **Codex secret scan covered only the managed block** — the real-world context7
    `--api-key` leak lives in a table OUTSIDE it. Added `scanCodexText` (full-file,
    ported from status.js) routed via `scanHostsForSecrets`; live doctor now flags
    `codex:context7: literal secret in args.3 (after --api-key) (redacted)` on this
    machine — the exact leak the previous scan missed.
  - doctor now also scans the canonical manifest, shows symlinked config chains
    (cursor/warp → dotfiles), lists codex out-of-block servers, and notes a missing
    Desktop marker (status.js parity). JSON report gained `notes` + per-host `link`.
  - `writeCredentials`: file CREATED at mode 0600 (no transient world-readable
    window) + tolerant dir chmod — both imsg app-config behaviours.
  - `resolveServerEnv(server, creds?, env?)`: imsg's merge-at-resolution actually
    absorbed — materializes a launch env vault-first, in memory only. Previously the
    vault was write-only (nothing could ever use a stored value).
  - `claudeMatches`: env/headers compare made order-insensitive (sync.sh compared
    Python dicts; stringify compare ⇒ perpetual false drift + remove/re-add churn).
  - `spliceBlock`: replacement function so `$&`/`$$` in server args can't corrupt
    the TOML (String.replace GetSubstitution; render.js has the same latent bug).
  - Corrupt-config writes now REFUSE (`readRawJsonStrict` in writeCanonical +
    json/opencode adapters) instead of silently rebuilding from `{}` and discarding
    non-MCP keys. Reads stay lenient (drift grid never crashes).
  - `--scope` fail-closed: an invalid value exits 2 instead of coercing to user
    scope (which would mutate `~` configs the user was avoiding).
  - TUI env vars validated (unknown theme/malformed accent → defaults, imsg parity).
  - Reviewed-and-accepted as-is (documented): claude-code scan is mcpServers-only
    (whole-file would false-positive on the CLI's own OAuth state); a string mixing
    `${VAR}` + a literal secret is skipped (status.js-equal); desktop import stays
    lossy (wrapper); grid shows codex out-of-block servers only via doctor notes.
- 2026-08-02: **Stage 5 built + verified.** New files: `src/core/secrets.ts`,
  `src/core/secret-scan.ts`, `src/commands/secret.ts`,
  `tests/{secrets,secret-scan,scope}.test.ts`. Edits: `src/commands/doctor.ts`
  (secret scan + reachability, mode-resolved output), `apply.ts`/`sync.ts`
  (`--scope`), `write-hosts.ts` (`resolveTargets(to, scope, cwd)`),
  `core/hosts/index.ts` (`projectHosts`, `PROJECT_HOST_IDS`), `cli.ts`
  (`secret` group + `--scope` + doctor config), `index.ts` (exports). No changes
  to the adapter contract or any Stage 1–4 host behavior. **All five stages now
  built + verified.** Deferred (unchanged, not build tasks): retire
  `~/dotfiles/mcp/{render,status,sync}` once mcpsync is trusted; update
  `mcp-registry.md`; in-TUI env/args editing + `useMouse`.
