# Deferred Work

Items intentionally not done in the current shipping series. Each has a "trigger" — the signal that says "now is the time to action this."

---

## Resolved this round (no action needed)

- **Npm scope rename** — user decided to keep `@george43g`. Personal username is the publishing identity. Closed; not a deferred item anymore.
- **`{{name}}` placeholder syntax** — migrated to `example-repo` / `EXAMPLE_REPO`. Filesystem-safe, no tera/handlebars collisions, no usage(1) identifier corruption. Done.
- **Root `mise.toml` tera collision** — auto-resolved by the placeholder migration (mise no longer sees `{{name}}` to fail-parse). `mise tasks` from repo root works cleanly. Done.

---

## 1. Scaffolder's own usage(1) freshness gate in CI

**Status**: missing — only the SCAFFOLDED output has a gate.

**Why deferred**: the scaffolded output's freshness gate (`apps/example-repo-mcp/scripts/check-usage-freshness.mjs` + the CI step that runs it) is the user-facing value. The scaffolder repo itself uses `usage` via `mise run completions` from `apps/scaffolder/mise.toml` but ships its checked-in artifacts at `completions/scaffolder/` + `docs/scaffolder-cli/` + `man/mcp-scaffold.1` without a CI gate.

**Trigger to action**: if drift between `apps/scaffolder/.usage.kdl` and the checked-in scaffolder completions lands on `main` (would mean someone edited the spec without regen — visible in PR review for now).

**Cost**: ~30 minutes. Copy the cloned-tool's `check-usage-freshness.mjs` pattern into `apps/scaffolder/scripts/`, point it at `apps/scaffolder/.usage.kdl`, wire into `.github/workflows/ci.yml` before the lint step.

---

## 2. `mise trust` friction on first-run

**Status**: known UX rough edge.

**Why**: mise's security model requires the user to `mise trust` any `mise.toml` it hasn't seen before. After `mcp-scaffold init`, the user has to run `mise trust .` in the scaffolded directory before `pnpm artifacts` / `pnpm completions` will work. The error message mise prints is clear enough but adds friction.

**Trigger to action**: when first-time users report being confused by the mise trust prompt.

**Cost**: ~15 minutes.

**Fix options**:
- A. Document the `mise trust .` step prominently in the README's first-run section + add to `mcp-scaffold init`'s closing message.
- B. Have `mcp-scaffold init` run `mise trust <target>/mise.toml` + `mise trust <target>/apps/<name>-mcp/mise.toml` automatically at scaffold time. Requires mise binary on the scaffolder's machine, which it usually has if the dev is iterating on the template.
- C. Set `MISE_TRUSTED_CONFIG_PATHS` env var in the scaffolded `.env.example` with a comment explaining the security trade-off. Less invasive than auto-trust.

Recommended: A (just document it). The trust prompt IS the right UX for security-conscious users; documenting the answer is enough.

---

## 3. MCPB bundle size optimization

**Status**: works, but produces ~52 MB artifacts.

**Why**: `scripts/build-mcpb.mjs` currently copies the entire `node_modules/` tree into the bundle. That includes dev-dependencies (typescript, vitest, vite, etc.) that the runtime doesn't need.

**Trigger to action**: when the bundle size matters (someone tries to ship via npm tarball + the 50MB+ size becomes a friction point).

**Cost**: ~1-2 hours. Options:
- A. Add a `pnpm install --omit=dev --prefix <stage>` step before zipping. Requires the user to have pnpm on the build machine. Probably the cleanest.
- B. Switch Vite to bundle dependencies inline (drop them from `external`), producing a self-contained `dist/index.js`. Trade-off: harder to debug, no shared workspace versions.
- C. Walk node_modules with a denylist of dev-only packages. Brittle.

---

## 4. Stress harness JSON-report artifact upload

**Status**: stress runs locally + in CI but doesn't upload a report artifact for non-default cases.

**Why deferred**: the existing CI step `actions/upload-artifact` already grabs `apps/**/stress-*-report.json` — but the harness doesn't currently emit JSON, only a console table. The plan in `glowing-percolating-key.md` (originating imsg-mcp research) had this as a "Phase 3 deferred" item.

**Trigger to action**: when a stress regression is hard to diagnose from CI logs alone (e.g. timing-sensitive HTTP case fails on macOS only).

**Cost**: ~1 hour. Add a `--json` flag to `stress-mcp.ts` that emits `{ case, pass, durationMs, detail }[]` to `stress-mcp-report.json`. Update CI to always pass `--json`.

---

## 5. Semantic / vector search demo for the Resources kit

**Status**: not started.

**Why deferred**: the MCP Resources demo (`apps/example-repo-mcp/src/resources/registry.ts`) currently exposes `health://` + `logs://recent/{n}`. Adding a `search://embeddings/{query}` example would show a richer pattern (vector index + pluggable embedding model), but it's bespoke and probably belongs in a separate "advanced patterns" doc.

**Trigger to action**: when someone asks "how do I expose search results as MCP Resources?" or when we have a real-world MCP using the kit for semantic search.

**Cost**: ~1 day. Pick a tiny embedding lib (e.g. `@xenova/transformers` for browser-portable models), wire a demo with a sample corpus.

---

## 6. `example/biome.json` strip is a small divergence from "faithful scaffolded output"

**Status**: known compromise.

**Why**: the committed `example/` reference is byte-equal to what `mcp-scaffold init` produces, with TWO exceptions: `example/biome.json` is stripped post-regen (biome 2.x discovers nested biome.json as a competing root and errors), and the `.git/` directory isn't committed (m3-git-init creates one in fresh dirs but skips inside the parent repo). The CI diff step mirrors both strips on the tempdir side before comparison.

**Trigger to action**: if biome adds a `"root": false` config field or a `.biomeignore` mechanism that lets the parent suppress nested-root discovery without modifying the nested file.

**Cost**: ~15 minutes when the upstream fix lands. Drop the `rm -f example/biome.json` from `regen:example` and the matching strip from CI; remove the diff-side `.git` strip if biome can also stop walking into it.

---

## 7. Two-branch `main` + `experimental` SOP

**Status**: declined per spec locked decision #10.

**Why**: the user explicitly chose single-`main` to keep the operational surface small. Don't reintroduce without an explicit reason.

---

## 8. Apple Keychain integration for `packages/secrets/`

**Status**: declined per spec locked decision #5.

**Why**: the secrets chain (`env-json → 1Password → file`) covers macOS, Linux, CI, and Docker uniformly. Keychain would only help macOS dev loops, and the 1Password CLI handles that already with better cross-machine sync.

---

## 9. mcpsync — TUI env/args editing

**Status**: not built. The TUI (`apps/mcpsync/src/tui/App.tsx`) applies servers to hosts
but can't edit a server's `env`/`args` in place.

**Why deferred**: `packages/tui-kit` has no text-input primitive (only `useVimKeys` /
`useMouse` / `StatusBar` / `HelpBar`), so this needs a new ink text-edit surface plus a
canonical `.mcp.json` write-back path — a real feature, not a quick win.

**Trigger to action**: when editing servers from the grid (vs. `mcpsync add` or an editor)
is wanted often enough to justify it.

**Cost**: ~half a day. Add an `e` edit mode over ink's `useInput` (or add `ink-text-input`),
edit the focused server's env/args, write back to canonical via a new `core` helper, then
`reload()`. Needs its own plan.

---

## 10. Relocate mcpsync out of this repo (to life-stack), after publishing its kits

**Status**: not started. **This SUPERSEDES the earlier same-session "stay + publish + import"
home decision** (see `docs/plans/2026-08-mcpsync-overview.md`). Governing **inclusion rule**:
a thing belongs in this repo iff it is (a) scaffolding machinery or (b) framework code that
generated tools depend on long-term and don't heavily customize. mcpsync is neither — it's a
standalone product that merely *consumes* the kits, exactly like an external consumer. It's a
sibling of `opkeep`, not framework code.

**Retraction**: the "generated tools import mcpsync as a library for self-deploy" idea is
dropped. A tool that wants self-setup instead documents an **optional one-time
`npx @george43g/mcpsync …` runtime shell-out** — no build-time dependency baked into every
generated tool. `npx` works regardless of where the source lives; it only needs mcpsync to be
*published*, not *co-located*.

**Sequenced work**:
1. ✅ **DONE 2026-08-08** — `@george43g/cli-kit@0.1.0` and `@george43g/tui-kit@0.1.0` are
   published, so mcpsync's `workspace:*` devDeps resolve from npm.
   `@george43g/robustness` is on npm too (now `0.2.0`).
   **The tsconfig/vitest-config question is CLOSED, and the answer is "neither".** Shared-tool
   config packages are never published (see the rule in `AGENTS.md`) — a relocated package
   depends on the destination monorepo's own equivalent. Verified: life-stack already ships
   `packages/{tsconfig,vitest-config,biome-config}` under the **same** `@george43g/*` names and
   all private, so mcpsync's `"@george43g/tsconfig": "workspace:*"` devDeps resolve there with
   **zero manifest changes**. (EQStack uses `@eqstack/*` for its own — same pattern, its own
   scope.) No work required for this sub-step.
2. Move `apps/mcpsync` to life-stack (sibling of `opkeep`); rewrite `workspace:*` → the
   published versions; publish `@george43g/mcpsync` from there. It can also stop bundling the
   kits via Vite (`apps/mcpsync/vite.config.ts` externals) and take them as real deps —
   optional, and it means moving `cli-table3`/`picocolors`/`ink`/`react` back out of its own
   `dependencies`.
3. Remove mcpsync from this repo: its release job in `release-packages.yml` (now chained after
   `tui-kit`), its entry in `PUBLISHABLE` in `scripts/check-publishable-manifests.mjs`, its
   meta-suite tests, and the AGENTS.md `.mcp.json`/`opencode.json` sync note that points at the
   local bin.

**Trigger to action**: unblocked — step 1 is done. Remaining cost is the move itself.

**Cost**: ~half a day once the kits are published — mostly mechanical (dep rewrites + move +
release wiring at the new home).

---

## 11. `packages/secrets` — confirm it's a depended-upon resolution lib, or retire it

**Status**: unverified. `packages/secrets` is the in-process `env-JSON → 1Password → file`
*resolution chain* a generated tool imports to look up its own `${VAR}` secrets at runtime — a
different layer from `opkeep` (life-stack's standalone secret-*provisioning* CLI). On their
face they're complementary, not duplicative. But by the inclusion rule, `packages/secrets`
only earns its place if generated tools actually import it and don't each customize secret
handling (same category as `robustness`).

**Preliminary signal (2026-08-05)**: a grep found NO `import` of `@george43g/secrets` in the
example MCP app's source — only the package itself (mirrored into `example/`) and a convention
mention in a skill doc. Also, mcpsync rolled its *own* 0600 vault
(`~/.mcpsync/credentials.json`, ported from imsg-mcp) rather than using `packages/secrets` —
weak evidence that secret handling gets customized per tool.

**The test to settle it**: does the generated `example` tool (and any real consumer) actually
`import` `@george43g/secrets`? If yes → framework code, it stays (mcpsync's own vault is then
just provenance). If nothing consumes it → dead weight; make it a copied stub or move it out.
Either way the boundary between "in-process resolution lib" and "opkeep the CLI" isn't written
down anywhere — writing it down is the real deliverable.

**Trigger to action**: alongside the mcpsync relocation, or whenever the secrets layer is next
touched.

**Cost**: ~1–2 hrs to trace consumers + document the layer boundary.

---

## 12. Repo / directory rename — it has outgrown "template + scaffolder"

**Status**: idea. The repo is no longer just a static template or a scaffolder — it's a
framework (published kits + `robustness`) + a schematics-style generator/migrator + a golden
reference implementation, all in one monorepo. The name `mcp-cli-starter-template` undersells
that.

**Trigger to action**: once the inclusion-rule cleanup (mcpsync relocated, secrets settled)
stabilizes what actually lives here, so the new name reflects what stays.

**Cost**: low mechanically (rename repo + dir + update the symlinked agent files + docs
links), but coordinate with published-package names and the git remote.

---

## 13. Local validation for `.github/workflows/*.yml`

**Status**: not started, deliberately. Nothing in the repo parses workflow YAML, so a
malformed workflow is only discovered by pushing it — and it surfaces as an opaque 0-second
run with no logs (field-note 28). A `scripts/check-workflows.mjs` wired into `pnpm verify`
would catch it pre-push, but it needs a YAML parser dependency the repo does not carry, and
CI already reports the failure within 15 seconds.

**Trigger to action**: if this bites a second time, or if a YAML parser arrives in the
dependency graph for another reason. Would also be a natural home for asserting release-job
invariants (every publishable package has a job; jobs stay chained via `needs`).

---

## Out-of-scope (don't lift)

These are imsg-mcp-specific items from `glowing-percolating-key.md`. They stay in imsg-mcp:

- iMessage → SMS auto-fallback
- thefuzz-style fuzzy search
- chat_analytics consolidated tool with cache
- URL-scheme integration (sms://, imessage://, etc.)
- contact:N disambiguation selector
- HEIC → PNG conversion for attachments

---

## mcpsync — issues found in downstream use (life-stack, 2026-08-05) — ALL RESOLVED

Surfaced while using `mcpsync -c ./.mcp.json apply --scope project --to opencode`
to reconcile a repo's `opencode.json` after removing a server from its
`.mcp.json` (replacing the retired `~/dotfiles/mcp/render.js`). **The core
reconcile was correct**: the written server set matched the manifest, `env`
`${VAR}` was converted to opencode's `{env:VAR}`, and no secret values were
inlined. All three minor items fixed on `fix/mcpsync-deferred-items` (2026-08-05):

1. **`apply --scope project` help text omits `opencode`.** ✓ RESOLVED — the
   `--scope` option help on `apply`/`sync` now reads
   `project (repo .mcp.json + .cursor/.warp/opencode)` and the `cli.ts` header
   comment lists `opencode.json`. (`README.md` already named it.)

2. **`opencode.json.bak.<timestamp>` backups accumulate.** ✓ RESOLVED — `backup()`
   now calls `pruneBackups(path, keep = 5)` after each copy (single choke point, so
   every host benefits), keeping only the 5 newest `.bak.<epoch>` siblings;
   `.gitignore` gained `*.bak.[0-9]*`. Proven live: 8 stale + 1 write → 5 survive.

3. **`${VAR}` inside `command`/`args` passed through verbatim.** ✓ RESOLVED —
   confirmed against opencode docs that `{env:VAR}` substitution applies to *all*
   config values (incl. the `command[]` array) and `${VAR}` is NOT understood, so
   the verbatim passthrough was a latent bug. `toOpencode`/`fromOpencode` now
   convert command/args like the env block; a `${SID}/${KEY}:${SECRET}` arg now
   resolves. (render.js behaved the same, but it's retired — no coexistence risk.)

---

## `imsg-mcp` → `EQStack` rename — doc references intentionally retained (2026-08-05)

The repo was renamed (on disk `~/repos/imsg-mcp` is now a symlink → `~/repos/EQStack`).
Only the one live "a server you'd retrofit" example in `README.md` was switched to the
current name. Every other `imsg-mcp` mention in this repo is deliberately kept — it is
**provenance** ("ported from imsg-mcp"), **dated history** (the 2026-07 retrofit
evaluation `docs/scaffolder-cli/evaluations/imsg-mcp-2026-07.md`, the rename record in the
plan docs), or a **test fixture** (an arbitrary unmanaged-server name in
`json-adapter.test.ts`). Renaming those would falsify the record, so they stand.

---

## Status snapshot at last update

- Scaffolder tests: **76 passing**
- Cloned-tool integration tests: **14 passing**
- mcp-kit unit tests: **27 passing**
- Stress cases: **11 / 11** (all required for HTTP-enabled builds)
- Lint: **0 errors, 4 warnings** (all pre-existing suppressions-unused on intentional biome-ignore comments)
- CI gates: lint, docs integrity, publishable-manifest shape, typecheck, test, test:no-native, usage(1) freshness, npm pack dry-run, scaffolder E2E smoke, example/ diff vs scaffolder output, stress
- Workspaces: 14 (excludes `example/**`)
- Template entries: 154 (`apps/scaffolder/src/generated/templates.ts`)
- Published packages: `@george43g/robustness@0.1.1`, `@george43g/cli-kit@0.1.0`,
  `@george43g/tui-kit@0.1.0`. `@george43g/mcpsync` remains bootstrap-pending.

Last reviewed: 2026-05-26 (published-package line added 2026-08-08).
