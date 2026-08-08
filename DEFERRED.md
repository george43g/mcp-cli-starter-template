# Deferred Work

Items intentionally not done in the current shipping series. Each has a "trigger" — the signal that says "now is the time to action this."

---

## Resolved this round (no action needed)

- **Npm scope rename** — user decided to keep `@george43g`. Personal username is the publishing identity. Closed; not a deferred item anymore.
- **`{{name}}` placeholder syntax** — migrated to `example-repo` / `EXAMPLE_REPO`. Filesystem-safe, no tera/handlebars collisions, no usage(1) identifier corruption. Done.
- **Root `mise.toml` tera collision** — auto-resolved by the placeholder migration (mise no longer sees `{{name}}` to fail-parse). `mise tasks` from repo root works cleanly. Done.

---

## 1. Scaffolder's own usage(1) freshness gate in CI

**Status**: ✅ DONE (confirmed 2026-08-09). `apps/scaffolder/scripts/check-usage-freshness.mjs`
exists, root `package.json` chains `check:usage`, `ci.yml` runs it, and
`.github/workflows/cli-artifacts-drift.yml` is a second gate. Item closed.

<details><summary>original note</summary>

**Status**: missing — only the SCAFFOLDED output has a gate.

**Why deferred**: the scaffolded output's freshness gate (`apps/example-repo-mcp/scripts/check-usage-freshness.mjs` + the CI step that runs it) is the user-facing value. The scaffolder repo itself uses `usage` via `mise run completions` from `apps/scaffolder/mise.toml` but ships its checked-in artifacts at `completions/scaffolder/` + `docs/scaffolder-cli/` + `man/mcp-scaffold.1` without a CI gate.

**Trigger to action**: if drift between `apps/scaffolder/.usage.kdl` and the checked-in scaffolder completions lands on `main` (would mean someone edited the spec without regen — visible in PR review for now).

**Cost**: ~30 minutes. Copy the cloned-tool's `check-usage-freshness.mjs` pattern into `apps/scaffolder/scripts/`, point it at `apps/scaffolder/.usage.kdl`, wire into `.github/workflows/ci.yml` before the lint step.

---

</details>

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

**Status**: ✅ **SUPERSEDED 2026-08-09 — shipped, in a different package.** The OS keychain is a
first-class source in `packages/secret-store` (read via `/usr/bin/security`, plus
`saveSecret`/`deleteSecret` for setup flows).

**Why the decline was reversed**: it rested on the premise that *the tool itself talks to
1Password* — "the 1Password CLI handles that already with better cross-machine sync". Removing
vault logic from tools inverts that premise. Once a tool no longer carries vault credentials or
vendor code, the keychain becomes the **only** local store it can read without taking a vault
dependency, so it stops being a macOS convenience and becomes the load-bearing local layer.

**Why the original cross-platform objection no longer bites**: keychain is macOS-only and
**degrades to `null`** everywhere else, so the chain simply falls through to `env` / `env-file`,
which work on every platform. Reads degrade, writes throw `UnsupportedPlatformError` — a failed
read has a fallback, a silently-dropped write is data loss. Cross-platform CI is unaffected.

<details><summary>original note</summary>

**Status**: declined per spec locked decision #5.

**Why**: the secrets chain (`env-json → 1Password → file`) covers macOS, Linux, CI, and Docker uniformly. Keychain would only help macOS dev loops, and the 1Password CLI handles that already with better cross-machine sync.

</details>

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
3. Remove mcpsync from this repo. Full checklist (the earlier version of this list was
   incomplete — whoever executes the move would have hit the gaps mid-flight):
   - its release job in `release-packages.yml` (currently chained after `tui-kit` — re-chain
     `tui-kit` to whatever follows, or it becomes the tail)
   - its entry in `PUBLISHABLE` in `scripts/check-publishable-manifests.mjs`
   - its meta-suite tests (it contributes 17 test files to `pnpm test`)
   - the whole **"MCP servers (project scope)" section of `AGENTS.md`**, which instructs agents to
     run the local `mcpsync` bin after editing `.mcp.json` — that workflow leaves with it
   - `apps/mcpsync/vite.config.ts`'s bundling rationale (moot once relocated; see step 2)
   - its `LICENSE` (added 2026-08-08 to satisfy the manifest guardrail)

**Trigger to action**: unblocked — step 1 is done. Remaining cost is the move itself.

**Cost**: ~half a day once the kits are published — mostly mechanical (dep rewrites + move +
release wiring at the new home).

---

## 11. `packages/secrets` (and `packages/env-loader`) — retire or justify

**Status**: ✅ **RESOLVED 2026-08-09 — retiring both, superseded by `packages/secret-store`.**
Option (a) with a replacement rather than a hole. The new package is a **mechanism**, not a
policy: `env → .env → OS keychain → external command (opt-in)`, with no vault/vendor code in it
at all. It absorbs `env-loader`'s `loadEnv`/`parseEnvFile` verbatim and re-exports them, so
nothing is lost by deleting that package.

The reasoning behind the swap: pulling secrets *out of* a vault, caching them, and exporting them
into the environment is a secret **manager's** job (mise/direnv/opkeep/systemd). A tool should
only read env, read `.env`, and read the OS keychain if it knowingly put something there. That
boundary is what keeps vault credentials out of every tool's dependency tree. The optional `exec`
layer is the generic escape hatch to whatever manager the user runs — it names no tool; the user
supplies `SECRET_STORE_EXEC_BIN` + `SECRET_STORE_EXEC_ARGS` with a `{VAR}` placeholder. That
genericity is load-bearing: an earlier attempt hardcoded a personal CLI into a shared package and
that was the recorded reason it was rejected.

Reverses **#8** (Apple Keychain), which was declined on a premise this inverts.
Full record: [`docs/plans/2026-08-secret-store-and-kit-hardening.md`](docs/plans/2026-08-secret-store-and-kit-hardening.md).

<details><summary>original note</summary>

**Status**: ✅ **VERIFIED 2026-08-09 — the answer is "retire", pending your call on how.**
The stated test was "do generated tools actually import it?" A repo-wide grep for
`@george43g/secrets` / `getSecret` / `resolveSecret` finds **zero importers** — not in
`apps/example-repo-mcp`, not in the tracked `example/` output, nowhere but the package's own
`src/index.ts` and prose. By the inclusion rule (a thing belongs here iff it is scaffolding
machinery, or framework code generated tools depend on long-term) `packages/secrets` fails
outright.

**`packages/env-loader` has the identical profile** and was not previously part of this item:
zero importers, including in `example/`. Only descriptive prose in `AGENTS.md`,
`docs/ARCHITECTURE.md` and the example's mirrors. Both ship into every scaffolded repo as dead
weight.

**Layer note (still true)**: `packages/secrets` is an in-process `env-JSON → 1Password → file`
*resolution* chain, a different layer from `opkeep` (life-stack's standalone secret-*provisioning*
CLI). They are complementary in principle. The problem is not overlap — it is that nothing
consumes it.

**Options**: (a) delete both packages and their scaffolder phases; (b) keep them but wire the
example app to actually use them, proving the contract; (c) keep as opt-in migrations the
scaffolder does not run by default. Note DEFERRED #8 (Apple Keychain for `packages/secrets`) is
moot under (a).

</details>

---

## 12. Repo / directory rename — it has outgrown "template + scaffolder"

**Status**: idea, unblocked earlier than written. It was gated on #10 and #11 stabilising; both
are now actionable, so this can move sooner.

**What this repo actually is** (recording the framing so it survives a compact — it previously
lived only in a chat transcript, which this repo's own rules forbid): three things at once —
a **framework/SDK** (the published kits + `robustness`), a **schematics-style generator and
migrator** (`mcp-scaffold`: `init` / `apply` / `migrate` / `add-mcp-app`), and a **golden
reference implementation** (`apps/example-repo-mcp` + the tracked `example/` output, which IS the
thing being scaffolded). The jargon: "scaffolder/generator" and "schematics/migrations" are
Angular/Nx vocabulary; "golden master / reference implementation" covers `example/`.
Closest analogues: Nx, Angular CLI + Schematics + `ng update`, RedwoodJS/Blitz, Copier,
`create-t3-turbo`.

**Naming directions**: `create-mcp` if the generator leads (matches the `create-*` convention
users already expect from `npm create`); `mcp-forge` or `mcp-stack` if the framework leads.
The current name undersells it — "template" implies a static copy, which is the one thing it
is not.

**Cost**: the rename itself is cheap (repo + directory); the cost is every absolute reference —
`repository.url` in four publishable manifests (which `check-publishable-manifests.mjs` pins
case-exactly), the Trusted Publisher config on npmjs.com for three packages, and the golden
`lib/` mirrors. Do it in one pass, not incrementally.

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

## 14. `@george43g/robustness` — two verified singleton bugs (P0, published)

**Status**: ✅ FIXED 2026-08-09 on `fix/robustness-reconfigure`. Both controllers gained
`reconfigure()`, and `installShutdownHandlers` / `installWatchdog` now apply options in place
instead of replacing the controller. Registered cleanups, memory-sample subscribers, and
accumulated watchdog state survive; options merge across repeated calls; both validate before
mutating; the watchdog re-arms live timers only when a timer-shaping value changed and refuses to
reconfigure once a kill is in flight. The singleton layer — previously untested, which is why
these shipped — now has tests, and the three `docs/repros/` scripts pass. Released as
**`@george43g/robustness@0.2.1`** (tag `robustness-v0.2.1`, cut by CI over OIDC from PR #9) and
verified from a scratch project outside the workspace; `tui-kit@0.1.1` installs against it with no
peer warnings, which is what the patch-not-minor decision was for.
Full record: [`docs/plans/2026-08-robustness-reconfigure.md`](docs/plans/2026-08-robustness-reconfigure.md).

<details><summary>original note</summary>

**Status**: VERIFIED, not fixed. Both are in `robustness@0.2.0`, live on npm. Found by audit
2026-08-09, independently reproduced twice, and independently re-found by the EQStack parity
audit (its D1/D5). Repro scripts are checked in at `docs/repros/`.

**Shared root cause: replace-instead-of-reconfigure.** Both APIs throw away consumer-registered
state when handed options, silently.

**14a — `installShutdownHandlers(opts)` discards every already-registered cleanup.**
`packages/robustness/src/shutdown.ts:233-239` calls `dispose()` and builds a NEW controller,
whose `registry` Set starts empty. Proven with a control pair (`docs/repros/robustness-b2-*.mjs`):
identical scripts, the only difference being whether one option is passed —
`cleanup-ran=1` without options, `cleanup-ran=0` with. The trigger is "did you pass an object",
not "did anything change", so `installShutdownHandlers({ forceExitAfterMs: 3000 })` (semantically
the default) nukes the registry.
*Cross-package impact*: `tui-kit`'s `renderFullScreen` calls `registerCleanup` — so a consumer who
mounts the TUI then configures shutdown loses terminal restore and is left in an alternate screen
buffer with a raw-mode TTY on Ctrl-C.

**14b — `installWatchdog(opts)` silently ignores options if anything read watchdog state first.**
`packages/robustness/src/watchdog.ts:416-425` — the lazy singleton is first-call-wins, and
`readWatchdogState()` / `noteActivity()` / `onMemorySample()` all construct it with NO options.
Proven (`docs/repros/robustness-b1.mjs`): `onDiagnostic honoured after install: false`.
*Cross-package impact*: `tui-kit`'s `useDevStats` calls `readWatchdogState()` **during render**, so
a consumer following tui-kit's own README gets `idleRestart: true` — an interactive TUI that
self-kills after 24h idle — and no diagnostic, because `onDiagnostic` was dropped too.

**Why not fixed in the same session**: the correct fix is `reconfigure()` on both controllers so
state survives, which for the watchdog means re-arming live timers in a library whose job is
killing the process. That deserves its own change with tests, not a tail-end patch. Note the naive
fix (dispose + recreate) is exactly what causes 14a, and would break `onMemorySample` subscribers
the same way.

**Also fix while in there**: the singleton convenience API is entirely untested — which is why
these survived. See #15.

</details>

---

## 15. Published-kit quality gaps found in the pre-adoption sweep (2026-08-09)

**Status**: recorded, not actioned. Full findings in the session transcript; the load-bearing ones:

- **Coverage gates are fiction.** `packages/vitest-config` declares 80/70/70/70 and `AGENTS.md`
  advertises it, but `@vitest/coverage-v8` is not installed anywhere and no `test` script passes
  `--coverage`. They have never run. Worse, `coverage.include`/`test.include` are `*.ts` only, so
  every `.tsx` component is unmeasurable and `*.test.tsx` files cannot even be discovered.
  `ink-testing-library` is a devDependency with zero references.
- **Test-to-export coverage of the published surface**: cli-kit 4/16, tui-kit 6/25,
  robustness 21/40. The untested robustness region was precisely the singleton API where #14 lived
  — `installShutdownHandlers` / `installWatchdog` and the `reconfigure()` paths are now covered
  (2026-08-09), but the rest of the singleton surface still is not.
  `runRepl` (85 lines, hand-rolled tokenizer) and `MemoryCache` and `useVimKeys` have no tests at all.
- **API-shape items that are a major bump after adoption**: `commander` is a plain dependency of
  cli-kit while its types cross the public boundary (should be a peer, as ink/react correctly are in
  tui-kit); `FullScreenHandle` is not exported so the return type of `renderFullScreen` is
  unnameable; tui-kit's `export *` barrels widen the public API with no review, and currently export
  `MouseEvent` (shadows the DOM global), dead `FullScreenInkProps`, and `brighten` (ignores the
  input colour's lightness).
- **Module-load-time env reads** in `retry.ts`, `rate-limit.ts`, `logger.ts` defeat cli-kit's
  `applyEnvFromFlags` contract — 9 documented knobs silently ignore their CLI flags.
- **`_resetForTests()` is in the published `.d.ts`** for logger/shutdown/watchdog (no
  `stripInternal`), and `installShutdownHandlers` installs a process-wide `unhandledRejection`
  handler that suppresses Node's default throw behaviour for the whole consumer app.
- Source maps ship but `src` does not, so every "go to definition" lands on a missing file.

---

## 16. EQStack migration is BLOCKED on upstream work in the kits

**Status**: analysed 2026-08-09, nothing built. EQStack's `apps/imsg-mcp` is the only real
consumer (`analysis` is a 13-line shell; `voice-mcp` overlaps only weakly).

**Clean wins, ready now**: the whole 368-line `imsg-mcp/src/watchdog.ts` collapses into
`createWatchdog({ envPrefix: "IMSG" })` — a verified 1:1 on all twelve env names and defaults.
Same for `tui/themes/color.ts` and `tui/hooks/useMouse.ts` (both lifted verbatim originally), the
shutdown controller, and the TTY/colour helpers. `withRetry`/`TokenBucket`/`withTimeout` are pure
additions.

**Blocking gaps — the kits must change first**:
1. **Logger writes files unconditionally**; imsg gates disk logging behind `IMSG_DEV`/an explicit
   call. Migrating turns on `$TMPDIR` NDJSON for every end user of a bin that reads their iMessage
   database. Needs an opt-out knob upstream.
2. **No stderr mirroring and no synchronous `writeStderrLine`** — imsg relies on a sync fd-2 write
   so a crash *before* handler installation is still visible in the Claude/Cursor connection log.
3. **Shutdown emits no diagnostics by default**, so migrating without wiring `onDiagnostic`
   silently deletes the crash trail.
4. **`cli-kit`'s `runRepl` uses the recursive `rl.question` pattern imsg explicitly abandoned**
   (documented EOF race that truncated piped input) and has no `close`/EOF handling at all.
5. **`useDevStats` lacks the `visible` parameter** whose absence caused two measured `rss_exceeded`
   OOM kills in imsg (2026-07-12).
6. **Theme model is structurally incompatible** — imsg's `Theme extends Palette` (flat, ~30 domain
   keys, all derived from the accent hue) vs tui-kit's nested `{palette,glyphs,preset,accent}` with
   hard-coded neutrals. ~19 components read `theme.<domainKey>` directly.
7. `useVimKeys` registers its own `useInput` and would double-dispatch against imsg's mode-aware
   handler; `StatusBar`/`HelpBar`/`DevStatsPanel` are same-name-different-component.
8. **Peer ranges do not resolve against EQStack's lockfile today**: it has `ink@7.0.1` /
   `react@19.2.5`, below tui-kit's `^7.1.1` / `^19.2.8` floors.

**Worth upstreaming from EQStack** (ranked): `redactValue`/`redactString` from voice-mcp — the
robustness logger has NO redaction and imsg logs failure payloads verbatim; log-level filtering;
the sync stderr writer; a Prometheus metrics module; imsg's queue-based REPL loop (should replace
`cli-kit/repl.ts` outright); `--yaml` output; grapheme-aware `visual-width.ts`; `detectNerdFont()`,
which directly complements `GLYPH_PRESETS.powerline` (today it can silently render blanks).

**Recommended order**: watchdog → shutdown (wire `onDiagnostic`, mind #14) → tty/colour →
theme/color + useMouse → withTimeout. Everything else is blocked on the gaps above.

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

Measured 2026-08-09 (previous snapshot was ~3 months stale and disagreed with
HANDOFF.md and PROJECT_STATE.md three different ways — see field-note 35).

- Published packages: `@george43g/robustness@0.2.1`, `@george43g/cli-kit@0.1.0`,
  `@george43g/tui-kit@0.1.1`. `@george43g/mcpsync` bootstrap-pending.
- Workspaces: 14 (excludes `example/**`)
- Scaffolder: 10 phases, 21 migrations, 12 test files (129 tests)
- Stress: 13 assertions
- Test files by workspace: scaffolder 12, mcpsync 17, robustness 8, mcp-kit 5,
  cli-kit 2, tui-kit 2, shared-types 2, env-loader 1, secrets 1,
  example-repo-mcp 1; `apps/rust-accel` has no `test` script at all.
- Coverage: thresholds declared but **never executed** — see item 15.
- CI gates: lint, docs integrity, publishable-manifest shape, typecheck, test,
  test:no-native, usage(1) freshness, npm pack dry-run, scaffolder E2E smoke,
  example/ sync, stress.

Counts that appear in HANDOFF.md / PROJECT_STATE.md / README.md are known to
disagree with each other; trust this block or re-measure.
