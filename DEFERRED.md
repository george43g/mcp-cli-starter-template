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

**Status**: ✅ **DONE 2026-08-09 — both retired (PR #13), superseded by `packages/secret-store`.**
**The caveat is now closed too**: for a day `secret-store` was published with no importer, which
was exactly the dead-weight verdict this item reached about `packages/secrets`. It now has a real
consumer — the HTTP bearer token resolves through it in `apps/example-repo-mcp/src/commands/http.ts`,
and every scaffolded repo declares the dependency and installs it from the registry. The test this
item set ("do generated tools actually import it?") passes for the replacement.
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

**Status**: ✅ **DONE 2026-08-09** — coverage infrastructure (PR #18) and the API-shape items
(PR #19; released as robustness 0.4.0 / cli-kit 0.2.0 / tui-kit 0.2.0). Two residuals live
elsewhere: `installShutdownHandlers`'s process-wide `unhandledRejection` suppression (16a
territory), and the v8 function/branch inflation note below (provider swap is an open option).

- ~~**Coverage gates are fiction.**~~ **RESOLVED.** `@vitest/coverage-v8` is installed in all nine
  test-running workspaces, `test:coverage` exists everywhere, `pnpm verify` runs it instead of
  plain `test`, and CI's test step is now the coverage step. `.tsx` is included in both the test
  and coverage globs.

  What the first-ever run found, beyond "they never executed":

  | workspace | stmts | branch | funcs | lines | vs target |
  |---|---|---|---|---|---|
  | robustness | 78.29 | 81.25 | 79.59 | 78.29 | short 1.7 on stmts |
  | cli-kit | 25.47 | 82.35 | 64.28 | 25.47 | far short |
  | tui-kit | 31.49 | 86.30 | 81.57 | 31.49 | far short (19.57 before MemoryCache tests) |
  | mcp-kit | 83.43 | 75.53 | 95.23 | 83.43 | meets 80/70/70/70 |
  | shared-types | 100 | 100 | 100 | 100 | meets |
  | secret-store | 85.53 | 79.01 | 91.30 | 85.53 | meets |
  | example-repo-mcp | 29.83 | 79.59 | 92.85 | 29.83 | short of 50/40/40/40 |
  | mcpsync | 53.44 | 86.45 | 78.67 | 53.44 | meets |
  | scaffolder | 86.63 | 80.76 | 85.45 | 86.63 | meets, by a wide margin |

  Two of those numbers were wrong for structural reasons, and both are fixed:

  - **`shared-types` measured 0/0/0/0.** The preset excluded `src/**/index.ts` as "a barrel", but
    that package's entire implementation lives there. The file set was empty, so it reported zero
    with no rows and no threshold error. Barrel exclusions are gone — including a real barrel
    costs ~nothing, excluding a real implementation removes it from the gate.
  - **The scaffolder measured ~50%, and is actually 86.6%.** `src/phases/**/lib/**` — the template
    payload, byte copies of the golden output that the scaffolder never executes — was in the
    coverage denominator at 0%. It was excluded from test discovery but not from coverage.

  Workspaces below target now carry an explicit `withCoverageFloor()` set to what they measure.
  A floor is a ratchet, not a target: it fails on regression, and the distance to the preset above
  it is the visible debt. Raising 80/70/70/70 everywhere would have meant a red build; deleting it
  would have meant no gate. `ink-testing-library` remains an unreferenced devDependency of tui-kit.

  Verified the gate discriminates: a 200-line uncovered file dropped secret-store to 46.83% and
  exited 1; removing it returned exit 0.
- **Test-to-export coverage of the published surface**: cli-kit 4/16, tui-kit 6/25,
  robustness 21/40. The untested robustness region was precisely the singleton API where #14 lived
  — `installShutdownHandlers` / `installWatchdog` and the `reconfigure()` paths are now covered
  (2026-08-09), but the rest of the singleton surface still is not.
  `runRepl` (85 lines, hand-rolled tokenizer) and `useVimKeys` have no tests at all — deliberately,
  since 16a replaces both and tests written today would be deleted with the code they cover.
  `MemoryCache` now has 12 (2026-08-09), taking that file to 93%; the uncovered remainder is the
  `pressureMb` branch, which needs `installWatchdog()` and therefore a `_resetForTests()` the
  robustness barrel does not export.
- ~~**API-shape items that are a major bump after adoption**~~ **RESOLVED 2026-08-09** (cli-kit
  0.2.0, tui-kit 0.2.0 — `feat:` minor, because a caret on a `0.x` pins the MINOR, so nobody on
  `^0.1.0` auto-upgrades). `commander` is a peerDependency of cli-kit; `FullScreenHandle` is
  exported; `MouseEvent` is renamed `TuiMouseEvent` (it shadowed the DOM global for any consumer
  compiling with `lib: ["dom"]`); dead `FullScreenInkProps` is gone; `brighten` is fixed.

  **Correction to the original finding**: it said tui-kit's `export *` barrels "widen the public
  API with no review". Only `src/index.ts` uses `export *`, and it re-exports three *curated*
  sub-barrels that are all explicit named exports — so nothing is ever auto-exported from a source
  file. The hazard is narrower than recorded: adding to a sub-barrel widens the surface silently.

  **`brighten` was a behaviour bug, not a shape nit.** It computed
  `withL(hex, 0.5 + stops * 0.05)` — an absolute lightness from `stops` alone, discarding the
  input colour. Every hover state in a palette came back the same lightness, and anything above
  L=0.55 got *darker* from a function called "brighten". Now relative. Six tests pin it; three of
  them fail against the old implementation.
- **Module-load-time env reads** in `retry.ts`, `rate-limit.ts`, `logger.ts` defeat cli-kit's
  `applyEnvFromFlags` contract — 9 documented knobs silently ignore their CLI flags.
- ~~**`_resetForTests()` is in the published `.d.ts`**~~ **RESOLVED** — `stripInternal: true` in
  `packages/tsconfig/base.json`. All three already carried `@internal`, so nothing else was needed;
  the runtime export remains, only the declaration is gone. **Still open**:
  `installShutdownHandlers` installs a process-wide `unhandledRejection` handler that suppresses
  Node's default throw behaviour for the whole consumer app.
- ~~Source maps ship but `src` does not~~ **RESOLVED** — all four published packages now list
  `src` in `files` with test files excluded. Verified via `npm pack --dry-run`: robustness 48
  files / 9 src, cli-kit 38 / 7, tui-kit 88 / 17, secret-store 28 / 5, zero test files leaked.
- **Module-load-time env reads** — ~~9 knobs silently ignore their CLI flags~~ **RESOLVED**. See
  the entry above; `retry.ts`, `rate-limit.ts` and `logger.ts` now read on use.
- **NEW, found while building the gate: v8 inflates function/branch coverage for files it never
  loads.** An untouched file reports 0% statements but **100% functions** — visible in tui-kit's
  per-file table for `useMouse.ts`, `useVimKeys.ts` and `glyphs.ts`. So on a package with large
  untouched regions the statements and lines figures are honest while branches and functions are
  optimistic, and they FALL toward the truth as files get tested: covering `palette.ts` replaced
  its notional 100% functions with its real 33%, dropping the package total from 81.57% to 77.5%
  *while coverage genuinely improved*. Consequence: a function/branch floor on a sparsely-tested
  package will fight the very changes that improve it. Worth evaluating the istanbul provider,
  which instruments ahead of time and does not have this blind spot.

---

## 16. SPLIT 2026-08-09 → 16a (kit-side, ours) / 16b (EQStack adoption, theirs)

Originally "EQStack migration is BLOCKED on upstream work in the kits" — one item conflating
changes to our published kits with work that belongs on EQStack's backlog, executed by EQStack's
agent, in EQStack's repo. We never touch that repo. EQStack's `apps/imsg-mcp` is the only real
consumer (`analysis` is a 13-line shell; `voice-mcp` overlaps only weakly).

### 16a — kit-side upstreaming (OURS)

**Executed 2026-08-09** (`feat/16a-kit-hardening`; ships as robustness minor + tui-kit minor):

1. ✅ **Logger file-write opt-out** (old gap 1). `MCP_LOG_TO_FILE=0` or `setFileLogging(false)`;
   default stays ON so generated servers keep their post-mortem trail. Programmatic override
   beats env; both read at call time (the `applyEnvFromFlags` contract).
2. ✅ **Sync `writeStderrLine` + stderr mirror** (old gap 2). `writeSync(2, ...)` so a crash
   microseconds later still leaves the line in the MCP host's connection log; `setStderrMirror(true)`
   mirrors info/warn/error (perf excluded). Wired in the example app's stdio branch — never the TUI.
3. ✅ **Redaction** (from the "worth upstreaming" list). `redactString`/`redactValue`/`lastFour`
   lifted from voice-mcp's `domain/redact.ts` with a cycle guard added (logger hot path must never
   throw). Logger redacts msg+data in every sink **by default**; `MCP_LOG_REDACT=0` or
   `setLogRedaction(false)` opts out. Also hardened emit with `safeStringify` — circular or BigInt
   data used to throw straight through `info()`.
4. ✅ **Default shutdown diagnostics** (old gap 3). When `onDiagnostic` is not wired, a default
   sink logs every event and writes error-level events to stderr synchronously. Before this,
   installing handlers made crashes *completely* silent: an `uncaughtException` listener suppresses
   Node's own stderr report, so an unwired consumer lost the trail entirely.
5. ✅ **`unhandledRejection` exits by default** (the #15 residual, now closed).
   `exitOnUnhandledRejection?: boolean`, default true — merely installing the observer listener
   used to suppress Node's platform default of treating unhandled rejections as fatal, for the
   whole consumer app. TUIs disable it alongside `exitOnUncaughtException`.
6. ✅ **`useDevStats(visible)`** (old gap 5 — kit-side, so it belongs here, not in 16b).
   Hidden mode rides the watchdog's 60s `onMemorySample` instead of a 2s interval — the 2s
   setState on a hidden panel re-rendered the whole Ink app 30×/min forever, measured at
   ~17-20MB/min heap churn in two real `rss_exceeded` kills (2026-07-12). Also fixed a per-render
   effect re-init defect, and threaded `visible` through `DevStatsPanel`, which shipped the exact
   OOM pattern itself.

**REOPENED AND FIXED 2026-08-09 — this entry previously closed a real bug on a false claim**:
- **Replace `runRepl` with a queue-based loop** (old gap 4). This was closed with the sentence
  *"20 contract tests drive the loop over piped multi-command input, which would fail on
  truncation."* **That claim was false.** All eleven `runScript(...)` calls in
  `packages/cli-kit/src/repl.test.ts` passed exactly ONE line
  (`repl.test.ts:119,125,133,139,146,159,167,174,180,189,194`). The multi-command piped case was
  never tested at any point. EQStack's original report of an EOF race truncating piped input was
  correct, and it was dismissed on the strength of evidence that was never checked.
- **The bug was real and a second consumer hit it.** `rl.question()` arms a ONE-SHOT listener, so
  while an async command was awaited no listener existed and every line readline had already
  buffered from a pipe was emitted into nothing. `printf 'help\ntools\nquit\n' | <bin> console`
  ran only `help`; EOF then closed cleanly, hiding the loss. up-bank-mcp hit it against the
  published tarball and carried a skipped test waiting on the fix.
- **Why the suite passed anyway**: `fakeDispatcher.listTools` was synchronous and `callTool`
  resolved immediately, so every `await` settled on the microtask queue before readline could emit
  another line. See #26 — the general lesson, which this shares with #24 one day earlier.
- **Fixed** (PR #26, ships as a cli-kit minor): serial line queue, a deliberately hostile
  `slowDispatcher` that yields to the macrotask queue, six multi-command cases, and a real-pipe
  end-to-end test in the example app. Every new test was observed FAILING against the old loop
  before the fix was trusted — the step skipped the first time.
- **The rule this earns**: a closure that cites tests as evidence must name the test file and
  line. "N tests cover this" is not evidence; it is a claim that costs one `grep` to check and, in
  this case, was wrong.

**Still open in 16a — needs EQStack-side agreement, not just our decision**:
- Theme model (old gap 6): imsg's flat `Theme extends Palette` (~30 domain keys derived from the
  accent hue) vs tui-kit's nested `{palette,glyphs,preset,accent}` with hard-coded neutrals; ~19
  components read `theme.<domainKey>` directly.
- `useVimKeys` double-dispatch (old gap 7): it registers its own `useInput` and would fight imsg's
  mode-aware handler; `StatusBar`/`HelpBar`/`DevStatsPanel` are same-name-different-component.
- Remaining upstream candidates (ranked): log-level filtering; a Prometheus metrics module;
  `--yaml` output; grapheme-aware `visual-width.ts`; `detectNerdFont()`, which complements
  `GLYPH_PRESETS.powerline` (today it can silently render blanks).

**Trigger**: EQStack's agent proposes concrete contracts (see 16b), or the next tui-kit consumer
hits the theme model.

### 16b — EQStack adoption (THEIRS)

Belongs on EQStack's backlog, in EQStack's repo. **The handoff brief now exists**:
[`docs/agent-handoff/EQSTACK-16B-BRIEF.md`](docs/agent-handoff/EQSTACK-16B-BRIEF.md) plus the
paste-able [`EQSTACK-16B-MESSAGE.md`](docs/agent-handoff/EQSTACK-16B-MESSAGE.md), mirroring the
convention `browser-tab-mcp` used to reach us. Recording 16b only in this file was a gap: an
EQStack agent never reads our backlog.

**Re-verified against EQStack's tree 2026-08-09, and FIVE earlier claims here were wrong.** The
corrections matter because acting on the old numbers wastes their time:

1. **Version floors** — said "bump `ink@7.0.1`/`react@19.2.5` to our `^7.1.1`/`^19.2.8`". Their
   *declared* carets already admit our floors; only the resolved lockfile violates them. It is
   `pnpm up ink react -r`, not a manifest edit.
2. **Theme model** — said "~19 components". It is **21 files and 391 `theme.<key>` read sites**,
   with 26 flat keys (many nested objects) vs our 18. Also missed: three keys collide with
   DIFFERENT types (`info`, `pending`), and both `ThemeProvider` and `GlyphSet` are incompatible.
3. **`DevStatsPanel` collides** — it does not exist in EQStack at all. Theirs is `DevStats`, a
   presentational component taking `stats` as a prop; ours calls the hook itself. Unnoticed
   before: `useDevStats` DOES collide, and our `DevStats` *interface* collides with their
   `DevStats` *component*.
4. **"imsg logs failure payloads verbatim" / imsg's `redact.ts`** — `apps/imsg-mcp` has **no
   redaction at all** (zero matches). The `redact.ts` we lifted is voice-mcp's, and ours is now a
   strict superset (cycle guard). Adopting ours loses them nothing.
5. **Log-level filtering** — attributed to imsg; it is voice-mcp's only.

**Watchdog parity CONFIRMED**: all 12 env names and all 12 defaults match, parsing helper
behaviourally identical, and no imsg capability the kit lacks. `IMSG_HEAP_GROWTH_MIN_MB` is a new
env surface over their hardcoded 25 (same effective default).

**A kit bug their code found** — see #24. Our `dispose()` cleared the watchdog's force-exit timer,
and `dispose` IS the registered shutdown cleanup, so a kill disarmed its own last-resort net.
Fixed in robustness 0.5.2; on 0.5.1 the trap is live.

**Blockers removed by 16a**: file logging is now opt-out (`setFileLogging(false)` replaces the
`IMSG_DEV` gate); `writeStderrLine`/`setStderrMirror` replace imsg's local writer; shutdown keeps
a crash trail without wiring `onDiagnostic`; redaction ships in the kit.

**Two migration traps to flag, both in the brief**: the kit's watchdog logs through OUR logger
(`MCP_LOG_*`), so `watchdog_kill` and the RSS forensics vanish from their ring buffer unless
`onDiagnostic` is wired in the same commit; and their `tests/watchdog-sleep-skew.test.ts` is a
source-TEXT test (`readFileSync` + regex on our literal) that cannot survive a re-export.

**Recommended order**: lockfile → watchdog (wire `onDiagnostic`) → shutdown (`exitOnUnhandledRejection: false`
+ `exitOnUncaughtException: false` for the TUI; decide which module owns the force-exit net) →
color.ts + useMouse → withTimeout/withRetry/TokenBucket → logger. Stop before theme/`useVimKeys`.

**Wanted FROM them** (verified present there, absent here): grapheme-aware `visual-width.ts`,
`detectNerdFont()` (complements `GLYPH_PRESETS.powerline`, which can silently render blanks),
`--yaml` output, voice-mcp's Prometheus metrics, voice-mcp's log-level filtering.

---

## 17. RESOLVED — `regen:example` was defined twice

**Status**: fixed 2026-08-09. One definition now lives in `scripts/regen-example.mjs`, called by
`package.json`'s `regen:example`, by `ci.yml`'s sync check, and by the release workflow's resync
(#22). Verified the extraction is behaviour-preserving: `pnpm regen:example` against the new
script produced a byte-identical `example/` (zero diff).

The residual half is still open and deliberately so: **`pnpm verify` does not run the `example/`
sync check**, so a green local `verify` is still not evidence for this class of failure. Adding it
costs a full scaffolder build on every local run, which is a real tax on the inner loop. #22's
automation removes most of the need — the release now resyncs itself, so the common trigger for
local drift is gone.

**Original finding:**

`package.json`'s `regen:example` writes into the repo. `.github/workflows/ci.yml`'s "Example/
output stays in sync" step re-implements the same sequence against a tempdir, because the
script cannot be reused as-is. Adding the scaffolder's install step to one and not the other
made CI's tempdir grow a `pnpm-lock.yaml` the committed snapshot lacks — CI failed on a repo
that was genuinely in sync, while `pnpm regen:example` locally showed zero drift.

Compounding it: **`pnpm verify` does not include the `example/` sync check** — it is CI-only.
That means a green local `verify` is not evidence for this class of failure, and it bit twice
in one session.

**Fix**: extract one parameterised script (`scripts/regen-example.mjs <target>`) that both the
package script and the workflow call. Optionally add the comparison to `verify`; the reason it
was not done unilaterally is that it costs a full scaffolder build on every local run, which is
a real tax on the inner loop and the owner's call.

**Trigger**: next time either definition changes, or the next time CI disagrees with a local
`regen:example`.

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
- Scaffolder: 10 phases, 21 migrations, 13 test files (136 tests)
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

---

## 18. Build identity — every build between two releases is indistinguishable

**Status**: designed, not started. Full design: [`docs/plans/2026-08-build-identity.md`](docs/plans/2026-08-build-identity.md).

Semver only moves on release, so there is no way to confirm that the artifact running is
the one you just built. It bites hardest with long-lived processes — a rebuilt-but-not-
reloaded bundle keeps reporting a perfectly plausible version. Downstream this happened
twice in one session, once to an agent that had just written the code.

Format `<semver>+<count>.<sha>[.dirty.<MMDDTHHmm>]`, e.g. `0.9.0+412.a1b2c3d`. Count comes
from `git rev-list --count HEAD` so it is monotonic and derived from history rather than a
committed counter — it survives clean checkouts and agrees between a laptop and CI.

**The reader cannot live in a published package.** Vite's `define` is textual substitution
over bundled modules only; anything `external` never passes through it. `@george43g/*` is
in `apps/example-repo-mcp/vite.config.ts`'s `external` list, and since PR #15 generated
repos install the kits from npm as real externals — so a `buildStamp()` exported from
`robustness` would read a `__BUILD_STAMP__` that is never replaced, and degrade to a
plausible-looking fallback rather than erroring. Build-time half goes in a new unpublished
`@george43g/build-config`; the reader stays in `src/meta.ts` as template code.

**Trigger to action**: any repo that ships a long-lived process alongside a separately
deployed client. Also worth doing before the next downstream adoption, since the value is
highest where two artifacts are built together and deployed apart.

**Blocking sub-task, do it in the same PR**: `.github/workflows/ci.yml:23`,
`cli-artifacts-drift.yml:35` and `screenshots.yml:26` check out at the default
`fetch-depth: 1`. `git rev-list --count HEAD` returns `1` on a shallow clone, so the first
CI build would ship a wrong-but-plausible count — precisely the failure this feature
exists to prevent. `release-packages.yml`, `release.yml` and `readme-check.yml` already
set `fetch-depth: 0`.

**Cost**: ~half a day including the four-surface sync (canonical → `lib/` → `example/`)
and a `03-configs` migration for the new package.

---

## 19. Revisit the generated release tooling: semantic-release vs release-please

**Status**: open question, no decision. Raised 2026-08-09.

The scaffold ships `semantic-release` scaffolding for generated repos (disabled by
default; see [`docs/RELEASE.md`](docs/RELEASE.md)), which is npm-coupled through
`@semantic-release/npm`. Downstream has since chosen **release-please** instead:
conventional commits → a rolling Release PR → versions, changelog, tags and GitHub
Releases, with publishing as a job you simply never add.

**The distinction that matters, and that the question can easily blur:** this repo's own
`release-packages.yml` publishes four real packages to npm over OIDC and is proven
end-to-end — nothing here argues for changing that. The question is only about what the
scaffolder *generates* for a cloned tool, where "I want releases and changelogs but I am
not publishing to npm" is the common case and the current default carries an npm plugin
it will never use.

**A trap to avoid if this ever migrates to `@anolilab/multi-semantic-release`** (reported by
the EQStack agent 2026-08-09, who hit it in anger): msr **always overrides** a per-package
`.releaserc` `tagFormat`, defaulting to `${name}@${version}`. Their per-package tagFormat was
silently ignored, so the first real release run could not see their existing
`imsg-mcp-v1.19.2` tag baseline and computed **v1.0.0** — a wrong publish that was stopped only
by an unrelated `EUNSUPPORTEDPROTOCOL` failure in `@semantic-release/npm` (EQStack run
31304184401). They fixed it with a global `--tag-format '${name}-v${version}'` plus
`@anolilab/semantic-release-pnpm`.

We use `semantic-release-monorepo`, so **we are not affected today**. It is recorded here
because this item is exactly where a tooling migration would be decided, and the failure mode
is invisible until it publishes something wrong.

**Trigger to action**: pair it with DEFERRED #18 — both concern build/release identity,
and a reader comparing them will want one answer, not two. Independent otherwise: semver
answers "which release", the stamp answers "which build".

**Cost**: ~2h to swap the generated workflow + docs, most of it in `12-ci-release` and its
`lib/` mirror. Zero risk to this repo's own publishing.

---

## 20. RESOLVED — `check-publishable-manifests` cannot model comparator ranges, so the honest fix silences it

**Status**: ✅ **RESOLVED 2026-08-10.** `satisfiesLoose` is gone; the check now delegates to
`semver` via `scripts/lib/semver-range.mjs`, and both manifests carry `>=0.1.1 <1`.

Three things worth keeping from the fix:

- **The escape hatch hid a second defect nobody had noticed.** `if (!m) return true` was known to
  wave comparator ranges through. It also hid that the caret branch ignored the range's LOWER
  bound — `^1.2.0` compared only the major, so it admitted `1.1.9`. Found by the new test, not
  predicted by this entry.
- **The dependency call went the other way than this entry guessed.** "Roughly 30 lines" was
  wrong: a correct desugar (carets, tildes, comparators, hyphen ranges, partials, wildcards) is
  ~120 lines of exactly the logic that develops quiet bugs, in a checker whose failure mode is a
  silent false-pass. `semver` is now a root devDependency. Nothing ships in a tarball, so the
  no-dependency rule for published packages is untouched.
- **An unparseable range is now a failure, not an admission.** That is the actual repair — the old
  behaviour reported success without checking.

The script had no test at all, which is why the gap survived. `scripts/check-publishable-manifests.test.mjs`
is the first; all 33 cases were observed failing against the old implementation first (8 did). It
runs via node's built-in runner as `pnpm test:scripts`, wired into `pnpm verify` and CI ahead of
the check that depends on it.

**Original entry follows.**

**Status**: open. Found 2026-08-09 while fixing the fallout from an accidental `robustness@0.3.0`.

Every first-party sibling range is an explicit caret chain — `apps/mcpsync` and `packages/tui-kit`
currently declare `^0.1.1 || ^0.2.0 || ^0.3.0 || ^0.4.0` for `@george43g/robustness`. That chain
grows by one clause on every minor, forever, because a caret on a `0.x` pins the MINOR.

The natural fix is `>=0.1.1 <1` — these packages are released in lockstep from one repo, so "any
0.x" is the true contract. But `satisfiesLoose()` in `scripts/check-publishable-manifests.mjs`
returns `true` for any range it does not model (`>=`, `*`, `x`, `-`), deliberately, so as not to
guess. So switching would make the check *pass by opting out of itself* — it would stop verifying
the one thing it exists to verify.

**Fix**: teach `satisfiesLoose` to evaluate comparator ranges (`>=`, `>`, `<`, `<=`, and
hyphen/space-joined pairs), then switch first-party siblings to `>=<min> <1`. Roughly 30 lines plus
tests, or adopt a real semver dependency for that script — it is currently dependency-free by
design, which is worth preserving if the hand-rolled version stays small.

**Trigger to action**: the next time a robustness minor forces another manual `|| ^0.x` edit. That
edit is itself a commit inside published package directories, so it also risks tripping the
release trigger — see field notes 52 and 53.

**Cost**: ~1h including tests. Low risk: the check is advisory-at-worst today for these ranges.

---

## 21. Downstream kit defects reported by `browser-tab-mcp` (2026-08-09)

**Status**: Class A ✅ **DONE** (cli-kit + tui-kit, shipping in the same release as #15's API-shape
work). Class B partly done, partly open — see below.

A consumer scaffolded from this template dogfooded the published kits and reported six items. All
were re-verified against this repo's source before acting; three needed correcting.

**Class A — published packages, was blocking the consumer**

1. ✅ `cli-kit` `parseConsoleInput` consumed every quote character as shell quoting, so
   `raw {"name":"x"}` reached `JSON.parse` as `{name:x}`. No backslash handling either, so there
   was no escape hatch. Fixed by separating the two jobs the function was conflating: it now
   returns `{ cmd, rest, args }`, where `rest` is the remainder verbatim (read JSON from it) and
   `args` is the shell-style split (for positional shortcuts).
2. ✅ `runRepl` never implemented the `<tool> <json>` dispatch its own docblock promised, while
   `help` listed every tool under "Available MCP tools:". Rather than trim the advertisement, the
   dispatch is now real, so `raw` is a fallback instead of the only route.
3. ✅ `tui-kit` had no terminal-size hook, so every consumer slicing a scroll window hardcoded a
   height. Added `useTerminalSize()` plus a pure `viewport.ts` (`viewportRows`, `visibleWindow`).

   **Corrections to the report**: (a) the unknown-command throw is at `repl.ts:169`, not 173;
   (b) a *third* bug nobody had spotted — the parser lowercased the command word, so any tool with
   an uppercase letter was permanently unreachable; (c) the "18 advertised vs 3 callable" figure is
   the consumer's own tool count — in this repo it was 3 listed / 2 callable, with `get_logs`
   unreachable. Also fixed while in there: `runRepl` never resolved on EOF, so piped input hung the
   process — which is also what made it untestable.

   The tests are written against the **contract**, not the readline loop — at the time #16a still
   planned to replace that loop. The replacement has since been re-evaluated and closed (see #16a);
   the contract tests are what made that closure safe to decide, and they still bind any future
   swap. That supersedes #15's note that repl tests were deliberately skipped pending the rewrite:
   a blocked consumer outranks a rewrite with no date.

**Class B — template source**

4. Build identity — see [`docs/plans/2026-08-build-identity.md`](docs/plans/2026-08-build-identity.md)
   and **#18**. The consumer independently confirmed the "never put the reader in a published
   package" constraint and supplied the injection-shaped alternative
   (`formatBuildStamp` / `setBuildStamp`).
5. **OPEN — `turbo.json` can replay a stale build stamp.** Verified accurate but currently *latent*:
   no git stamp exists in this repo yet, so there is nothing to go stale. Two independent holes.
   (a) `tasks.build.inputs` has no git state, so a docs-only commit replays a cached `dist/`.
   (b) `globalDependencies` is `[".env.example", "tsconfig.json", "biome.json"]` — no `scripts/**`,
   so editing a root generator invalidates nothing. Note the two `scripts` entries already in
   `turbo.json` are *package-relative* (`tasks.lint.inputs`, `tasks.stress.inputs`), not the root
   directory. **Fix (b) unconditionally; fix (a) in the same PR as #18**, or the first stamped CI
   build ships a wrong-but-plausible sha. Options for (a), cheapest first: export
   `BUILD_STAMP=$(node scripts/build-stamp.mjs --print)` and list `"env": ["BUILD_STAMP"]` on the
   build task (every commit busts the build cache — that is the point, but it is not free);
   key on sha only and accept two dirty builds sharing an entry; or `"cache": false` on `build`,
   which throws the speed win away. The reference `build-stamp.mjs` has **no `--print` flag yet** —
   the first option needs one added.
6. ✅ **Already fixed before the report arrived.** `vitest.shared.ts` was said to read
   `include: [..., "tests/**/*.test.ts"]`, dropping `tests/**/*.test.tsx`. PR #18 had already
   changed it to `tests/**/*.test.{ts,tsx}`, which covers both. No action.

7. ✅ **`resolveOutputMode` had no way to force human output** — DONE 2026-08-09.
   **This item was mis-recorded here and nearly lost.** The line below used to read "Explicitly
   NOT wanted: `output.ts` and `env-flag-binder.ts` were reviewed and declared correct… No API
   change there." That conflated two different sections of the consumer's brief: their §4 said no
   change was wanted *to adopt* those helpers, but their §5 was an explicit **"Asked for:"** — an
   opt-in that outranks the implicit signals. Reading only the summary message (not the full
   brief) is how the request went missing; it was found later by opening
   `UPSTREAM-KIT-BRIEF.md` itself.

   The gap: `resolveOutputMode` returned `"json"` for `--json`, a non-TTY stdout, **or** `CI=true`,
   with no inverse — so the human view was unreachable the moment stdout was not a terminal.
   `mytool list | less` was impossible, and the consumer had to run their CLI under a pty
   (`script -q /dev/null …`) just to see their own renderer.

   Fixed additively: `human?: boolean` on `OutputFlags` plus a `FORCE_HUMAN` env opt-in, both
   ranking above the inferred TTY/CI signals and below an explicit `json`. Existing behaviour is
   unchanged when neither is set. 14 tests; 4 of them fail if the feature line is removed.

**Versioning constraint (their §4, PR #26 update)**: `resolveOutputMode`, `printJson`,
`bindEnvFlags` and `applyEnvFromFlags` are now on browser-tab's hot path for every read command.
Treat them as **load-bearing**: a behaviour change to output-mode precedence or to flag-name
derivation (strip prefix → lowercase → `_`→`-`) is a BREAKING change for that consumer, not a
patch. `env-flag-binder.ts` itself was reviewed and needs no change.

**Trigger for the rest**: #18 lands → do turbo (a) with it. (b) can go any time.

---

## 22. RESOLVED — every release made `example/` stale, and nothing caught it until the next push

**Status**: fixed 2026-08-09 (PR #29). The release workflow now regenerates and commits `example/`
itself; proven on its first two real runs. The resolution detail is at the end of this entry — the
analysis above it is kept because it is why the chosen option was chosen.

Generated dependency ranges are DERIVED from `packages/*/package.json` at build time (that was the
fix for field-note 43 — hand-written ranges rot silently). So the moment semantic-release bumps a
package, `apps/scaffolder/src/generated/published-versions.ts` yields a new range and the committed
`example/` snapshot — which pins the OLD one — no longer matches what the scaffolder emits.

The gap is a timing one. Release jobs push their version bump with `[skip ci]`, deliberately, to
avoid a release loop. That also means CI never runs on the bump commit, so the stale `example/` is
not detected then. It surfaces on the *next* unrelated PR, as an `example/ is stale` failure with
nothing in that PR to explain it — a confusing signal pointing at innocent work.

Worked around by hand each time (`pnpm regen:example` + a resync PR). Real fixes, cheapest first:

- Have the last release job run `pnpm regen:example` and include `example/` in its `[skip ci]`
  commit. Keeps one source of truth; adds a scaffolder build to every release.
- Stop pinning derived ranges in `example/` at all — emit `workspace:*` there and let the sync
  check ignore the range line. Loses fidelity: `example/` is supposed to be byte-identical to real
  output.
- Accept it and make the failure self-explaining: have the sync check detect that the only diff is
  a derived range and print "a release bumped a package — run `pnpm regen:example`".

**Trigger to action**: the next release. This will recur every single time until fixed.

**Cost**: ~1h for the first option, which is the one that actually removes the manual step.

**Evidence update (2026-08-09)**: paid by hand **three times in a single session** — after PR #19's
four release bumps, after 16a's robustness 0.5.0 + tui-kit 0.3.0, and after the exports patch's
four `.1` bumps. Each time it is a `pnpm regen:example` plus a PR that exists only to carry
generated churn. That makes this the highest-frequency manual step in the repo. It was still not
fixed unilaterally because the first option edits the release pipeline, and a broken release
workflow blocks publishing — the owner's call. But nothing about the analysis is open any more.

**RESOLVED 2026-08-09.** The `secret-store` release job now regenerates `example/` and commits it
(`chore(example): resync generated output after release`). Notes for whoever reads the workflow:

- It hangs off **secret-store**, the last job to run on a push (`mcpsync` is
  `workflow_dispatch`-only), so by then the tree holds every bump from the run. A new job depending
  on `mcpsync` would be *skipped* on push — exactly when it is needed.
- The regen passes `--build`. `pnpm verify` builds the scaffolder BEFORE semantic-release bumps
  anything, so that dist embeds the old ranges; skipping the rebuild would commit stale output and
  look like it worked.
- It uses `git pull --rebase origin main` before pushing, which the `screenshots.yml` pattern it is
  otherwise modelled on lacks. `main` is unprotected and a human merge can land between checkout
  and push.
- A `git status --porcelain` guard means a no-op run commits nothing.
- No loop: `example/**` is absent from the workflow's `paths:` filter, and `GITHUB_TOKEN` pushes do
  not re-trigger workflows.
- `example/` is NOT added to `@semantic-release/git`'s assets — those are package-relative and
  would break monorepo path scoping. It has to be a separate commit step.

---

## 23. Generated-app source cannot use a kit API in the same PR that adds it

**Status**: discovered 2026-08-09 by CI failing PR #21 (the 16a kit hardening) on both matrix legs.

The registry-only runtime boundary (decided 2026-08-09) means the scaffolder E2E smoke installs
`@george43g/robustness` **from npm**, not from the workspace. So `apps/example-repo-mcp/src/` —
which is mirrored into `08-app/lib/` and becomes the generated app's source — may only call kit
APIs that are **already published**. Adding `setStderrMirror` to robustness and calling it from
the example app in the same PR typechecks locally (workspace resolution) and fails in the smoke
with `TS2305: Module '@george43g/robustness' has no exported member 'setStderrMirror'`.

`pnpm verify` cannot catch this: it resolves everything through the workspace. Only the E2E smoke,
which installs from the registry, sees the real dependency graph a generated repo gets.

**The rule**: a new kit API and its generated-app call site are **two PRs**, in that order —
publish first, wire second.

**Updated 2026-08-09**: this used to add "landing the call site in the post-release `example/`
resync PR (see #22) is free, since that PR has to happen anyway." **That is no longer true.** #22
is automated, so there is no longer a human-authored resync PR to piggyback on — the release
commits `example/` itself. A deferred call site now needs its own follow-up PR, which means it
needs to be *recorded* rather than remembered.

**Deferred call site**: `setStderrMirror(true)` in the stdio branch of
`apps/example-repo-mcp/src/index.ts` (mirror `08-app/lib/src/index.ts`, then `regen:example`).
It was written, reverted from PR #21, and is waiting on robustness `0.5.0` reaching npm.

**Fix options** (the rule works, but it is currently only enforced by a slow remote check):
- Add a fast local check that typechecks the app's imports against the *published* `.d.ts` of each
  kit rather than the workspace copy. Cheap version: grep the app's `@george43g/*` named imports
  and assert each appears in the published package's type exports.
- Or accept the smoke as the enforcement point and make its failure self-explaining — the message
  above is accurate but does not say "you are calling an unpublished API; split the PR."

**Trigger**: the next time a kit API is added with a generated-app consumer in mind. It will recur.

---

## 24. RESOLVED — the watchdog's force-exit net disarmed itself during a kill

**Status**: fixed 2026-08-09 in `@george43g/robustness@0.5.2`. Recorded because the *way* it was
found is the reusable part.

`triggerKill` arms a 5s `setTimeout` → `exit(137)` as the last-resort net for a shutdown that
wedges, then calls `shutdownController.shutdown(1)`. But `dispose()` cleared that timer, and
`dispose` is itself the cleanup registered with the shutdown controller. So the sequence was:
kill → shutdown → run cleanups → `dispose` → **clear the force-exit timer**, disarming the guard
during the exact hang it exists to escape. With our own controller the 3s `forceExitAfterMs` net
still caught it, which is why no test noticed. With a consumer-supplied controller that has no net
— EQStack's `shutdown.ts` runs cleanups in an unbounded `for … await` and only arms its own timer
on a second, concurrent call — a wedged cleanup would hang forever with nothing to kill it.

Fixed by having `dispose()` leave the timer armed whenever `state.killReason` is set, while
`reset()` tears it down unconditionally so a test cannot leak one. Three regression tests; the
kill-path one fails against the old behaviour.

**How it was found, which is the point**: not by a test and not by a bug report, but by diffing
our implementation against EQStack's equivalent while writing an adoption brief *for them*. Their
`watchdog.ts` deliberately never cancels its force-exit timer, with a comment explaining why.
Reading someone else's solution to the same problem is what made our divergence visible — the
handoff brief paid for itself before anyone read it.

**Generalisable**: when a safety net's correctness depends on an INJECTED dependency
(`shutdownController`), in-repo tests that all inject the friendly implementation cannot see the
defect. Test guards against a hostile injection — here, a controller that runs its cleanups and
then never resolves.

---

## 25. Publishing `mcp-kit` and `shared-types` — requested, deferred, with reasons

**Status**: deferred 2026-08-09 by explicit decision. Requested by the up-bank-mcp agent, who
forked both to consume them. Recorded because the request will come back and the reasons are
substantive rather than scheduling.

**Decide the two separately.** `mcp-kit`'s case is much stronger than `shared-types`'.

**Against publishing `mcp-kit`**: it would slow every mcp-kit change, permanently. Per #23, a
generated-app call site may only use an ALREADY-PUBLISHED API. `apps/example-repo-mcp/src/**` has
nine files importing mcp-kit and is its primary consumer, so every mcp-kit API change becomes two
PRs a release cycle apart. None of the four already-published packages is this tightly coupled to
the example app — that coupling is the cost, and it does not go away.

**Against publishing `shared-types`**: near-zero independent value, and publishing inverts its
stated design intent. Its entire surface is three demo tools' schemas plus a two-entry
`MIRRORED_SCHEMAS`. `docs/SHARED_RUNTIME.md:38-39` says its job is to be *edited alongside* the
consuming repo's Rust structs — which a downstream repo cannot do to a registry dependency.

**Mechanical cost if revisited**: roughly ten manifest failures each (no README/LICENSE/engines/
repository/publishConfig, `private: true`, `version 0.0.0`), two manual npm bootstrap publishes,
and one real design choice — mcp-kit's `workspace:*` on robustness becomes either a caret chain
that grows a `|| ^0.x` clause forever (#20) or a peer range like tui-kit's.

**Trap to flag if it is ever done**: `build-templates.mjs:68` selects published packages by
`publishConfig.access` alone and ignores `private`. Merely ADDING `publishConfig` flips the
scaffolder into rewriting ranges and churning `example/` before any phase is deleted. The manifest
change and `pnpm regen:example` must land in one commit.

**Already fine**: both pass the exports-condition check — `default` is last in every condition map,
so the defect that broke secret-store's first consumer is not present here, and both now carry the
`./package.json` entry.

**Trigger to reopen**: a second independent consumer asking for the same package (one asked for
both together, which is weaker evidence than it looks), or the example app ceasing to be mcp-kit's
primary consumer.

---

## 26. Fast test doubles hide async defects — test against a HOSTILE injection

**Status**: standing rule, earned by three findings in two days. Generalises #24 and the reopened
#16a REPL bug.

When a guard or a loop depends on INJECTED behaviour, a friendly double proves nothing. All three
of these shipped with passing suites:

| Defect | Injected dependency | Why the double hid it |
|---|---|---|
| Watchdog force-exit disarmed itself (#24) | `shutdownController` | Ours has its own 3s net, so the disarmed timer never mattered. A consumer-supplied controller with no net would hang forever. |
| REPL dropped piped input (#16a) | `dispatcher` | `listTools` synchronous, `callTool` resolving immediately — every `await` settled on the microtask queue before readline could emit a second line. |
| Watchdog sleep-skew guard | — (no test at all) | Not a friendly double; simply never exercised. Found by a downstream consumer who wrote the test for us. |

**The rule**: inject the hostile version.

- A dispatcher that actually yields to the MACROTASK queue (`await new Promise(r => setImmediate(r))`),
  not one that resolves on the microtask queue.
- A shutdown controller that runs its cleanups and then never resolves.
- A clock that jumps, not one that ticks.

**And prove the test discriminates.** Every one of these fixes was verified by reverting the fix
and watching the new tests fail — six for the REPL, one for the eager env read, one for the
sleep-skew guard. The first time round that step was skipped, and a bug was closed as fixed on a
claim about tests that turned out to be false.

**Where a unit harness is not enough at all**: the REPL needed a real child process with a real
pipe (`apps/example-repo-mcp/tests/repl-pipe.test.ts`). A unit harness with an in-memory stream
is what produced the false confidence in the first place.

---

## 27. Four capabilities approved for lift from EQStack, not yet taken

**Status**: open, approved by the source, deliberately not in the 2026-08-09 batch. All MIT, same
author; a header credit is appreciated but not required. Pointers supplied by the EQStack agent so
the approval is not lost when the briefs age out.

| Capability | Source | Notes |
|---|---|---|
| Grapheme-aware `visualWidth` | `EQStack/apps/imsg-mcp/src/visual-width.ts` (101 lines) | Pure, zero-dep, `Intl.Segmenter`-based with East-Asian-width + emoji/ZWJ handling. Tests at `tests/visual-width.test.ts`. We have nothing like it, and tui-kit's table/truncation code is where it belongs. |
| `detectNerdFont()` | `EQStack/apps/imsg-mcp/src/font-detect.ts` (64 lines) | `spawnSync("fc-list")`, 1s timeout, tri-state `boolean \| null`. Pairs with `GLYPH_PRESETS.powerline`, which today can silently render blanks. |
| `--yaml` output (`toYaml`) | `EQStack/apps/imsg-mcp/src/analytics-render.ts:177` | Zero-dep, phone-safe (no anchors/flow). Extract `toYaml` only — the rest of that file is imsg-domain. Belongs beside cli-kit's `printJson`/`printTable`. |
| Prometheus metrics | `EQStack/apps/voice-mcp/src/gateway/metrics.ts` (88 lines) | Zero-dep `Counter`/`Histogram` + `renderProm()` exposition. |

The fifth offered lift, **log-level filtering**, was taken in the 2026-08-09 robustness minor.

**Why deferred**: each is additive new public surface with exactly one consumer, and that batch was
already two releases deep on the packages EQStack is actively adopting. New public surface is
permanent; a lift with one consumer has not yet shown which shape it should have.

**Trigger to action**: any of them becoming blocking for a consumer (one blocked consumer outranks
four nice-to-haves), or a second consumer wanting the same one — the cross-consumer signal that
drove the whole 2026-08-09 batch.

---

## 28. Deferred generated-app call sites waiting on a published kit release

**Status**: open, populated 2026-08-09. This list exists because #23's escape hatch closed: the
`example/` resync is automated now (#22), so there is no human-authored post-release PR to
piggyback a deferred call site onto. Anything parked here needs its own follow-up PR.

| Waiting on | Call site to wire | Status |
|---|---|---|
| `cli-kit` (REPL serial queue) | Mirror `apps/example-repo-mcp/tests/repl-pipe.test.ts` into `08-app/lib/tests/`, rebuild templates, `pnpm regen:example`. Held back deliberately: the scaffolder E2E smoke installs cli-kit **from npm**, so shipping the test to generated repos before the release would fail the smoke against the published (broken) loop — #23 exactly. | ✅ cleared once `cli-kit@0.3.1` published |
| `robustness` minor (logger level gate) | Add `MCP_LOG_LEVEL` to `apps/example-repo-mcp/.env.example` and its `08-app/lib/` mirror. | ✅ cleared once `robustness@0.6.0` published |

**The table works — keep using it.** Both rows cleared within an hour of their release, which is
the point: the alternative was remembering two reverted call sites across four PRs and two release
runs.

**Rule for adding a row**: record it the moment the call site is reverted, not later. The one time
this was left to memory it survived only because CI failed loudly.

**Related lesson from the same batch, recorded in `AGENTS.md`**: `cli-kit@0.3.1` shipped four new
public APIs under a `fix:` commit, because the headline was the REPL bug and semantic-release reads
the commit TYPE rather than the diff. Additive, so nothing broke — but the version under-signals
and there is no honest correction after the fact. The existing convention note covered
under-*scoping* (a `feat(vitest-config)` publishing robustness); this is the opposite direction and
now has its own bullet.

**Trigger**: each row clears when its package publishes. Check this table after every release.

---

## 29. RESOLVED — the screenshots workflow ships two CI traps into every generated repo

**Status**: ✅ **RESOLVED 2026-08-10.** It was not two traps, it was four — and the pipeline had
never produced a single screenshot. `docs/screenshots/` contained only `.gitkeep` while the
workflow reported success on every run.

Each of these alone is enough to yield zero output, and every one of them exits 0:

1. **`Output` is resolved against the process cwd, not the tape's directory.** The workflow ran
   `vhs apps/.../overview.tape` from the repo root, so the tape's `../../../../docs/screenshots/`
   prefix pointed four levels ABOVE the root — `/docs/screenshots/`, which is not writable. vhs
   wrote nothing and exited 0. Tapes now run from their own directory.
2. **The bin the tapes typed does not exist.** They typed `example-repo-cli`; the bin is
   `example-repo` (generated: `example-cli` vs the real `example`). Nothing links workspace bins
   into `node_modules/.bin` either, so even the right name would not resolve. The tapes now define
   a shell function over the built entrypoint in a `Hide` block.
3. **`Output foo.png` writes a 210-file frame directory**, not a still. GIFs are the committed
   artifact — `docs/screenshots/*.png` is gitignored, which is the fourth defect: the workflow's
   commit step was filtering for files git had been told to ignore.
4. **The `for` loop returned only the last tape's status** (the known trap), and there was no TUI
   tape at all, so ink's CI gate (the other known trap) was never exercised.

**What actually makes a tape fail is `Wait+Screen@<timeout> /regex/`.** vhs exits 0 for a command
that does not exist, a blank TUI render, and an unwritable output path. Assert on a string from the
command's *output*, never one echoed in the command line itself. The workflow additionally verifies
that every artifact a tape declares exists AND resolved inside `docs/screenshots/` — the exit code
is not sufficient, and vhs silently creates parent directories, so a wrong path can also "succeed"
into the wrong place.

Verified by reproduction at each step, on vhs 0.11.0:

| Check | Before | After |
|---|---|---|
| `CI=true vhs tui.tape` | exit 1, blank, no artifact | exit 0, TUI rendered |
| Output path outside the repo | exit 0, silent | exit 1, names the resolved path |
| Non-last tape fails | exit 0 | exit 1, and later tapes still run |

EQStack's report was accurate on both traps it named; it just could not see from outside that the
pipeline underneath them had never worked. Their `Wait+Screen`-not-`Sleep` advice turned out to be
the load-bearing part, for a reason neither of us stated at the time: it is the only assertion
mechanism vhs has.

**Original entry follows.**

## 29 (original). The screenshots workflow ships two CI traps into every generated repo

**Status**: open, found 2026-08-09 by the EQStack agent over cross-session messaging, then verified
against this tree. `screenshots.yml` exists both here and at
`apps/scaffolder/src/phases/12-ci-release/lib/.github/workflows/screenshots.yml`, so a generated
repo inherits both traps pre-armed.

**Trap 1 — a fullscreen ink TUI renders BLANK under CI, forever, silently.** GitHub Actions exports
`CI=true`; ink then suppresses interactive frame rendering:

```js
// ink/build/ink.js:707
return interactive ?? (!isInCi && Boolean(this.options.stdout.isTTY));
```

So a `vhs` capture of an ink TUI on a runner produces a permanently blank screen. Repro without a
runner: `CI=true vhs <any-tui-tape>`. Fix (EQStack PR #76): prefix the tape's boot command with
`CI=false CONTINUOUS_INTEGRATION=false` — `is-in-ci` treats the literal string `"false"` as not-CI.

**This is LATENT here, not live**, and the distinction is the useful part. Our only tape
(`apps/example-repo-mcp/scripts/screenshots/overview.tape`) never launches the TUI — it types
`example-repo-cli health`, `noop --input …` and `--help`, all plain CLI. So nothing is broken
today; the trap fires the first time anyone adds a TUI tape, in this repo or in any repo scaffolded
from it. EQStack shipped blank screenshots for their project's entire history before noticing.

**Trap 2 — the tape loop swallows every failure but the last.** Live in both copies:

```sh
for f in apps/*/scripts/screenshots/*.tape; do echo "▶ $f"; vhs "$f"; done
```

A `for` loop exits with the LAST iteration's status, so tape 1 failing and tape 3 succeeding is a
green step. Harmless at one tape, wrong at two — and it is the thing that would hide trap 1 once
someone adds the TUI tape. Fix independently of trap 1.

**Checked and NOT applicable**: EQStack also warned that job-level `continue-on-error: true` turns
job failures into run-level "success", so conclusions must be read per-job
(`gh run view --json jobs`). `grep -rn continue-on-error` over our workflows and the template's
returns nothing, so this repo is unaffected. Recorded because verifying it cost one grep and acting
on it would have cost an afternoon.

**Fix in one PR**, touching canonical + `lib/` mirror + `pnpm regen:example`: set the CI vars in the
tape, replace the loop with one that accumulates a failure status, and add a TUI tape so trap 1 is
actually exercised rather than merely avoided.

---

## 30. `TokenBucket` has no non-blocking acquire

**Status**: open, requested 2026-08-09 by the browser-tab-mcp agent over cross-session messaging;
verified. `packages/robustness/src/rate-limit.ts:59` exposes only
`async acquire(n = 1): Promise<void>`, which waits. There is no way to express fail-fast-with-hint,
so a caller that must never queue has to reimplement the bucket.

**Requested shape**: `tryAcquire(n = 1): { ok: boolean; retryMs: number }` — refill, deduct if
tokens suffice, else report `max(1, ceil((n - tokens) / rps * 1000))`. With `rps <= 0` an exhausted
bucket reports `{ ok: false, retryMs: 0 }`: the bucket can never refill, so the caller decides what
to do rather than being told to wait forever.

**Consumer**: browser-tab's screenshot rate limiter, which must reject with a hint rather than
queue. It carries an app-local copy until this ships.

| What | Where |
|---|---|
| Reference implementation + docblock | browser-tab-mcp at tag `v1.0.0`, `packages/robustness/src/rate-limit.ts:56-74` (`tryAcquire`), refill helper at `:42-48` |
| Live app-local copy to delete | `apps/browser-tab-mcp/src/daemon/screenshot.ts` (`class ShotBucket`), branch `chore/consume-published-kits` |
| Equivalence tests that must still pass | `screenshot.test.ts:115` (deny-with-hint), `:128` (refill-then-retry) |

Additive, so a minor. Read their docblock before implementing; their two tests are the acceptance
criteria for the swap, so the shape has an existing oracle rather than needing one invented.

---

## 31. `ToolCallResult.content` is text-only, but MCP results carry image/audio/resource blocks

**Status**: open, requested 2026-08-09 by the browser-tab-mcp agent; verified. This is the SECOND
consumer in one day to find this interface under-modelled, which is the signal that the type is
wrong rather than the usage.

Current shape (`packages/cli-kit/src/repl.ts`):

```ts
content?: Array<{ type: string; text: string }>;
```

`type` is already `string` rather than a literal union, so an image block is *structurally*
representable — but `text` is REQUIRED, which is exactly wrong for
`{ type: "image", data, mimeType }`. browser-tab's screenshot tool returns image blocks and adapts
them to summary text in its own REPL wiring; up-bank hit the same interface from the other
direction this morning and needed `structuredContent` + `_meta` (shipped in 0.3.1).

**Do it properly rather than widening a third time**: a discriminated union with the renderer
summarising non-text blocks to one line (browser-tab's suggestion, and what their adapter already
does).

Scope correction from browser-tab after reviewing the plan: **`mcp-kit`'s own `ContentBlock` is
`text | image` only** (`{type:"image", data, mimeType}`), so those two are the required cases and
`audio` / `resource` are future-proofing rather than parity. Do not model the union off a
half-remembered reading of the MCP spec — match `mcp-kit` first, then extend.

**Drop-the-shim trigger for the consumer**: their REPL adapter
(`apps/browser-tab-mcp/src/cli.ts`, the `callTool` wiring) already narrows on `type === "text"` and
summarises the rest, so their migration is *deleting* the adapter rather than rewriting it. They
pin caret ranges, so they will not absorb the break silently — but they have asked to be told the
version when it ships.

**This is a breaking change to a published interface** — a required property becomes conditional on
the discriminant, so any consumer reading `content[0].text` unguarded stops typechecking. Needs a
minor plus a migration note in the README's upgrade section, NOT a patch. Recorded explicitly
because `cli-kit@0.3.1` shipped four new APIs under a `fix:` commit this morning and published as a
patch when it should have been a minor; that mistake is not worth repeating on a change that
actually breaks callers.

---

## 32. Announce that `_resetForTests` now resets the logger's prefixes

**Status**: open, raised 2026-08-09 by the EQStack agent after adopting `robustness@0.6.0`.

`_resetForTests()` now also clears `logFilePrefixOverride`, `envPrefix` and `logLevelOverride`, so a
consumer calling it in test setup must RE-APPLY its prefixes afterwards or silently fall back to the
`MCP_` vocabulary mid-suite. EQStack wraps this in a `configureKitLogger()` helper, which is the
right shape.

The reset itself is correct and deliberate: before 0.6.0 `logFilePrefix` was NOT reset, so one test
calling `setLogFilePrefix` leaked into every later test in the same file. Fixing that leak is what
created the announcement gap — the behaviour changed for consumers with nothing in the changelog
saying so.

**Fix**: a line in the robustness README's logging section and in the 0.6.0 changelog entry. Cheap,
and it is the kind of thing only a real adopter finds.
