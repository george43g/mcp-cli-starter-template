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

**Status**: coverage infrastructure ✅ **DONE 2026-08-09**; API-shape items still open (see below).

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

## 17. `regen:example` is defined twice, and `verify` doesn't run the check that guards it

**Status**: found 2026-08-09 while de-vendoring; re-synced by hand, root cause left in place.

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

**Trigger to action**: pair it with DEFERRED #18 — both concern build/release identity,
and a reader comparing them will want one answer, not two. Independent otherwise: semver
answers "which release", the stamp answers "which build".

**Cost**: ~2h to swap the generated workflow + docs, most of it in `12-ci-release` and its
`lib/` mirror. Zero risk to this repo's own publishing.
