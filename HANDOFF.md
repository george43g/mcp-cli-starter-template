# Current Handoff

Last refreshed: 2026-07-29 (Australia/Melbourne)

This is the front door for a fresh agent. Read
[docs/PROJECT_STATE.md](docs/PROJECT_STATE.md) for the exhaustive history,
verification matrix, dependency decisions, and deferred work.

## State at handoff

| Item | Current state |
| --- | --- |
| Repository | `/Users/george/repos/mcp-cli-starter-template` |
| Branch | `main` |
| Local HEAD | `8e6fce9a3a680bbb0d12f901dcbfbda7fd98e003` |
| `origin/main` | `e431399e9be02b0fefd7db3cf14a23a9f0e87d7b` |
| Ahead/behind | ahead 1, behind 0 |
| Remote check | `git fetch --prune` succeeded on 2026-07-29 |
| Working tree | 87 modified tracked files and 42 untracked files |
| Push state | local commit and working-tree implementation are not pushed |
| Package state | `@george43g/robustness` returned npm E404 on 2026-07-29 |
| Runtime default | `source`; registry mode is staged but not the default |

The 87-file diff stat is 3,201 insertions and 1,201 deletions. That stat excludes
the 42 untracked files. The changes are intentional work from this thread and
earlier resumed sessions; do not discard or overwrite them.

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

## What the uncommitted implementation contains

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
- Current structure: 12 phases, 25 migrations, 172 generated template entries,
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

## Next decision, not next implementation

The next agent should not begin another feature sweep by default. The next
decision is how to land the verified work:

1. Re-read this file, `docs/PROJECT_STATE.md`, `AGENTS.md`, and the findings
   ledger.
2. Confirm `git status --short --branch` and inspect the full diff, including
   untracked files.
3. Decide whether the working tree should be committed as one coherent change
   or carefully split. If split, rerun verification after each generated
   surface is staged; canonical/lib/example files are interdependent.
4. Commit only after explicit user direction.
5. Push only after explicit user direction.
6. Treat robustness publication as a separate explicit release action.
7. After publication, run a clean external registry consumer before considering
   `runtime-source=registry` as the default.

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
