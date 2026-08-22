# Project State and Continuation Handoff

Last refreshed: 2026-08-14 (work described landed 2026-08-10; `main` unchanged since)

This document is the durable continuation record for
`mcp-cli-starter-template`. It exists so a context compact, a restarted agent, or
an accidentally resumed older session does not erase the distinction between
completed work, local-only work, and deliberately deferred work.

## Snapshot

| Item | Current state |
| --- | --- |
| Branch | `main` |
| `origin/main` | Last code-bearing merges: **PRs #32–#43 then #45–#48** (both 2026-08-10). The backlog batch: manifest range checker, screenshots pipeline, `tryAcquire`, ContentBlock union, tui-kit lifts, build identity + registry boundary + workflow lint, and three decision/record PRs. Then the consumer round-trip batch (#45–#48): three consumer-reported kit defects fixed and released as patches, the release-token guard moved onto the publishing path and re-keyed on bot identity, and mise added to the release jobs. Interleaved with `[skip ci]` release bumps and BOT-authored `chore(example): resync generated output after release` commits — DEFERRED #22's automation working, not drift. No literal SHA and no CI verdict: a records file cannot name its own merge commit, nor testify to a check that runs after it is written. Use `git log --oneline -1 origin/main` and `gh pr checks`. |
| Ahead/behind | in sync |
| Local commits | none |
| Push state | everything pushed; all merged branches deleted — `main` is the only branch on origin |
| Remote check | fetched successfully on 2026-08-09 |
| Working tree | clean |
| Product boundary | fresh scaffolds are pnpm-only |
| Runtime boundary | **Registry only, decided 2026-08-09.** `--runtime-source` removed; no source-vendoring mode exists. Generated repos depend on the four published packages with ranges derived from the real manifests at build time. |
| Registry state | Published: **`@george43g/robustness@0.8.0`**, **`@george43g/cli-kit@2.0.1`**, **`@george43g/tui-kit@0.4.1`**, **`@george43g/secret-store@0.2.2`** (verified against npm 2026-08-16 — always re-verify with `npm view`, never from a table; a written version is stale the moment the next release fires). robustness 0.8.0 = `getShutdownCause`/`noteShutdownCause` (cause recorded at the lifecycle call sites, first-writer-wins, closure-scoped) + `WatchdogState.memorySampled` with live pre-first-sample memory. Both requested by the eqstack session; their brief assumed the controller already emitted `stdin_eof`/`orphaned` diagnostics and it emitted **nothing** on either path, so two branches of their downstream copy were dead code — the kit records at the call sites instead, and now emits those two events. cli-kit 2.0.1 = pipe-safe `runRepl` + value-parsing `isCI()`; tui-kit 0.4.1 = `useVimKeys` chunk dispatch. Both consumer-reported. **cli-kit's number is an accident twice over and must NOT be renumbered** — planned 0.4.0; a `!` marker took it to 1.0.0 (the analyzer maps any breaking change to a major with no 0.x clamp — DEFERRED #34), then a **docs-only** commit whose prose spelled the footer token took it to 2.0.0, whose `dist/` is byte-identical to 1.0.0 (#35, verified by unpacking both tarballs). A 3.0.0 would be a third breaking bump for zero API change. robustness 0.7.0 = `TokenBucket.tryAcquire` + the `n > capacity` throw (it used to spin forever) + the `_resetForTests` prefix-reset docs. tui-kit 0.4.0 = `visualWidth`/`clusterWidth`/`truncateToWidth` + `detectNerdFont`, lifted verbatim from EQStack with their tests as the oracle; 0.3.4 before it was the sibling-range fix. cli-kit's content = the `ContentBlock` discriminated union + its renderer. Earlier trail: robustness 0.6.0 (logger env prefix, level gate, `getFileLogLines` PID preference, `withTimeout(label, …)`); cli-kit 0.3.1 — **a patch that should have been a minor**, typed `fix:` when its diff added four public APIs; robustness 0.5.2 fixed the watchdog force-exit net (#24) — **consumers must not stay on 0.5.1**; robustness 0.3.0 and secret-store 0.2.0 were ACCIDENTAL, cut by a `feat(vitest-config):` commit touching their directories (type read against PATHS, scope ignored — field-note 52). Trusted Publishers configured for all four — CI releases with no `NPM_TOKEN`. Build provenance removed: it needs a public source repo and would 422 (field-note 23 supersedes 19) |
| mcpsync | `apps/mcpsync` landed on `main` (all 5 stages + audit + publish prep); npm publish DEFERRED — `release-packages.yml` mcpsync job is `workflow_dispatch`-only; interim install is the local global bin (`pnpm add -g <abs path to apps/mcpsync>`, installed 2026-08-03); MIGRATION COMPLETE 2026-08-03: opencode joined project scope, `~/dotfiles/mcp/` scripts and imsg `hot-deploy-ext.mjs` deleted — mcpsync is the single MCP config/deploy tool. **Guard (2026-08-05):** Desktop write-guard merged (`95f6c03`, PR #2). **Follow-ups merged 2026-08-05 (`9d90a2c`, PR #3):** 3 life-stack findings resolved (opencode project-scope help, backup prune-to-5 + gitignore, `${VAR}`→`{env:VAR}` in opencode command/args), `imsg-mcp`→`EQStack` doc rename. **Home decision REVERSED same session** → relocate mcpsync to life-stack after publishing the kits (see DEFERRED.md #10; generated-tools-import retracted for an optional `npx` shell-out). **MIGRATED OUT 2026-08-22** to `life-stack/apps/mcpsync` without publishing — never on npm at any point. `apps/mcpsync/` and the six `docs/plans/2026-08-mcpsync-*` plans are removed here; the `mcpsync` bin still runs against this repo's `.mcp.json` from its new home, so the config workflow is unchanged (DEFERRED #10). |

Always re-run `git status --short --branch` before relying on this snapshot.

## History that must survive compaction

### The 2026-08-10 backlog batch (PRs #32–#43)

Stages 1–5 of a 7-stage plan, plus 2 of 3 tail items. Stage 7 (mcpsync relocation, repo rename) is
not started and needs the user.

**The generalisable finding: three surfaces had been shipping without ever having worked**, each
reporting success. Two share one mechanism — `zip -r` follows symlinks and a pnpm `node_modules` is
a symlink farm.

1. **The sibling-range check** returned `true` for any clause its single regex could not parse. It
   was blocking its own fix: the honest range `>=0.1.1 <1` fell into the escape hatch, so adopting
   it would have made the check pass by opting out. Writing the script's FIRST test surfaced a
   second, unrecorded defect: `^1.2.0` admitted `1.1.9`, because the caret branch compared only the
   major and ignored the lower bound. Now delegates to `semver`; an unparseable range is a failure,
   not an admission.
2. **The screenshots pipeline** (#29) had never produced a file — `docs/screenshots/` held only
   `.gitkeep`. FOUR independent defects, any one sufficient: `Output` resolved against the process
   cwd rather than the tape's directory (landing at an unwritable `/docs/screenshots`); the tapes
   typed a bin name that does not exist; `Output foo.png` writes a 210-file frame directory and
   `*.png` was gitignored; and the `for` loop returned only the last tape's status. **The lever is
   that `Wait+Screen@<timeout> /regex/` is the only assertion mechanism vhs has** — it exits 0 for
   a missing command, a blank TUI, and an unwritable path alike. CI now commits a real TUI capture.
3. **The MCPB bundle** (#3) does not run: `ERR_MODULE_NOT_FOUND: ajv` from a clean extract. Size is
   36.4 MB, not the ~52 MB claimed, and size was never the defect — the zip flattens pnpm's nested
   layout, stranding packages without their dependencies. Two fixes were attempted and REJECTED on
   measurement (`pnpm deploy --prod` alone grew it to 46.6 MB; deploy + dereference reached
   26.26 MB but still failed on `picocolors`). Nothing shipped. A correct fix must make the
   extracted bundle run, and that assertion belongs in CI.

**Two unplanned majors, both from commit-message TEXT rather than code.** `cli-kit@1.0.0` came from
a `!` marker whose 0.x consequence was unchecked (#34); `cli-kit@2.0.0` came from a **`docs:`**
commit whose body explained incident 1 and spelled the footer token while doing so (#35). The
analyzer reads that token anywhere in a body. Guard: `scripts/check-release-tokens.mjs` plus a
`release-tokens` CI job gated on `pull_request` — squash-merging makes the PR title and body the
commit message, so it must run before the merge. Its first test case is the real 2.0.0 message.

**#34's settled reasoning is worth keeping**, because the first framing was wrong: staying on `0.x`
adds NO protection against breaking changes. `^1.0.0` will not cross to 2.0.0 any more than
`^0.3.1` crossed to 0.4.0 — the insulation is identical. All `0.x` buys is blocking *additive*
minors, which is the case that does not need blocking, and which a consumer explicitly said they
want automatic.

**Shipped capability**: `TokenBucket.tryAcquire` (#30, with `retryMs` guaranteed *sufficient*, not
merely positive — covered across six bucket shapes); the `ContentBlock` discriminated union and its
renderer (#31, cli-kit's only breaking change); `visualWidth`/`truncateToWidth`/`detectNerdFont`
lifted verbatim from EQStack with their tests as the acceptance oracle (#27, 2 of 4); build identity
(#18); and three new gates — `check:registry-boundary` (compares generated-app imports against each
package's git release TAG, no network), `check:workflows` (actionlint over all three surfaces), and
`test:scripts`.

**Decided**: #19 → generated repos move to release-please (ticketed as #36); this repo's own
`release-packages.yml` is untouched and proven. #34 → 0.x packages cut 1.0.0 on their first
breaking change, no config clamp.

**Deferred by the user**: #5, the vector-search Resources demo — kept as an experiment they want to
run eventually, with their own doubt recorded that it belongs in this repo at all.

### The consumer round-trip batch (PRs #45–#48, 2026-08-10)

The user's standing instruction — tell every consumer to upgrade, collect breakage, fix upstream,
re-request — stopped being a courtesy and started returning defects. **Everything in this batch
originated with a consumer, not with our own review.**

**Three kit defects, each reproduced locally AND confirmed in the published tarball before being
touched.** All three had shipped for the life of the code:

| Defect | Confirmed in | Why our own tests could not see it |
|---|---|---|
| `useVimKeys` dropped multi-character chunks; `input >= "0" && input <= "9"` is a LEXICOGRAPHIC range, so `"5j"` entered the count buffer and replayed as a stale count on the next key | `tui-kit@0.4.0` `dist/hooks/useVimKeys.js:40` | The hook had **no test at all**, and v8 scores a never-loaded file as **100% branches** — so its untested half was reported as covered for its entire life |
| `runRepl` wrote banner + prompt + readline's echo to stdout when piped | `cli-kit@2.0.0` `dist/repl.js` | A `PassThrough` is already non-TTY, so the suite ran the BROKEN path; every assertion used `toContain`, which leading noise does not disturb |
| `isCI()` treated `CI=false` as true | `cli-kit@2.0.0` `dist/tty.js` | The suite only ever set `"true"` — presence-vs-value was never discriminated |

Ink delivering a burst or paste as ONE `useInput` call is the root cause of the first, and it is an
**ink bug class, not a `useVimKeys` bug**: the consumer who read the fix went looking and found both
defects in their own router the same day. `tui-kit`'s README now carries the two greps that find it.

The `isCI` one is the instructive failure: `is-in-ci`'s semantics had been quoted **verbatim** in
the Stage 2 plan hours earlier and used to fix the screenshots pipeline, without anyone checking our
own `isCI()` against them. Having a reference implementation in hand is not applying it.

**Released as patches** — `cli-kit@2.0.1`, `tui-kit@0.4.1`. The first release of the day that went
exactly as planned.

**The release-token guard was found to be twice broken, both times by a consumer question:**

1. It ran only on `pull_request`, and `main` is **not a protected branch** (`gh api …/protection`
   → 404), so a direct push never met it. It now also runs inside `release-packages.yml` as a gate
   every release job `needs:`.
2. Once fixed, its bump-commit skip keyed on subject TEXT — which a human can type. Re-keyed on
   `semantic-release-bot` authorship, with the subject markers kept as a second condition so a
   future bot-identity change fails CLOSED.

**A second CI gap surfaced from the failed release run**: `check:workflows` was added to
`pnpm verify` in the Stage 4 batch and validated against `ci.yml`, which already had mise.
`release-packages.yml` runs the same `pnpm verify` with none, so `actionlint: not found` stopped the
chain. Nothing published — the correct behaviour — and all five release jobs now install mise.

**New**: #37, the consumer-side canary. **Not accepted** — it spends another user's compute.

### Upstream remediation: `e431399`

`e431399 feat(scaffolder): harden retrofits and refresh dependencies` is already
on `origin/main`. It implemented the findings-led remediation recorded in
[scaffolder-cli/retrofit-findings.md](scaffolder-cli/retrofit-findings.md):

- Existing-target inspection centrally derives and validates the repository
  name, detects the package manager, and checks starter-layout markers.
- `migrate` defaults to existing mode, dry-run, and preservation of divergent
  files.
- Fresh `init`/new-mode generation rejects npm and Bun before writing; fresh
  scaffolds remain pnpm-based.
- Existing non-starter repositories receive minimal, package-manager-aware agent
  documentation instead of the full starter architecture.
- Symlink writes inspect actual targets, preserve divergent user files by
  default, and replace only when `--force` is explicit.
- Phase 11 preserves changed/divergent metadata and reports skill skeletons under
  `Action required`.
- Generated retrofit links, root `usage = "3.3.0"`, consumer CI, golden mapping,
  stress descriptions, CLI help, docs, and tracked example output were updated.
- Compatible dependency updates landed with deliberate breaking-major deferrals.

Do not regress these invariants or restore silent `mcp-starter` fallbacks.

### Audited local commit: `8e6fce9`

An older resumed session created one additional commit after `e431399`. The
commit changes nine files with 27 insertions and 15 deletions. It is coherent
and should not be reverted merely because it came from the wrong session:

- Adds root `@george43g/tsconfig: workspace:*` so generated root TypeScript
  configuration resolves its shared base package.
- Removes `coverage/**` from Turbo `test` outputs because ordinary `vitest run`
  does not emit coverage. This removes false “no output files found” warnings.
- Applies the Turbo change to minimal generation, full generation, canonical
  output, and tracked example output.
- Pins `postcss` to `8.5.18` in pnpm overrides and updates the lockfile.
- Adds a migration assertion for the root shared-tsconfig dependency.
- Ignores the repo-local `.codex/` directory.

The commit is local-only. A future agent may push it only when the user has
authorized that repository action.

### Landed implementation: `ef3809b`

The 2026-07-27 implementation pass built on `8e6fce9` and was committed on
2026-07-29 with explicit user authorization as
`ef3809b feat(scaffolder): target-profile retrofits, staged registry runtime, robustness 0.1.0 prep`
(129 files, 5,411 insertions, 1,201 deletions). Its contents:

- Generic existing repositories now use a conservative target profile.
  `apply`/`plan` run only migrations marked `safe-any-existing`; complete
  starter-derived layouts keep full behavior. `--existing-strategy full` and a
  named `migrate <id>` are explicit opt-ins.
- `--report-json` emits a schema-versioned companion to the human recap.
- `scripts/evaluate-retrofit.mjs` evaluates a source repository's committed
  revision in an isolated local clone, captures its patch/untracked output, and
  can run install/lint/typecheck/test/build without touching the source checkout
  or the user's normal pnpm store.
- The robustness lifecycle layer exposes isolated
  `createWatchdog()`/`createShutdownController()` instances with configurable
  policy, injectable diagnostics/exit behavior, cleanup, sleep-skew detection,
  and stronger memory forensics.
- `@george43g/robustness` is prepared as a public `0.1.0` package with a
  standalone packed-consumer smoke and a manual release workflow.
- Fresh generation supports `--runtime-source source|registry`. Source remains
  the default (a deliberate choice, not a blocker — the runtime IS published as
  of 2026-07-31). Registry mode is tested by
  packing the local package and installing it into an isolated generated
  consumer.
- Turbo was advanced from 2.10.5 to the compatible 2.10.7 patch.
- Canonical files, phase `lib/` mirrors, generated CLI artifacts, and tracked
  `example/` output were regenerated.

No npm publication, push, or release has been performed. Those are external
mutations and require explicit user authorization.

### Harness-engineering pass (2026-07-29)

After `ef3809b`, a docs/harness pass applied
[OpenAI's harness-engineering practices](https://openai.com/index/harness-engineering/)
to this repo:

- Root `AGENTS.md` became a short navigational map; the deep scaffolder
  guidance (architecture, add-migration/add-phase, artifact troubleshooting)
  moved to the scoped `apps/scaffolder/AGENTS.md` with a `CLAUDE.md` symlink.
- `docs/README.md` now indexes all docs with read-when guidance and marks the
  lib-mirrored golden-output set.
- `docs/plans/README.md` establishes the checked-in ExecPlan convention,
  replacing the lost external-plan pattern.
- `scripts/check-docs-links.mjs` (`pnpm check:docs`) mechanically enforces
  relative-link integrity in repo-facing markdown, the
  `CLAUDE.md`/`.cursorrules` symlink invariants, and docs-index coverage. It
  runs inside `pnpm verify` and as a CI step after Lint. Template surfaces
  (`example/`, `phases/**/lib/`) are excluded because their links target the
  generated repo's layout.

### CLI artifacts and native generator policy

The scaffolder CLI and generated CLI packages both use pinned `usage(1)` specs
to generate markdown help, bash/zsh/fish completions, and manpages. Fresh
scaffolds now contain the first generated baseline, and missing artifacts fail
the freshness check rather than passing as an uninitialized state.

Generated repos also contain:

- `skills/cli-artifacts/SKILL.md`, which explains how to retain or relocate the
  pipeline when the MCP app is removed.
- `skills/workspace-scaffolding/SKILL.md`, which guides official native
  generator use for new leaf packages.
- `docs/NATIVE_SCAFFOLDERS.md`, which records why `create-turbo`, npm/pnpm
  initializers, and generic framework starters are not run over the
  deterministic repository root.

`create-turbo` remains a greenfield or evaluation alternative, not an in-place
conversion tool. The native `git init` integration remains appropriate.

The retained imsg evaluation report is at
`/tmp/imsg-scaffold-eval-final-20260727`. The evaluator removed its temporary
clone because `--keep` was not supplied, and no real imsg monorepo conversion
was performed.

### Robustness singleton fix (2026-08-09)

`@george43g/robustness@0.2.0` shipped with two P0 bugs whose shared root cause was
that the singleton convenience API **replaced** its controller instead of
reconfiguring it, silently discarding consumer state — `installShutdownHandlers(opts)`
dropped every previously registered cleanup, and `installWatchdog(opts)` was
ignored outright if anything had lazily built the watchdog first (which
`tui-kit`'s `useDevStats` does during render).

Both controllers gained `reconfigure()`; the convenience wrappers merge options
in place. The load-bearing detail is that `dispose()` was never the problem —
discarding the closure was — so `reconfigure` reuses `dispose()` only to relocate
listeners onto a replacement host process. Design decisions, discoveries, and the
validation trail are in
[plans/2026-08-robustness-reconfigure.md](plans/2026-08-robustness-reconfigure.md).

Two facts worth carrying forward: the repo's own TUI entries were **ordering-lucky,
not immune** (they configure before `renderFullScreen`, so the nuked registry
happened to be empty), and the bugs survived release because every existing
robustness test exercised the `create*` factories while all the state management
lived in the untested singleton wrappers (field-notes 38-39).

## Verification evidence

### Baseline local HEAD

The following checks passed on `8e6fce9` on 2026-07-26:

- `pnpm install --frozen-lockfile --offline`
- `pnpm verify`
- `pnpm --filter @george43g/mcp-scaffold test` — 114 tests across 12 files,
  including golden-output drift
- `pnpm test:no-native`
- `mise run --cd apps/scaffolder smoke` — fresh scaffold, install, and generated
  repository tests passed; the prior tsconfig and missing-Turbo-output warnings
  were absent
- `pnpm run stress` — 13 of 13 assertions passed
- `pnpm audit --json` — zero known vulnerabilities across 433 dependencies
- `cargo update --dry-run --verbose` — zero Rust packages available to update
- `git diff --check origin/main..HEAD`

This is evidence for the audited commit, not a promise that later working-tree
changes remain verified. Re-run checks proportional to any new edits.

### Current working tree

Focused checks completed during the implementation pass:

- Scaffolder suite: 128 tests across 12 files.
- Robustness package: 68 tests across 8 files.
- Packed `@george43g/robustness` standalone-consumer smoke.
- Registry-mode generated-consumer install, typecheck, test, and build using the
  locally packed tarball.
- Isolated `imsg-mcp` safe-profile evaluation: no tracked changes; only
  `RETROFIT.md` and `skills/imsg/SKILL.md`; frozen install, lint, typecheck,
  test, and build passed.

Final checks completed on 2026-07-27:

- `pnpm install --frozen-lockfile`
- `pnpm verify`
- `pnpm test:no-native`
- `mise run --cd apps/scaffolder smoke`
- `pnpm check:robustness-package`
- `pnpm smoke:registry-runtime`
- `pnpm stress` — 13 passed, 0 failed
- `pnpm audit --json` — zero known vulnerabilities across 433 dependencies
- `pnpm outdated -r --format json` — only the nine deliberately deferred
  breaking majors listed below
- `pnpm licenses list --json` — 276 unique packages across nine permissive
  license families; no unknown or copyleft-only result
- `cargo update --manifest-path apps/rust-accel/Cargo.toml --dry-run --verbose`
  — zero compatible updates after refreshing `ctor` 1.0.10 to 1.0.11
- `git diff --check`
- `mise exec -- pnpm check:usage` — scaffolder and canonical app artifacts are
  byte-current
- arbitrary-name fresh scaffold (`hyphen-tool`) — initial markdown docs,
  bash/zsh/fish completions, and manpage present; its own `pnpm check:usage`
  passed without a prior regeneration
- generated `example/` regenerated with 123 template entries

The root frozen install initially exposed a stale Turbo specifier in
`pnpm-lock.yaml`; a normal install refreshed it, and the subsequent frozen
install passed. This is part of the current working-tree fix, not an unresolved
failure.

### Handoff refresh checks

On 2026-07-29:

- `git fetch --prune` succeeded.
- Local `main` remained ahead 1, behind 0.
- HEAD remained `8e6fce9`; `origin/main` remained `e431399`.
- `@george43g/robustness` returned npm E404, confirming no public package at
  refresh time.
- The imsg report bundle remained present under `/tmp`.
- `git diff --check` passed.

The full test matrix was not rerun on 2026-07-29 because only handoff
documentation changed after the verified 2026-07-27 implementation.

## Completed real-repository probe

The isolated evaluator ran against committed `imsg-mcp` revision
`30d0ea41ec046bc314393fddf9151da5c7859288`.

- Legacy preserve mode added 127 untracked starter files and preserved nine
  divergent tracked files.
- Legacy `--force` rewrote 13 tracked product files.
- The safe-profile implementation changed no tracked files and produced only
  `RETROFIT.md` plus the `skills/imsg/SKILL.md` skeleton.
- The safe result passed frozen install, lint, typecheck, test, and build.

See
[scaffolder-cli/evaluations/imsg-mcp-2026-07.md](scaffolder-cli/evaluations/imsg-mcp-2026-07.md).

## Next mission: remaining landing decisions

The implementation is committed locally (`ef3809b`). The next agent should not
restart the bug hunt or regenerate everything by default.

### Required review

1. Read `HANDOFF.md`, this file, `AGENTS.md`, and the findings ledger.
2. Run `git status --short --branch`.
3. Confirm generated mirrors remain coherent:
   - canonical source
   - phase `lib/` copy
   - tracked `example/` output
   - generated CLI documentation/completions/manpage
4. If any code changes after handoff, rerun checks proportional to the change.

### Landing decisions

Push, package publication, and the runtime-default flip are separate actions:

1. **Push** — done 2026-07-29 with explicit user direction; `main` and
   `origin/main` are in sync and CI is green.
2. **Publish robustness** — DONE 2026-07-29. The user ran the local publish
   in their own terminal (npm web auth requires a real TTY; agent sessions
   hit EOTP). `publishConfig.provenance` was removed from the manifest
   because a manifest-level `true` blocks local publishes and env overrides
   do not win.
3. **Verify public consumption** — DONE 2026-07-29: a clean consumer
   installed `@george43g/robustness@0.1.0` from the public registry and the
   canonical watchdog/shutdown smoke passed.
4. **CI release automation** — built 2026-07-29 at the user's direction.
   `release-packages.yml` now runs on pushes to `main` touching
   `packages/robustness/**`: full verification (verify + no-native +
   packed-consumer smoke + stress) then semantic-release from
   `packages/robustness` (`.releaserc.json`, `extends
   semantic-release-monorepo`, `tagFormat robustness-v${version}`,
   changelog + npm + git + github plugins). Publishing uses npm OIDC
   trusted publishing — no `NPM_TOKEN`, ever. The baseline tag
   `robustness-v0.1.0` anchors versioning. Local `--dry-run` validated all
   verifyConditions and commit filtering. BLOCKED on the user configuring
   the Trusted Publisher on npmjs.com (org `george43g`, repo
   `mcp-cli-starter-template`, workflow `release-packages.yml`, no
   environment); until then the workflow still verifies but any publish
   attempt would fail auth.
5. **Flip the default** — DONE 2026-08-09, and taken further than "flip the
   default": `--runtime-source` is gone entirely. Generated repos depend on the
   published packages, the vendoring phases and their `lib/` mirrors were
   deleted, and ranges are derived from the real manifests at build time.

### Safe re-verification command set

If code changes, or before landing when the user requests a fresh verification,
run:

```sh
pnpm install --frozen-lockfile
pnpm verify
pnpm test:no-native
mise run --cd apps/scaffolder smoke
mise exec -- pnpm check:usage
pnpm check:robustness-package
pnpm smoke:registry-runtime
pnpm stress
git diff --check
```

Run dependency/audit/license/Rust scans again only if dependencies, lockfiles,
or release timing changed.

The socket-based stress runner may fail in a restricted sandbox with
`listen EPERM` under `/tmp/tsx-*/*.pipe`. Classify that as an environment
limitation only when an unrestricted rerun passes.

## Dependency state

The compatible refresh already on upstream includes Biome 2.5.5, tsx 4.23.1,
Ink 7.1.1, React 19.2.8, napi CLI 3.7.4, MCP SDK 1.29, and a Rust
lock refresh. Security overrides currently pin:

- `@hono/node-server` to `2.0.11`
- `fast-uri` to `3.1.4`
- `postcss` to `8.5.18` in the local commit

The current working tree applies the compatible Turbo 2.10.7 patch to root,
generated-source, tracked-example, and lockfile surfaces. It also refreshes
Rust's transitive `ctor` from 1.0.10 to 1.0.11.

The 2026-07-27 supply-chain scan found:

- Zero npm advisories across 433 dependencies.
- No compatible npm updates after the Turbo refresh.
- Nine breaking-major updates, all deliberately deferred below.
- Nine permissive license families across 276 unique package names.
- One deprecated transitive package, `sourcemap-codec@1.4.8`, under
  `rollup-plugin-banner2 -> magic-string`; the parent is already at its latest
  release and there is no direct safe patch in this batch.
- Zero compatible Rust updates after the `ctor` refresh.

The following breaking majors are intentionally deferred and must be upgraded
individually with their migration guides, generated mirrors, and full
verification:

- `@inquirer/prompts` 7 to 8
- `@types/node` 24 to 26 (the project deliberately targets Node 24)
- Commander 14 to 15
- execa 9 to 10
- ora 8 to 9
- TypeScript 5 to 7
- Vite 7 to 8
- Vitest 3 to 4
- Zod 3 to 4

Do not bundle those major migrations into an unrelated dependency push.

## Deferred product and architecture work

These items are known and intentionally not part of the completed retrofit
remediation:

1. Publish strategic guidance about when a dedicated MCP server is justified.
   The source analysis remains in the findings ledger. The working heuristic is
   to build one for non-trivial protocols, persistent state/auth, or reliable
   multi-call aggregation—not merely as a thin SSH-command wrapper.
2. Multi-tenant HTTP/OAuth introspection. The starter remains single-tenant.
3. A non-monorepo fresh-scaffold mode. `monorepo === false` is still explicitly
   “not yet supported.”
4. Phase-runner lifecycle hooks such as `preMigration`, `postMigration`, and
   `finally`; retain the oclif notes in `apps/scaffolder/src/core/CREDITS.md`
   until a concrete need exists.
5. Automatic Commander-to-usage specification integration. The current
   `.usage.kdl` artifacts remain generated and drift-checked through `usage`.
6. Enabling semantic release for the TEMPLATE output.
   `.github/workflows/release.yml` (the lib-mirrored workflow shipped to
   generated repos) remains disabled until release ownership is decided
   deliberately. The META-repo's own package release automation
   (`release-packages.yml` + `packages/robustness/.releaserc.json`) went
   live on 2026-07-29 using npm OIDC trusted publishing — no `NPM_TOKEN`
   secret anywhere.
7. The breaking dependency migrations listed above.
8. Flipping the default runtime source to `registry`. Do this only after
   `@george43g/robustness@0.1.0` is published and a clean consumer installs it
   from the public registry.
9. Publishing additional shared packages. DONE for the kits (2026-08-08):
   `@george43g/cli-kit@0.1.0` and `@george43g/tui-kit@0.1.0` are published, so
   `apps/mcpsync` can be relocated out of this repo (DEFERRED #10 step 1).
   `mcp-kit` remains generated source until its public contract and independent
   versioning value are proven; `env-loader` was retired outright (DEFERRED
   #11). Note that publishing
   the kits did NOT change what generated repos consume — they still get
   vendored source; extending `--runtime-source registry` past `robustness` is
   separate, deferred work.
10. DONE (2026-08-01): the harness-engineering self-correcting layer now ships
    into generated repos. Added under `10-docs-readme/lib/` (auto-emitted by
    portPackage): docs index (`docs/README.md` + coverage gate), ExecPlan
    convention (`docs/plans/README.md`), and self-referential
    `docs/PROJECT_STATE.md` + `HANDOFF.md` authored for a freshly scaffolded
    repo (not empty stubs). A genericized `scripts/check-docs-links.mjs`
    (no `apps/scaffolder` scan roots, no scaffolder-only symlink pair) is wired
    into the generated `package.json` `verify` chain and CI as a `check:docs`
    step between lint and typecheck (`01-bootstrap/m4-monorepo.ts` +
    `12-ci-release/lib/.github/workflows/ci.yml`). Five lib files are exempted
    in `golden.test.ts` (template-only; meta canonical twins differ by design);
    lib↔example drift stays caught by the example/ sync check. `example/`
    regenerated and the generated guardrail runs green inside the scaffold.

## Current structural facts

- 12 phases
- 26 registered migration files
- 177 generated template entries
- 129 scaffolder tests across 12 test files
- 14 cloned-tool integration tests
- 27 `mcp-kit` unit tests
- 68 robustness unit tests across 8 test files
- 13 stress assertions
- pnpm 10.29.3 and Node 24
- MCP SDK `^1.29.0`

Generated files and canonical sources are separate surfaces. When changing a
canonical file, its phase `lib/` mirror and tracked `example/` output may also
need updates. Run the golden test and the relevant generation task rather than
assuming one edit propagates automatically.

## Resume checklist

1. Read `HANDOFF.md`, this file, `AGENTS.md`, and the findings resolution status.
2. Confirm `git status`, `git log -2 --oneline`, and the upstream relationship.
3. Inspect any working-tree changes before editing; they belong to the user or a
   prior agent until proven otherwise.
4. Do not repeat the completed implementation/test sweep unless current code
   changes or the user asks for fresh verification.
5. Review the current implementation and its final verification evidence before
   deciding whether to commit.
6. Committing, pushing, publishing `@george43g/robustness`, and flipping the
   runtime default are separate decisions. None is authorized by this handoff.
7. If starting a deferred migration, isolate it from the verified baseline and
   record the new decision in this file.
8. **Before writing any commit message or PR body**, remember that they are
   machine input: `semantic-release` reads the breaking-change footer token
   anywhere in a body and cuts a MAJOR. Two unplanned `cli-kit` majors were
   published this way on 2026-08-10. `pnpm test:scripts` and the `release-tokens`
   CI job now block it; write about the token in lowercase rather than spelling
   it. Same class as the existing rule about skip-CI markers in prose.
9. **Assume a green check may be checking nothing until you have seen it fail.**
   FOUR surfaces here reported success while never having worked — including the
   `release-tokens` guard, which was written *as a fix* in the same session and
   described to three consumer sessions as closing the hole before anyone
   checked it ran on the path that publishes. **A guard you wrote yourself is
   not exempt.** For any check you rely on or add, construct the failure first
   and confirm it goes red.
10. **Never hand-carry a version number to a consumer — cite the command.** All
    five consumer sessions were told `cli-kit 1.0.0`; an accidental 2.0.0
    published between the message and their installs, and nothing corrected
    them. One repo pinned `^1.0.0` and was stranded a major behind while its own
    notes said "latest". A relayed number is stale the moment the next release
    fires, and releases here fire on push to `main`. Send
    `npm view @george43g/<pkg> version`. Semantics travel fine by hand; numbers
    do not.
11. **Rendered output is not covered by semver.** A patch that improves a
    rendering breaks any consumer snapshotting stdout — no API change, no type
    error, nothing thrown. `cli-kit@2.0.1` broke 8 of one consumer's 12 snapshot
    tests. The promise cli-kit now makes is in its README: results and meta
    footers stable, chrome not. Exposure is `rg -l toMatchSnapshot`, and is NOT
    proportional to how much of the API a consumer uses.
12. **Explaining a mechanism out loud is a cheap way to discover it is wrong.**
    Both guard defects were found by a consumer asking a question, and the
    second surfaced only *because* the first was fixed and the fix described.
    When a peer asks "is X actually true?", check rather than reassure.

The former external plan path
`/Users/george/.claude/plans/2-programmable-mcp-scaffolder.md` is absent. Do not
depend on it. The repo-local sources above are the authoritative continuation
record.
