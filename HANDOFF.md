# Current Handoff

Last refreshed: 2026-08-10 (Australia/Melbourne)

This is the front door for a fresh agent. Read
[docs/PROJECT_STATE.md](docs/PROJECT_STATE.md) for the exhaustive history,
verification matrix, dependency decisions, and deferred work.

## State at handoff

| Item | Current state |
| --- | --- |
| Repository | `/Users/george/repos/mcp-cli-starter-template` |
| Branch | `main` |
| `origin/main` | Last code-bearing merges: **PRs #26–#30** (REPL serial queue + exports checker; logger env prefix; records + replies; `example/` resync automation; deferred call sites), interleaved with `[skip ci]` release bumps and two BOT-authored `chore(example): resync generated output after release` commits — those are the new automation, not drift. Two things are deliberately NOT recorded here. (1) A literal SHA — this file cannot name the merge commit of the PR that writes it, so the field was always one docs-merge stale; use `git log --oneline -1 origin/main`. (2) A CI verdict — a records file written pre-merge cannot testify to a post-merge event; check `gh pr checks` instead. |
| Ahead/behind | in sync |
| Local commits | none |
| Remote check | fetch + push succeeded on 2026-08-09 |
| Working tree | clean |
| Push state | everything pushed; all merged branches deleted — `main` is the only branch on origin |
| Last landed | **Backlog batch, 2026-08-10 — PRs #32–#43.** Stages 1–5 of a 7-stage plan, plus 2 of 3 tail items. Closed: #13, #18, #20, #23, #27 (2 of 4), #29, #30, #31, #32, #2. Decided: #19 (→ ticket #36), #34. Reframed: #3. New: #33, #34, #35, #36. Deferred by the user: #5. **Read "The 2026-08-10 batch" below before anything else — three shipped surfaces turned out never to have worked, and two unplanned majors were published.** |
| mcpsync | `apps/mcpsync` landed (5 stages + audit + publish prep); npm publish DEFERRED — release job is `workflow_dispatch`-only; local global bin installed via `pnpm add -g`. Desktop write-guard merged (`95f6c03`, PR #2). Round 2026-08-05 merged (`9d90a2c`, PR #3): 3 life-stack findings resolved + `imsg-mcp`→`EQStack` doc rename. Home decision REVERSED same session → relocate mcpsync to life-stack after publishing the kits (DEFERRED #10; import-as-library retracted for an optional `npx` shell-out). (see [docs/plans/2026-08-mcpsync-overview.md](docs/plans/2026-08-mcpsync-overview.md)) |
| Package state | Published: **`@george43g/robustness@0.7.0`**, **`@george43g/cli-kit@2.0.0`**, **`@george43g/tui-kit@0.4.0`**, **`@george43g/secret-store@0.2.2`**. **cli-kit's version is an accident twice over and must not be "corrected"** — see #34 and #35. It was planned as 0.4.0; a `!` marker took it to 1.0.0 (semantic-release maps any breaking change to a major with no 0.x clamp), then a **docs-only** commit whose PROSE spelled the footer token took it to 2.0.0, whose `dist/` is byte-identical to 1.0.0. Both immutable. A 3.0.0 renumber would be a third breaking bump for zero API change — up-bank argued this independently and it is recorded. Consumers on `^1.0.0` are unaffected; caret does not cross a major. Prior defects still worth knowing: robustness 0.3.0 + secret-store 0.2.0 cut by a `feat(vitest-config):` commit touching their directories (type read against PATHS, scope ignored); cli-kit 0.3.1 a PATCH carrying four new APIs. `@george43g/mcpsync` remains bootstrap-pending (`workflow_dispatch`-only). |
| Release pipeline | `.github/workflows/release-packages.yml` PROVEN end-to-end: full verify matrix → npm OIDC trusted publishing (no `NPM_TOKEN`) → tag + CHANGELOG + GitHub release → `[skip ci]` bump commit (loop-safe, confirmed no re-trigger). Now five chained jobs (robustness → cli-kit → tui-kit → secret-store → mcpsync), serialized because each pushes a bump commit. **Build provenance is deliberately OFF** — it requires a public source repo and this one is private; requesting it 422s the publish (field-note 23, which supersedes 19).  **New 2026-08-09 (DEFERRED #22):** the `secret-store` job — the last to run on a push, since `mcpsync` is dispatch-only — regenerates `example/` and commits it, so a release no longer leaves the tracked output stale for the next PR to trip over. Proven on its first two real runs. It passes `--build` because `pnpm verify` builds the scaffolder BEFORE the bump, and `git pull --rebase` before pushing because `main` is unprotected. |
| Runtime default | **Registry only.** `--runtime-source` was REMOVED — there is no source-vendoring mode. Generated repos depend on the four published packages; ranges are DERIVED from `packages/*/package.json` at build time into `src/generated/published-versions.ts`, never hand-written. `mcp-kit`, `shared-types` and the three tool-config packages are still generated as source. |

On 2026-07-29 the user authorized committing the verified working tree. The
previously uncommitted implementation (87 modified + 42 untracked files,
3,201 insertions / 1,201 deletions) landed as
`ef3809b feat(scaffolder): target-profile retrofits, staged registry runtime, robustness 0.1.0 prep`.

## The 2026-08-10 batch — read this first

Eleven PRs (#32–#43) executing a 7-stage plan. Stages 1–5 are merged; Stage 6 is 2 of 3;
Stage 7 has not started and is blocked on the user.

### The finding that generalises: three surfaces were shipping without ever having worked

Each reported success the entire time. This is now the first thing to test for, and it is why
several entries below say "reframed" rather than "fixed".

| Surface | Reported | Reality |
|---|---|---|
| `check-publishable-manifests` sibling ranges | passed | `if (!m) return true` waved through every comparator range — and hid a second defect nobody had recorded: `^1.2.0` admitted `1.1.9`, because the caret branch ignored the range's lower bound |
| Screenshots pipeline (#29) | success on every run | Never produced a file. `docs/screenshots/` held only `.gitkeep` |
| MCPB bundle (#3) | built a 36.4 MB artifact | The artifact does not run: `ERR_MODULE_NOT_FOUND: ajv` |

**The mechanism in the last two is the same one**: `zip -r` follows symlinks, and a pnpm
`node_modules` is a symlink farm. And `vhs` exits 0 for a missing command, a blank TUI render, and
an unwritable output path alike — **`Wait+Screen@<timeout> /regex/` is the only assertion mechanism
vhs has.** Any tape without one asserts nothing.

### Two unplanned majors, and the guard that now prevents a third

Both from commit-message TEXT, not code:

1. **`cli-kit@1.0.0`** (planned 0.4.0) — a genuine `!` marker whose consequence on a 0.x package
   was not checked. `@semantic-release/commit-analyzer` maps any breaking change to a **major**
   with no 0.x clamp. Recorded as #34, now a settled policy: 0.x packages cut 1.0.0 on their first
   breaking change, no `releaseRules` clamp. The reasoning matters — staying on 0.x adds NO
   protection, because `^1.0.0` will not cross to 2.0.0 any more than `^0.3.1` crossed to 0.4.0.
   All 0.x buys is blocking additive minors, which is the case that does not need blocking.
2. **`cli-kit@2.0.0`** — a **`docs:`** commit whose body explained incident 1 and spelled the
   footer token while doing so. The analyzer reads that token anywhere in a body. `dist/` is
   byte-identical to 1.0.0. Recorded as #35.

**Guard**: `scripts/check-release-tokens.mjs` + the `release-tokens` CI job, gated on
`pull_request` because squash-merging makes the PR title and body the commit message — the check
has to run BEFORE the merge, since afterwards the version is immutable. Its first test case is the
real 2.0.0 commit message verbatim. **Never spell the footer token in prose; lowercase it.**

Neither version is renumbered. A third bump for zero API change is worse than an unplanned number,
and the up-bank agent argued that independently.

### New checks, all wired into `pnpm verify` and CI

| Command | What it catches |
|---|---|
| `pnpm test:scripts` | Node's built-in runner over `scripts/**/*.test.mjs` — the repo scripts had NO tests before this |
| `pnpm check:registry-boundary` | A generated-app import of a kit API that is not in the released surface, compared against the package's git release TAG (no network) |
| `pnpm check:workflows` | `actionlint`, pinned in `mise.toml`, over all three workflow surfaces |
| `release-tokens` CI job | Commit prose that would cut an unintended release |

### Consumer upgrade status (all five polled, 2026-08-10)

The user's standing instruction: **tell every consumer to upgrade to the latest kits and report
breakage; if something needs an upstream fix, publish it and re-request the upgrade from
everyone.** Round-trips are expected — consumers should not absorb a kit defect locally.

| Repo | State |
|---|---|
| up-bank-mcp | On all four latest. Zero rendered-output change, no `TokenBucket` throw, 192 tests + 12 stress. Nothing needed upstream |
| EQStack (`imsg-mcp`) | Deleted both lifted files and re-pointed THEIR suites at our implementation — 995 tests green. Strongest available evidence the #27 lift preserved semantics |
| browser-tab-mcp | Upgrade queued behind two of their own PRs; confirmed nothing runs `pnpm update --latest` |
| life-stack | Holding deliberately — correctly refuses to treat a peer relay as its user's approval, and is asking George directly |
| wm-stack | Confirmed zero dependency on any kit |

### Stage 7 is blocked on the user

- **#10** — relocating `apps/mcpsync` needs a destination repo.
- **#12** — the repo rename needs the actual name; the plan deliberately left it a variable.

### Also worth knowing

- `packages/build-config` is new, `private: true`, and **must never be published**. Vite `define`
  is compile-time substitution over BUNDLED modules; the apps mark `@george43g/*` external, so a
  published reader would be permanently unsubstituted and would degrade to a plausible fallback
  rather than erroring.
- The build stamp reports a commit count of **0** in a shallow checkout rather than the
  wrong-but-plausible `1` that naive counting gives. `fetch-depth: 0` is now set on the three
  workflows that lacked it.
- `#19` is decided — generated repos move to release-please, ticketed as **#36**. This repo's own
  `release-packages.yml` is untouched and proven.
- `#5` (vector-search demo) is **deferred by the user as an experiment**, with their own doubt
  recorded: they do not know why a vector DB was raised in this repo at all. Do not schedule it;
  remind them it exists.

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

**NEXT, and both need the user (2026-08-10): Stage 7.**

1. **#10 — relocate `apps/mcpsync` out of this repo.** 32 source files / 3,533 LOC plus 17 test
   files, ZERO code coupling to `packages/*`, `apps/scaffolder`, `example/` or `turbo.json` — it
   only consumes published kits. Blocked on: which repo it moves to. Before moving anything, write
   `apps/mcpsync/HANDOFF.md` capturing DEFERRED #9 in full so the gap travels with the app, then
   delete #9 from this repo. Removal checklist is in #10. **Two things easy to get wrong**: deleting
   the mcpsync release job re-tails the chain on `secret-store`, which is where the `example/`
   resync lives — verify the resync still fires; and mcpsync contributes ~160 tests to the meta
   suite, so update any doc quoting a total.
2. **#12 — the repo rename.** Blocked on the actual name. Touches `repository.url` in the five
   published manifests (npm compares it case-sensitively against the signing certificate),
   `REPO_URL` in `scripts/check-publishable-manifests.mjs`, ~40 relative doc links
   (`pnpm check:docs` is the gate), and needs `pnpm regen:example` afterwards. Do it when no
   release is in flight, and message all consumers when it lands.

Deliberately last: four consumer repos are mid-adoption of the kits, and moving the repo under
them while that settles is how references go stale silently.

**Then**: #36 (release-please for generated repos, decided in #19), #3 (the MCPB bundle does not
run — ~half a day, and it needs a runs-after-extraction assertion in CI or it recurs silently),
#27's remaining two lifts (`toYaml`, Prometheus metrics — still no warm consumer).

---


**DONE (2026-08-09): the DEFERRED #16 split — 16a/16b — merged as PR #21.** `DEFERRED.md` #16 is rewritten as 16a (kit-side,
OURS) / 16b (EQStack adoption, THEIRS — never touch that repo). 16a's
unblocked subset shipped in one batch: logger file-write opt-out
(`MCP_LOG_TO_FILE`/`setFileLogging`), sync `writeStderrLine` + stderr mirror
(`setStderrMirror`, wired in the example app's stdio branch), redaction
(`redactValue`/`redactString` lifted from voice-mcp + cycle guard, ON by
default with `MCP_LOG_REDACT`/`setLogRedaction` opt-out, plus `safeStringify`
hardening for circular/BigInt data), default shutdown diagnostic sink, the
#15 `unhandledRejection`-suppression residual (`exitOnUnhandledRejection`,
default true), and `useDevStats(visible)` in tui-kit (old gap 5 — including
`DevStatsPanel`, which shipped the OOM pattern itself). The "replace
`runRepl`" item was re-evaluated and CLOSED without action — PR #19 removed
its stated defects; trigger to reopen is a reproducible defect the current
loop cannot fix. Still deferred inside 16a pending EQStack agreement: theme
model, `useVimKeys` double-dispatch, and the ranked upstream candidates.
Shipped as robustness 0.5.0 + tui-kit 0.3.0; sibling ranges pre-widened with
`|| ^0.5.0` (DEFERRED #20 pattern).

**DONE (2026-08-09): the CJS `exports` fix — PR #22.** secret-store's first
real consumer reported `ERR_PACKAGE_PATH_NOT_EXPORTED` on `require()`;
reproduced against the published tarball. `exports` replaces `main` entirely,
and Node 24 resolves `require()` under the `require` condition first, which an
import-only map never answers — so require(esm) never engages. Fixed with a
trailing `"default"` (no CJS build) across **nine** manifests: all four
published packages, `mcp-kit`/`shared-types` (which ship as SOURCE into every
scaffolded repo), `mcpsync`, and two inline literals inside scaffolder
migrations that `regen:example` would not have carried. Enforced going
forward by `check-publishable-manifests.mjs` across every workspace package,
including a "`default` must be last" branch; both branches proven to fail
before being trusted. Shipped as the `.1` patches, verified by `require()`-ing
the published tarballs. PR #22 also wired the `setStderrMirror` call site
DEFERRED #23 had held back.

**Next task: pick from DEFERRED by trigger.** Ranked by evidence:
1. **#22 release-time `example/` resync — now the strongest candidate.** It
   was paid by hand THREE times in this session alone (after PR #19's four
   bumps, after 16a's two, after the exports patch's four). Each occurrence is
   a manual `regen:example` plus a PR, and the failure it causes surfaces on
   the next innocent PR. The fix — have the last release job run
   `pnpm regen:example` and include `example/` in its `[skip ci]` commit — was
   deliberately NOT done unilaterally because it edits the release pipeline;
   that is the owner's call, but the evidence now strongly favours it.
2. #18 build identity (with turbo hole (a) and the `--print` flag).
3. #23's remaining half — a fast local check that typechecks generated-app
   imports against PUBLISHED `.d.ts`, so the two-PR rule is not enforced only
   by a slow remote smoke.
4. #19 release-please question, #17 `regen:example` dedup, #20 comparator
   ranges. #10/#12 await the user.

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
