# Project State and Continuation Handoff

Last refreshed: 2026-08-09

This document is the durable continuation record for
`mcp-cli-starter-template`. It exists so a context compact, a restarted agent, or
an accidentally resumed older session does not erase the distinction between
completed work, local-only work, and deliberately deferred work.

## Snapshot

| Item | Current state |
| --- | --- |
| Branch | `main` |
| `origin/main` | `fbe09e6` — merge of PR #15 (scaffolder install step); CI green |
| Ahead/behind | in sync |
| Local commits | none |
| Push state | everything pushed; all merged branches deleted — `main` is the only branch on origin |
| Remote check | fetched successfully on 2026-08-09 |
| Working tree | clean |
| Product boundary | fresh scaffolds are pnpm-only |
| Runtime boundary | **Registry only, decided 2026-08-09.** `--runtime-source` removed; no source-vendoring mode exists. Generated repos depend on the four published packages with ranges derived from the real manifests at build time. |
| Registry state | Published: **`@george43g/robustness@0.2.1`**, **`@george43g/cli-kit@0.1.0`**, **`@george43g/tui-kit@0.1.1`**, **`@george43g/secret-store@0.1.0`**. Trail: robustness 0.1.0 was the 2026-07-29 user-run bootstrap, 0.1.1 the first CI OIDC release (2026-07-31), 0.2.0 cut by CI 2026-08-09, 0.2.1 (DEFERRED #14) cut by CI the same day; the kits' 0.1.0 were user-run bootstraps (2026-08-08, tagged at `cb21bea`) and tui-kit 0.1.1 was cut by CI. Trusted Publishers configured for all three — CI releases from here with no `NPM_TOKEN`. Build provenance removed: it needs a public source repo and would 422 (field-note 23 supersedes 19) |
| mcpsync | `apps/mcpsync` landed on `main` (all 5 stages + audit + publish prep); npm publish DEFERRED — `release-packages.yml` mcpsync job is `workflow_dispatch`-only; interim install is the local global bin (`pnpm add -g <abs path to apps/mcpsync>`, installed 2026-08-03); MIGRATION COMPLETE 2026-08-03: opencode joined project scope, `~/dotfiles/mcp/` scripts and imsg `hot-deploy-ext.mjs` deleted — mcpsync is the single MCP config/deploy tool. **Guard (2026-08-05):** Desktop write-guard merged (`95f6c03`, PR #2). **Follow-ups merged 2026-08-05 (`9d90a2c`, PR #3):** 3 life-stack findings resolved (opencode project-scope help, backup prune-to-5 + gitignore, `${VAR}`→`{env:VAR}` in opencode command/args), `imsg-mcp`→`EQStack` doc rename. **Home decision REVERSED same session** → relocate mcpsync to life-stack after publishing the kits (see DEFERRED.md #10; generated-tools-import retracted for an optional `npx` shell-out). See [plans/2026-08-mcpsync-overview.md](plans/2026-08-mcpsync-overview.md) |

Always re-run `git status --short --branch` before relying on this snapshot.

## History that must survive compaction

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

The former external plan path
`/Users/george/.claude/plans/2-programmable-mcp-scaffolder.md` is absent. Do not
depend on it. The repo-local sources above are the authoritative continuation
record.
