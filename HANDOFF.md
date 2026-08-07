# Current Handoff

Last refreshed: 2026-08-05 (Australia/Melbourne)

This is the front door for a fresh agent. Read
[docs/PROJECT_STATE.md](docs/PROJECT_STATE.md) for the exhaustive history,
verification matrix, dependency decisions, and deferred work.

## State at handoff

| Item | Current state |
| --- | --- |
| Repository | `/Users/george/repos/mcp-cli-starter-template` |
| Branch | `main` |
| `origin/main` | `9d90a2c` — merge of PR #3 (mcpsync deferred-items) atop PR #2 `95f6c03`; CI green |
| Ahead/behind | in sync |
| Local commits | none |
| Remote check | fetch + push succeeded on 2026-08-03 |
| Working tree | clean |
| Push state | everything pushed; `feat/mcpsync-tool` + `feat/scaffold-harness-layer` deleted after merge |
| mcpsync | `apps/mcpsync` landed (5 stages + audit + publish prep); npm publish DEFERRED — release job is `workflow_dispatch`-only; local global bin installed via `pnpm add -g`. Desktop write-guard merged (`95f6c03`, PR #2). Round 2026-08-05 merged (`9d90a2c`, PR #3): 3 life-stack findings resolved + `imsg-mcp`→`EQStack` doc rename. Home decision REVERSED same session → relocate mcpsync to life-stack after publishing the kits (DEFERRED #10; import-as-library retracted for an optional `npx` shell-out). (see [docs/plans/2026-08-mcpsync-overview.md](docs/plans/2026-08-mcpsync-overview.md)) |
| Package state | `@george43g/robustness@0.1.1` published to npm on 2026-07-31 via the CI OIDC pipeline (0.1.0 was the earlier user-run local publish); tags `robustness-v0.1.0` + `robustness-v0.1.1`; GitHub release `robustness-v0.1.1` |
| Release pipeline | `.github/workflows/release-packages.yml` PROVEN end-to-end: full verify matrix → npm OIDC trusted publishing (no `NPM_TOKEN`) → tag + CHANGELOG + GitHub release → `[skip ci]` bump commit (loop-safe, confirmed no re-trigger) |
| Runtime default | `source`; registry mode is staged but not the default |

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

- `packages/robustness` is prepared as public
  `@george43g/robustness@0.1.0`.
- It exposes configurable `createWatchdog()` and
  `createShutdownController()` factories while preserving convenience APIs.
- A packed standalone-consumer smoke and registry-mode generated-consumer smoke
  both pass.
- `.github/workflows/release-packages.yml` is manual and defaults to
  `publish=false`.
- Fresh generation supports `--runtime-source source|registry`.

Do not publish or flip the default to registry as part of an unrelated Git
operation. Publication, clean public-registry verification, and the default
flip are three separate decisions.

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
- Structure at that commit: 12 phases, 25 migrations, 172 generated template entries,
  128 scaffolder tests, 68 robustness tests, and 13 stress assertions.

## imsg evaluation

The evaluator ran against committed `imsg-mcp` revision
`30d0ea41ec046bc314393fddf9151da5c7859288`.

The safe profile changed no tracked files, generated only `RETROFIT.md` and
`skills/imsg/SKILL.md`, and passed install, lint, typecheck, test, and build.
Legacy preserve/force runs demonstrated why target-profile gating was needed.

The retained report bundle still exists at:

```text
/tmp/imsg-scaffold-eval-final-20260727
```

It contains `evaluation.json`, logs, and an empty safe-profile patch. The
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

The next agent should not begin another feature sweep by default. The
remaining landing decisions are:

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
   `NPM_CONFIG_PROVENANCE=true` was added to the release step to request it;
   that attaches from the NEXT release onward (unverified until then).
4. Publication done + clean external registry consumer already passed, so
   flipping `runtime-source=registry` as the fresh-scaffold default is
   unblocked — but it remains a deliberate, separate decision, not automatic.
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
