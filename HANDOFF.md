# Current Handoff

Last refreshed: 2026-08-09 (Australia/Melbourne)

This is the front door for a fresh agent. Read
[docs/PROJECT_STATE.md](docs/PROJECT_STATE.md) for the exhaustive history,
verification matrix, dependency decisions, and deferred work.

## State at handoff

| Item | Current state |
| --- | --- |
| Repository | `/Users/george/repos/mcp-cli-starter-template` |
| Branch | `main` |
| `origin/main` | Last code-bearing merge: **PR #19** (kit API shape + REPL fixes + useTerminalSize), followed by four `[skip ci]` release bump commits. Two things are deliberately NOT recorded here. (1) A literal SHA — this file cannot name the merge commit of the PR that writes it, so the field was always one docs-merge stale; use `git log --oneline -1 origin/main`. (2) A CI verdict — a records file written pre-merge cannot testify to a post-merge event; check `gh pr checks` instead. |
| Ahead/behind | in sync |
| Local commits | none |
| Remote check | fetch + push succeeded on 2026-08-09 |
| Working tree | clean |
| Push state | everything pushed; all merged branches deleted — `main` is the only branch on origin |
| Last landed | **DEFERRED #15 closed + downstream Class A fixes shipped** (PRs #18–#19, 2026-08-09). Coverage gates now actually execute (`test:coverage` in `verify` + CI; per-workspace `withCoverageFloor()` ratchets); API shape fixed (commander→peer, `TuiMouseEvent` rename, `FullScreenHandle` exported, `brighten` behaviour fix, `stripInternal`, `src` in tarballs); nine module-load-time env reads made lazy; REPL fixed against the browser-tab report (verbatim `rest` for JSON, real `<tool> <json>` dispatch, case preserved, EOF resolves) with 20 contract tests; `useTerminalSize` + pure `viewport.ts` added to tui-kit. Downstream report record: DEFERRED #21. Prior: secret-store shipped/de-vendored/wired, PRs #11–#17 — [docs/plans/2026-08-secret-store-and-kit-hardening.md](docs/plans/2026-08-secret-store-and-kit-hardening.md) |
| mcpsync | `apps/mcpsync` landed (5 stages + audit + publish prep); npm publish DEFERRED — release job is `workflow_dispatch`-only; local global bin installed via `pnpm add -g`. Desktop write-guard merged (`95f6c03`, PR #2). Round 2026-08-05 merged (`9d90a2c`, PR #3): 3 life-stack findings resolved + `imsg-mcp`→`EQStack` doc rename. Home decision REVERSED same session → relocate mcpsync to life-stack after publishing the kits (DEFERRED #10; import-as-library retracted for an optional `npx` shell-out). (see [docs/plans/2026-08-mcpsync-overview.md](docs/plans/2026-08-mcpsync-overview.md)) |
| Package state | Published: **`@george43g/robustness@0.4.0`**, **`@george43g/cli-kit@0.2.0`**, **`@george43g/tui-kit@0.2.0`**, **`@george43g/secret-store@0.2.0`** — all four cut by CI over OIDC on 2026-08-09 after PR #19. Trusted Publishers configured for all four (secret-store via `npm trust github`). **Two accidental releases in the trail**: robustness 0.3.0 and secret-store 0.2.0 were cut by a `feat(vitest-config):` commit that touched files inside their directories — `semantic-release-monorepo` reads the commit TYPE against every package path and ignores the scope (field-note 52). Trigger paths now exclude test/tooling files. `@george43g/mcpsync` remains bootstrap-pending (its job is still `workflow_dispatch`-only). |
| Release pipeline | `.github/workflows/release-packages.yml` PROVEN end-to-end: full verify matrix → npm OIDC trusted publishing (no `NPM_TOKEN`) → tag + CHANGELOG + GitHub release → `[skip ci]` bump commit (loop-safe, confirmed no re-trigger). Now five chained jobs (robustness → cli-kit → tui-kit → secret-store → mcpsync), serialized because each pushes a bump commit. **Build provenance is deliberately OFF** — it requires a public source repo and this one is private; requesting it 422s the publish (field-note 23, which supersedes 19). |
| Runtime default | **Registry only.** `--runtime-source` was REMOVED — there is no source-vendoring mode. Generated repos depend on the four published packages; ranges are DERIVED from `packages/*/package.json` at build time into `src/generated/published-versions.ts`, never hand-written. `mcp-kit`, `shared-types` and the three tool-config packages are still generated as source. |

On 2026-07-29 the user authorized committing the verified working tree. The
previously uncommitted implementation (87 modified + 42 untracked files,
3,201 insertions / 1,201 deletions) landed as
`ef3809b feat(scaffolder): target-profile retrofits, staged registry runtime, robustness 0.1.0 prep`.

## Do not repeat completed work

The implementation is complete and the final test matrix passed on 2026-07-27:

- `pnpm install --frozen-lockfile`
- `pnpm verify`
- `pnpm test:no-native`
- `mise run --cd apps/scaffolder smoke`
- `mise exec -- pnpm check:usage`
- `pnpm check:robustness-package`
- `pnpm smoke:registry-runtime`
- `pnpm stress` — 13 passed, 0 failed
- `pnpm audit --json` — zero advisories across 433 dependencies
- dependency outdated/license scans
- Rust native build and compatible-update scan
- generated `example/` regeneration and golden drift tests
- skill validation
- arbitrary-name `hyphen-tool` scaffold and first-run usage-artifact check
- `git diff --check`

On 2026-07-29, the remote refs, registry E404, worktree inventory, retained imsg
report bundle, and `git diff --check` were refreshed. The full test matrix was
not rerun because only these handoff documents changed.

## What landed in `ef3809b`

### Existing-repository safety

- Generic existing repositories use a conservative target profile.
- Default `apply`/`plan` runs only migrations marked `safe-any-existing`.
- Complete starter-derived repositories retain full migration behavior.
- `--existing-strategy full` and a named `migrate <id>` are explicit opt-ins.
- `--report-json` emits schema-versioned migration evidence.
- `scripts/evaluate-retrofit.mjs` evaluates committed source revisions in an
  isolated clone and can use an isolated pnpm store.

Preserve the invariants in
[docs/scaffolder-cli/retrofit-findings.md](docs/scaffolder-cli/retrofit-findings.md).

### Shared robustness runtime

- It exposes configurable `createWatchdog()` and
  `createShutdownController()` factories while preserving convenience APIs.
- A packed standalone-consumer smoke and registry-mode generated-consumer smoke
  both pass.
- Fresh generation supports `--runtime-source source|registry`.

> SUPERSEDED 2026-08-09. This section described the pre-publication world.
> `@george43g/robustness` is at **0.2.0**, `cli-kit` at **0.1.0**, `tui-kit` at
> **0.1.1**, all on npm; `release-packages.yml` has a live `push` trigger and is
> NOT manual (only the mcpsync job is dispatch-gated) and has no `publish`
> input. Flipping the scaffolder's default runtime source to `registry` is still
> a separate, deliberate decision — that part stands.

### CLI artifacts and native scaffolders

- The scaffolder and generated CLI packages both use pinned `usage(1) 3.3.0`.
- Fresh output includes the initial markdown help, bash/zsh/fish completions,
  and manpage baseline.
- Missing or stale artifacts fail byte-level freshness checks.
- Generated repos include:
  - `skills/cli-artifacts/SKILL.md`
  - `skills/workspace-scaffolding/SKILL.md`
  - `docs/NATIVE_SCAFFOLDERS.md`
- Native `git init` remains appropriate.
- `create-turbo` and package initializers are not run over the deterministic
  root; official `create-*` tools are recommended for matching leaf workspaces.

### Dependencies and generated surfaces

- Turbo is updated from 2.10.5 to 2.10.7.
- Rust `ctor` is updated from 1.0.10 to 1.0.11.
- Compatible dependency updates are complete.
- Nine breaking majors remain intentionally deferred.
- Canonical files, phase `lib/` mirrors, generated CLI artifacts, and tracked
  `example/` output were synchronized.
- Structure at that commit: 10 phases, 21 migrations, 123 generated template entries,
  128 scaffolder tests, 68 robustness tests, and 13 stress assertions.

## imsg evaluation

The evaluator ran against committed `imsg-mcp` revision
`30d0ea41ec046bc314393fddf9151da5c7859288`.

The safe profile changed no tracked files, generated only `RETROFIT.md` and
`skills/imsg/SKILL.md`, and passed install, lint, typecheck, test, and build.
Legacy preserve/force runs demonstrated why target-profile gating was needed.

The retained report bundle was at `/tmp/imsg-scaffold-eval-final-20260727`.
**It no longer exists** (verified 2026-08-09) — `/tmp` was cleared. This is also
why `AGENTS.md` mandates checked-in ExecPlans rather than external files. The
temporary clone was deleted because `--keep` was not used. No imsg-specific
monorepo conversion exists; use the tracked `example/` directory as the full
fresh-scaffold reference.

## Harness-engineering pass (2026-07-29)

After `ef3809b`, a docs/harness pass applied the practices from
[OpenAI's harness-engineering article](https://openai.com/index/harness-engineering/):

- Root `AGENTS.md` slimmed to a navigational map; deep scaffolder guidance
  moved to the scoped `apps/scaffolder/AGENTS.md` (with `CLAUDE.md` symlink).
- `docs/README.md` indexes all docs with read-when guidance and marks which
  files are lib-mirrored golden output.
- `docs/plans/README.md` establishes the checked-in ExecPlan convention.
- `scripts/check-docs-links.mjs` (`pnpm check:docs`) mechanically enforces
  relative-link integrity, agent-file symlinks, and docs-index coverage; wired
  into `pnpm verify` and CI after the Lint step.

## Next decision, not next implementation

**Current next task (2026-08-09, user-directed): the DEFERRED #16 split — 16a/16b.**
The user's framing, preserve it: *this is one of the most important parts,
because it will surface a lot of fixes and improvements to the published
packages — get them as good as possible before they are consumed everywhere.*
Concretely: rewrite `DEFERRED.md` #16 as 16a (kit-side, OURS) / 16b (EQStack
adoption, THEIRS — never touch that repo); execute 16a's unblocked subset
(logger file-write opt-out, sync `writeStderrLine` + stderr mirroring,
`redactValue`/`redactString` — the logger has none and imsg logs failure
payloads verbatim, default shutdown diagnostics). Items in 16a that need
EQStack-side agreement stay deferred: the theme model (flat `Theme extends
Palette` vs nested), `useVimKeys` double-dispatch — and note that 16a's
"replace `runRepl` with imsg's queue-based loop" needs RE-EVALUATION first:
PR #19 fixed the REPL's real defects and pinned its behaviour with 20
contract tests, so the replacement's remaining rationale is the recursive
`rl.question` EOF race, not missing features. Any 16a work that changes
published packages should batch into as few releases as possible (every
release currently strands `example/` — DEFERRED #22 — and grows the caret
chains — DEFERRED #20).

The older landing decisions below are retained for history:

0. **DONE (2026-08-08): the kits are published and CI-releasable.**
   `@george43g/cli-kit@0.1.0` and `@george43g/tui-kit@0.1.0` are on npm; tags
   `cli-kit-v0.1.0` / `tui-kit-v0.1.0` point at `cb21bea`; Trusted Publishers
   are configured for both (`npm trust github … --file release-packages.yml
   --allow-publish`). robustness returned `E409` — it already had one from the
   original web-UI setup, which is the expected "already configured" response.

   The publish chain had to run in the user's own terminal: npm 2FA blocks it
   at three points and Claude Code's `!` prefix is not an interactive TTY
   either (field-note 31). Chain the publishes and `npm trust` calls with `&&`
   in one block so a single browser roundtrip covers all of them.
1. Re-read this file, `docs/PROJECT_STATE.md`, `AGENTS.md`, and the findings
   ledger. Confirm `git status --short --branch`.
2. Push — DONE (2026-08-03): everything is on `origin/main` via PR #1;
   `apps/mcpsync` landed with it (npm publish deferred to manual dispatch).
3. Publish robustness — DONE. `0.1.0` was the initial user-run local publish;
   `0.1.1` published 2026-07-31 via `release-packages.yml` (npm OIDC trusted
   publishing, no `NPM_TOKEN`). Getting the CI pipeline green took three
   fixes, all landed: pin `@semantic-release/npm` to v13 via root
   `pnpm.overrides` (v12 has no OIDC support — see field-notes 14/15); remove
   `registry-url` from `setup-node` (it shadows OIDC auth — field-note 13);
   remove the npm `workspaces` field from the root `package.json` (it made
   `npm version` choke on pnpm `workspace:*` — field-note 18). `0.1.1` carries
   npm's registry signature but NOT a build-provenance attestation — trusted
   publishing did not emit provenance on its own (field-note 19), so
   `NPM_CONFIG_PROVENANCE=true` was added to the release step to request it.
   **That setting was REMOVED on 2026-08-08 before it ever ran**: provenance is
   unavailable from a private source repo and would have returned 422, failing
   the release rather than skipping attestation (field-note 23). Packages keep
   the registry signature; revisit only if this repo goes public.
4. DONE 2026-08-09 — superseded by full de-vendoring. `--runtime-source` no
   longer exists; generated repos always depend on the published packages.
5. Deferred: the *generated* repo's disabled-by-default `release.yml` still
   can't publish a root/package carrying `workspace:*` deps via plain-npm
   tooling (field-note 18); a pnpm-aware generated release flow is unbuilt.

## Safety boundaries

- Do not reset, clean, checkout, or regenerate destructively before reviewing
  and preserving the current diff.
- Do not assume an untracked file is disposable.
- Do not push, publish, enable semantic release, or flip runtime defaults
  without fresh explicit authorization.
- Do not bundle deferred breaking dependency majors into this landing.
- Fresh scaffolds remain pnpm-only.
- Existing npm/Bun detection supports safe documentation, not full fresh
  scaffold generation.

## Authoritative continuation files

- [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md) — exhaustive history, evidence,
  dependency state, and deferred work
- [docs/scaffolder-cli/retrofit-findings.md](docs/scaffolder-cli/retrofit-findings.md)
  — resolved findings and safety invariants
- [docs/SHARED_RUNTIME.md](docs/SHARED_RUNTIME.md) — source versus registry
  runtime design
- [docs/NATIVE_SCAFFOLDERS.md](docs/NATIVE_SCAFFOLDERS.md) — native generator
  boundary
- [docs/scaffolder-cli/evaluations/imsg-mcp-2026-07.md](docs/scaffolder-cli/evaluations/imsg-mcp-2026-07.md)
  — real-repository evaluation
- [skills/mcp-starter-architect/SKILL.md](skills/mcp-starter-architect/SKILL.md)
  — scaffolder/retrofit operating guide
- [skills/cli-artifacts/SKILL.md](skills/cli-artifacts/SKILL.md)
- [skills/workspace-scaffolding/SKILL.md](skills/workspace-scaffolding/SKILL.md)

The former external plan at
`/Users/george/.claude/plans/2-programmable-mcp-scaffolder.md` is absent. Do not
depend on it.
