# Current Handoff

Last refreshed: 2026-08-14 (Australia/Melbourne). The work it describes landed
2026-08-10; nothing has changed on `main` since.

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
| Last landed | **Two batches, both 2026-08-10.** (1) **Backlog, PRs #32–#43** — Stages 1–5 of a 7-stage plan plus 2 of 3 tail items. Closed: #13, #18, #20, #23, #27 (2 of 4), #29, #30, #31, #32, #2. Decided: #19 (→ #36), #34. Reframed: #3. New: #33–#36. Deferred by the user: #5. (2) **Consumer round-trip, PRs #45–#48** — three kit defects reported by a consumer, fixed and released as patches; the release-token guard moved onto the publishing path and re-keyed on bot identity; the release jobs given mise. New: #37. **Read "The 2026-08-10 batch" below before anything else — four shipped surfaces turned out never to have worked, and two unplanned majors were published.** |
| mcpsync | `apps/mcpsync` landed (5 stages + audit + publish prep); npm publish DEFERRED — release job is `workflow_dispatch`-only; local global bin installed via `pnpm add -g`. Desktop write-guard merged (`95f6c03`, PR #2). Round 2026-08-05 merged (`9d90a2c`, PR #3): 3 life-stack findings resolved + `imsg-mcp`→`EQStack` doc rename. Home decision REVERSED same session → relocate mcpsync to life-stack after publishing the kits (DEFERRED #10; import-as-library retracted for an optional `npx` shell-out). (see [docs/plans/2026-08-mcpsync-overview.md](docs/plans/2026-08-mcpsync-overview.md)) |
| Package state | Published: **`@george43g/robustness@0.8.0`**, **`@george43g/cli-kit@2.0.1`**, **`@george43g/tui-kit@0.4.1`**, **`@george43g/secret-store@0.2.2`** (verified against npm 2026-08-16; re-verify with `npm view`, never from this table — see the hand-carried-number rule below). robustness 0.8.0 = `getShutdownCause`/`noteShutdownCause` + `WatchdogState.memorySampled`, both requested by the eqstack session and verified against the published tarball, not the working tree. The two `.1` patches carry the consumer-reported fixes. **cli-kit's version is an accident twice over and must not be "corrected"** — see #34 and #35. It was planned as 0.4.0; a `!` marker took it to 1.0.0 (semantic-release maps any breaking change to a major with no 0.x clamp), then a **docs-only** commit whose PROSE spelled the footer token took it to 2.0.0, whose `dist/` is byte-identical to 1.0.0. Both immutable. A 3.0.0 renumber would be a third breaking bump for zero API change — up-bank argued this independently and it is recorded. Consumers on `^1.0.0` are unaffected; caret does not cross a major. Prior defects still worth knowing: robustness 0.3.0 + secret-store 0.2.0 cut by a `feat(vitest-config):` commit touching their directories (type read against PATHS, scope ignored); cli-kit 0.3.1 a PATCH carrying four new APIs. `@george43g/mcpsync` remains bootstrap-pending (`workflow_dispatch`-only). |
| Release pipeline | `.github/workflows/release-packages.yml` PROVEN end-to-end: full verify matrix → npm OIDC trusted publishing (no `NPM_TOKEN`) → tag + CHANGELOG + GitHub release → `[skip ci]` bump commit (loop-safe, confirmed no re-trigger). Now five chained jobs (robustness → cli-kit → tui-kit → secret-store → mcpsync), serialized because each pushes a bump commit. **Build provenance is deliberately OFF** — it requires a public source repo and this one is private; requesting it 422s the publish (field-note 23, which supersedes 19).  **New 2026-08-09 (DEFERRED #22):** the `secret-store` job — the last to run on a push, since `mcpsync` is dispatch-only — regenerates `example/` and commits it, so a release no longer leaves the tracked output stale for the next PR to trip over. Proven on its first two real runs. It passes `--build` because `pnpm verify` builds the scaffolder BEFORE the bump, and `git pull --rebase` before pushing because `main` is unprotected. |
| Runtime default | **Registry only.** `--runtime-source` was REMOVED — there is no source-vendoring mode. Generated repos depend on the four published packages; ranges are DERIVED from `packages/*/package.json` at build time into `src/generated/published-versions.ts`, never hand-written. `mcp-kit`, `shared-types` and the three tool-config packages are still generated as source. |

On 2026-07-29 the user authorized committing the verified working tree. The
previously uncommitted implementation (87 modified + 42 untracked files,
3,201 insertions / 1,201 deletions) landed as
`ef3809b feat(scaffolder): target-profile retrofits, staged registry runtime, robustness 0.1.0 prep`.

## The 2026-08-10 batch — read this first

Eleven PRs (#32–#43) executing a 7-stage plan. Stages 1–5 are merged; Stage 6 is 2 of 3;
Stage 7 has not started and is blocked on the user.

### The finding that generalises: FOUR surfaces were shipping without ever having worked

Each reported success the entire time. This is now the first thing to test for, and it is why
several entries below say "reframed" rather than "fixed".

| Surface | Reported | Reality |
|---|---|---|
| `check-publishable-manifests` sibling ranges | passed | `if (!m) return true` waved through every comparator range — and hid a second defect nobody had recorded: `^1.2.0` admitted `1.1.9`, because the caret branch ignored the range's lower bound |
| Screenshots pipeline (#29) | success on every run | Never produced a file. `docs/screenshots/` held only `.gitkeep` |
| MCPB bundle (#3) | built a 36.4 MB artifact | The artifact does not run: `ERR_MODULE_NOT_FOUND: ajv` |
| `release-tokens` guard (#35) | passing on every PR | Not on the publishing path at all — `pull_request`-only against an **unprotected** `main`, so a direct push never met it. Then, once fixed, its bump-commit skip keyed on subject TEXT, which a human can type |

The fourth is the sharpest, because it was built *this session* as the fix for an earlier failure,
and it was described to three consumer sessions as closing the hole before anyone had checked that
it ran where it mattered. **A guard you wrote yourself is not exempt from this rule.**

Both of its defects were found by a consumer asking a question — and the second only surfaced
*because* the first was fixed and the fix was described. Explaining a mechanism out loud is a
cheap way to discover it is wrong.

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

**Guard**: `scripts/check-release-tokens.mjs`, in TWO places, because the first version was not on
the path that publishes (see "The guard was not on the path that publishes" below):

1. `ci.yml`, on `pull_request` — squash-merging makes the PR title and body the commit message, so
   this runs BEFORE the merge, while the version is still mutable.
2. `release-packages.yml`, as a gate every release job `needs:` — checks the REAL commit messages
   over the pushed range (`--range "$BEFORE".."$SHA"`). This is the one that matters; `main` is
   unprotected, so a direct push never opens a PR.

Its first test case is the real 2.0.0 commit message verbatim. Bot-authored bump commits are
skipped, keyed on `semantic-release-bot`'s **authorship** — not on the subject text, which anyone
can type (that was a second hole, found the same way). **Never spell the footer token in prose;
lowercase it.**

**What the guard does NOT cover, and cannot:** an under-classified breaking change published as a
minor or patch. No commit-message linter catches a break the author did not know about. That is the
dangerous class, it remains open, and the only mechanism that addresses it is DEFERRED **#37**.

Neither version is renumbered. A third bump for zero API change is worse than an unplanned number,
and the up-bank agent argued that independently.

### New checks, all wired into `pnpm verify` and CI

| Command | What it catches |
|---|---|
| `pnpm test:scripts` | Node's built-in runner over `scripts/**/*.test.mjs` — the repo scripts had NO tests before this |
| `pnpm check:registry-boundary` | A generated-app import of a kit API that is not in the released surface, compared against the package's git release TAG (no network) |
| `pnpm check:workflows` | `actionlint`, pinned in `mise.toml`, over all three workflow surfaces |
| `release-tokens` job, in BOTH `ci.yml` and `release-packages.yml` | Commit prose that would cut an unintended release. The second copy is the load-bearing one — it gates every release job and reads real commit messages, because `main` is unprotected and a direct push never opens a PR |

### Consumer upgrade status (all five polled, 2026-08-10)

The user's standing instruction: **tell every consumer to upgrade to the latest kits and report
breakage; if something needs an upstream fix, publish it and re-request the upgrade from
everyone.** Round-trips are expected — consumers should not absorb a kit defect locally.

All rows below are RESOLVED versions the consumer verified with `pnpm why`, not declared ranges and
not intent. Where a consumer said "unknown" it is recorded as unknown.

| Repo | State |
|---|---|
| up-bank-mcp | **cli-kit 2.0.1 + tui-kit 0.4.1** (PR #18, commits UNSIGNED — 1Password SSH agent needs the user present; they flagged it rather than working around it, so do not call it "verified, signed, merged"). Previously 2.0.0 via PR #17 `899c706`, 205 tests. Was **stranded on 1.0.0** before the correction — the predicted starvation, confirmed live. Hit the rendered-output change: 8 of 12 snapshot tests, all chrome, zero result rows. PTY-verified `useVimKeys` in real tmux — `jjj` as one chunk moved 3 rows, `jjd` (mixed) moved 0 and forwarded whole. Correcting a stale claim of mine: only TWO of their four `.text` sites are cli-kit-typed (`cli-format.ts:11,15` alias + `:128-129` narrow). `cli.ts:34,42` and `tui/data/source.ts:191-200` sit behind THEIR dispatcher's closed `Array<{type:"text";text:string}>` and are immune to anything `ContentBlock` does. `formatUpResult` dispatches on their `structuredContent` shapes, so it is **portable, not deletable** — their expectation, explicitly not measured |
| EQStack (`imsg-mcp`) | **Adopted and shipped** — PR #81 → `imsg-mcp@1.21.1`, both local files deleted, their suites re-pointed at the kit. Proved the lift twice: comment-stripped code-identity diff (54 + 31 lines identical) and real `chat.db` emoji data, 6 strings × 4 widths, 0 width-violations, 0 broken surrogates. **Does NOT consume `useVimKeys`** (verified by grep — they run one mode-aware `useInput` router deliberately, since a second dispatcher is their `q`-in-recipient-name incident class), so the 0.4.1 patch does not affect them; staying on 0.4.0 until a routine bump. Their imports are `truncateToWidth`, `visualWidth`, `detectNerdFont`, `useMouse`, and the `theme` subpath |
| browser-tab-mcp | **Consumed and green on a branch, UNMERGED** — cli-kit `2.0.1`, robustness `0.7.0`, tui-kit `0.4.1`; 551 tests over 6 packages, `test:no-native`, build, stress 27/27. Blocked on a local commit-signing failure, nothing of ours. **Do not record as shipped until they say so.** Zero snapshots of any kind repo-wide, so zero exposure to the rendered-output change — despite having the MOST cli-kit surface of any consumer. Earlier they declined to treat my relayed "direct request from George" as authorization and surfaced it to him instead, which was correct |
| life-stack | **Landed** (`45ea71c`) after George confirmed directly: robustness `^0.6.0 → ^0.7.0` (os-fork-core, os-fork-control, os-fork-ctl), cli-kit `^0.3.1 → ^2.0.0` (os-fork-ctl). Typecheck 6/6, 140 tests, lint over 114 files, all green. **No breakage across both cli-kit majors** — their only imports are `buildProgram`, `color`, `printJson`, `resolveOutputMode`, so the `ToolCallResult` union never touched them |
| wm-stack | Confirmed zero dependency on any kit |

**Never hand-carry a version number to a consumer — cite the command instead.** Every one of the
five sessions above was told `cli-kit 1.0.0`; the accidental 2.0.0 published *between* those
messages and their installs, and nothing corrected them. life-stack caught it only because they ran
`npm view` instead of trusting the relay, and said so. A consumer who acts on a stale number pins
`^1.0.0`, which **cannot cross to 2.0.0** — stranding them one major behind while they believe they
are current. A relayed number is stale the moment the next release fires, and releases here fire on
push to `main`. Send `npm view @george43g/<pkg> version` and let them resolve it themselves.

### The round-trip paid for itself: three kit defects came back (2026-08-10)

browser-tab ran an adversarial stress pass of their TUI/CLI/REPL and returned three defects that
were **ours, not theirs** — none of which any of our own suites could see. All three are fixed, each
reproduced before being trusted, and each confirmed present in the PUBLISHED tarballs first:

| Defect | Where | Why our tests missed it |
|---|---|---|
| `useVimKeys` drops multi-character chunks, and `input >= "0" && input <= "9"` is a LEXICOGRAPHIC range so `"5j"` enters the count buffer and replays as a stale count | `tui-kit@0.4.0` `dist/hooks/useVimKeys.js:40` | The hook had **no test at all**. v8 scores a never-loaded file as 100% branches, so its untested half was reported as covered for its whole life |
| `runRepl` writes banner + prompt + readline's echo to stdout when piped, so `\| jq .` can never work | `cli-kit@2.0.0` `dist/repl.js` | A `PassThrough` is already non-TTY, so the suite ran the broken path — and every assertion used `toContain`, which leading noise does not disturb |
| `isCI()` treats `CI=false` as true (`Boolean("false")`) | `cli-kit@2.0.0` `dist/tty.js` | The suite only ever set `"true"`, so presence-vs-value was never discriminated |

The third is the sore one: the correct semantics were quoted verbatim in the Stage 2 plan
(`is-in-ci`: `key in env && env[key] !== '0' && env[key] !== 'false'`) and used to fix the
screenshots pipeline, **without noticing our own `isCI()` had the same bug**. Having a reference
implementation in hand is not the same as applying it.

Ink delivers a keystroke burst or paste as ONE `useInput` call — that is the root cause of the
first, and it is a trap for any future ink hook here.

**It is an ink bug class, not a `useVimKeys` bug.** EQStack read the fix, went looking, and found
BOTH defects in their own `apps/imsg-mcp/src/tui/App.tsx` router the same day — they had filed the
symptom ("`gg` ignored when both g's arrive in one chunk") as minor polish without connecting it to
keystroke loss. `tui-kit`'s README now carries the two greps that find it, because every hand-written
key router in every consumer is exposed.

**Never relax the fan-out to plain per-character dispatch.** It is restricted to owned keys, and
EQStack supplied the incident that justifies it from their own history: single keys bound to open /
write-to-Downloads / quit, so pasting a recipient name containing `q` quit the app. Passing
non-owned chunks through whole is what makes fanning out safe at all. Recorded in the hook's
docblock so it cannot be "simplified" away.

### Rendered output is not covered by semver — state it, do not rediscover it

`cli-kit@2.0.1`'s pipe-safety fix broke **8 of up-bank's 12 snapshot tests** as a PATCH: no API
change, no type error, nothing thrown. browser-tab named the class: **semver describes the API; a
snapshot test asserts on the rendering, which semver never promised to hold still.** It will recur
every time a rendering improves — including the image-descriptor line browser-tab asked for.

`cli-kit`'s README now carries it as a standing contract rather than a one-off note: *patches may
change rendered output; the results and meta footers are stable, the chrome is not.* That second
clause is a real promise, and up-bank's line-by-line audit of all 8 failures is the evidence —
every changed line was removed banner, removed prompt, or a stripped prefix; zero result rows and
zero footers moved.

**Exposure has a one-command answer, and it is NOT about surface area**: `rg -l "toMatchSnapshot"`.
browser-tab has the most cli-kit surface of any consumer and zero exposure; up-bank has less surface
and had 8 failures. What matters is only whether a consumer asserts on stdout as a blob.

### The guard was not on the path that publishes

`ci.yml`'s `release-tokens` job is `if: github.event_name == 'pull_request'`, and `main` is **not a
protected branch** (branch-protection API returns 404). So a direct push never opened a PR and never
met the check, and a merger can edit a squash commit's message at merge time — making the PR body a
*prediction* of the commit message. life-stack asked whether the guard was actually on the
publishing path, correctly flagging it as unknown rather than a finding. It was not.

Now fixed: `release-packages.yml` has its own `release-tokens` gate that every release job
`needs:`, checking the real commit messages via `--range "$BEFORE".."$SHA"`. Machine-generated
`chore(release): … [skip ci]` commits are skipped (their body quotes the triggering footer); both
markers are required so a hand-written subject is not a bypass.

**up-bank's caveat, which stands and is not fixed:** this guard constrains the token, so it prevents
spurious MAJORS — the observed class. It does nothing about the genuinely dangerous class, **an
under-classified breaking change published as a minor**, which a caret pulls in silently. No
instance has occurred. Their tripwire (recorded in their own repo): a third unplanned major, or any
one accidental minor carrying a real break, switches them to exact pins.

### Stage 7 — what is actually blocked

- **#10** — the destination is **NOT** open, but the move is now blocked on the life-stack
  session's answers, not on George. Four decisions were put to them 2026-08-18; **do not start
  deleting until Q1 (publish from life-stack / stay unpublished / do not move) is answered.**
  life-stack answered on 2026-08-18 with evidence: **(b) move but stay unpublished**,
  **(b) stop bundling cli-kit/tui-kit**, **`apps/mcpsync`**, **no accumulated bugs**.
  Recorded in #10 with their reasoning.

  **The one input still needed from George: should mcpsync be published, and soon?** If yes, do
  NOT move it — publishing from here needs only a bootstrap + a trusted-publisher entry against a
  workflow that already exists, whereas publishing from life-stack needs a pipeline built first.
  Also newly established: `@george43g/mcpsync` has **never been published** (E404), so there is no
  trusted publisher to migrate — and the sequence "publish here, then move" is the ONE ordering
  that forces a TP migration. Corrected in #10 as well: the "zero manifest changes" claim was
  false, and the removal checklist wrongly said the release job chains after `tui-kit` (it is
  `needs: secret-store` and already the tail — deleting it needs no re-chaining). `DEFERRED.md` #10 is titled "(to life-stack)" and its
  step 1 records life-stack as *verified* compatible: it already ships
  `packages/{tsconfig,vitest-config,biome-config}` under the same `@george43g/*` names, all
  private, so mcpsync's `workspace:*` devDeps resolve there with zero manifest changes. This line
  previously read "needs a destination repo", contradicting the entry it points at, and that
  wrong blocker was relayed to the user twice on 2026-08-16 before anyone re-read #10.
  **What IS open: who executes the arrival half.** The move spans two repos — removal here
  (release job, `PUBLISHABLE`, the `AGENTS.md` MCP-servers section, 6 plan docs, ~160 tests
  leaving the meta suite) and arrival in life-stack (place beside `opkeep`, rewrite `workspace:*`
  to published versions, wire its release job). That split needs the user's call, not the
  destination.
- **#12** — the repo rename needs the actual name; the plan deliberately left it a variable.

**Lesson, and it generalises:** a blocker recorded in the handoff outranked the backlog entry it
cited, and nobody re-read the entry for six days. When a handoff says "blocked on X", open the
item it links before repeating it to the user.

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
   only consumes published kits. Destination is decided — **life-stack**, verified compatible in
   #10 step 1. Blocked on: who executes the arrival half (see the Stage 7 note above). Before
   moving anything, write
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

Deliberately last: the consumer repos were mid-adoption of the kits, and moving the repo under them
while that settles is how references go stale silently. **That has now largely settled** — see the
consumer table above — but two repos (browser-tab, up-bank) are green on unmerged branches blocked
on their user's commit signing, so the rename should still wait for those to land.

**Then, in rough priority order:**

1. **#3 — the MCPB bundle does not run.** Promoted above #36: it is a *shipped artifact* that fails
   at `ERR_MODULE_NOT_FOUND`, not a missing feature. ~half a day, and it needs a
   runs-after-extraction assertion in CI or it silently recurs — it is one of the four surfaces
   above that reported success while never having worked.
2. **#36 — release-please for generated repos** (decided in #19).
3. **#37 — the consumer-side canary** (new). The only mechanism that addresses an under-classified
   breaking change, which the release-token guard structurally cannot catch. **Offered by up-bank,
   not accepted** — it would spend their user's compute, so it needs that user's agreement, not
   ours.
4. **#38** — the `example/` resync is skipped exactly when a release goes wrong: it lives at the
   end of the `secret-store` job, and `needs:` skips it on ANY upstream failure. Observed live
   2026-08-16 when a tui-kit test flake took the chain down. Needs `if: always()` on a standalone
   job. (#33 — readme-check counting test files as source — is RESOLVED, 2026-08-16.)
5. **#27's remaining two lifts** (`toYaml`, Prometheus metrics — still no warm consumer).

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

---

# Precompact checkpoint — 2026-08-21

**Where this section and any conversation summary disagree, THIS SECTION IS
CORRECT.** A summary optimises for narrative and is least reliable about what
did *not* happen. Check here before acting on a recalled claim.

## State

Repo **PUBLIC** since 2026-08-21, `robustness@0.9.0` published, **every PR
landed and none open** (#62, #63, #64, #66, #67, #68 merged; #61 closed as
superseded), `main` at `2e53d1d`. Nothing new published — no `packages/**` file changed
since 0.9.0, so the release workflow correctly never fired, which also means
the two release-pipeline changes in #67 are **merged but not yet exercised.**

## Constraints (verbatim, this session, George)

- *"you **work** for the consuming agents when it comes to them requesting
  updates, improvements etc... you just have to make sure you dont break
  something for another agent trying to please the requesting agent"* — already
  promoted into `AGENTS.md` conventions.
- On losing functionality to satisfy a default: *"you can always just export a
  method from a lib that **detects** scenario 2 and 3 and simply logs it and
  fires off a hook function that only the consumer can choose if they wired it
  up to do anything... so that way you dont have to lose functionality for
  anyone that may happen to rely on it."* Shipped as `WatchdogOptions.onBreach`.
- *"its a green light to preventing duplication in any case"* (CI per-OS work).
- Green light 2026-08-21, in one answer, to: **land the whole merge queue**;
  build **both** release-pipeline items (DEFERRED #38's `if: always()` resync
  and npm provenance); and **message the consumer sessions** about the tsx
  trap. All three are done — see Done.
- On going public: *"i think its okay to make them public for now... i can
  always make it private again before I release something big publicly - not
  perfect, but i dont think the stakes are that high at the moment"* — decided
  AFTER being shown the disclosure finding below. Do not re-litigate it.

## Done

- **Repo made public.** `gh api repos/george43g/mcp-cli-starter-template --jq
  .visibility` → `public`. Preceded by a secret scan across all 291 commits /
  899 files: no `.env`/`.pem`/`.key`/`.npmrc` ever committed; no known-prefix
  secrets (3 hits were fake fixtures in mcpsync's own secret-*detector* test);
  `.mcp.json` and `opencode.json` WERE committed historically but every version
  held only `${VAR}` placeholders; emails are GitHub-noreply and bots only.
- **Secret scanning + push protection enabled** — API returned
  `secret_scanning: enabled`, `secret_scanning_push_protection: enabled`.
- **`robustness@0.9.0` published** (`npm view` confirms). Adds the observe-only
  watchdog breach hook. Default path measured byte-identical to 0.8.1: no hook →
  kill as before; `"observe"` → `killReason=null`; throwing hook → fails closed.
- **#64 — the tsx signal defect, diagnosed and fixed** (merged, `77f4c6b`).
  Cause under Corrections. Fixed at three spawn sites' worth of surfaces;
  `scripts/stress-tui.ts` deliberately left on the tsx CLI with a comment
  saying why, since nothing there reads the child's exit status. Also carried
  the `example/` resync that made #61 redundant.
- **#66 — CI de-duplication** (merged, `1f10e02`), applied to BOTH this repo's
  `ci.yml` and the template's, which ships a two-OS matrix into every generated
  repo — where it IS billed, because a new repo from the template is private.
  **Measured on the merge run**, macOS job: 14 steps skipped, 4 run (install,
  build, `pnpm test`, stress), **83s down from 173s**. `976707e` on
  `ci/stop-duplicating-work-per-os` — which deleted the leg outright — was
  ABANDONED, not merged; its rationale is the claim disproved below.
- **#67 — both release-pipeline items** (merged, `1bb5190`). DEFERRED #38's
  resync is now its own `resync-example` job guarded by
  `!cancelled() && github.event_name == 'push'` (not `always()`: any `if:` that
  omits `success()` breaks the skip-cascade, and this one additionally declines
  to push into a cancelled run). npm provenance is ON — five
  `NPM_CONFIG_PROVENANCE: "true"` entries, never `publishConfig`. **Neither is
  exercised until a real release runs.**
- **#62 merged** (`29a826a`) after a hand-resolved rebase: it conflicted with
  #64 in `http-lifecycle.test.ts` on all three surfaces, resolved by re-applying
  its `extraEnv` + observe-only test onto #64's rewritten file. `pnpm verify`
  exit 0 in its worktree, 37 app tests. Worktree removed.
- **#63 merged** (`4e46ae2`) — DEFERRED #39 (logger reaper), #38 promoted, and
  a new **#40** recording that the stress harness is 15 assertions while 19
  prose sites still say 13.
- **#68 — the same tsx defect in the RUNTIME path** (merged, `2e53d1d`), which
  #64 did NOT cover. `scripts/mcp-dev-proxy.ts` — shipped into every generated
  repo — restarted its child by SIGTERM through the tsx CLI on every source
  change, so a routine save on a busy server was a SIGKILL, and the generated
  AGENTS.md rule "file without a `shutdown` marker = crash" turned that into
  manufactured crash evidence. Found by eqstack, who noticed four repos on this
  machine running it — including this session's own dev server.

  **Killing the process group does not save you**, which is the finding worth
  keeping because it is a plausible wrong conclusion that two of us nearly
  drew: the wrapper is in the same group and escalates anyway. Reproduced here
  in the exact `shell: true` + `detached: true` + `process.kill(-pid)` shape —
  `.bin/tsx` busy → `code=143`, handler never ran; `--import` busy → `code=0`,
  handler ran.

  The runner moved INSIDE the proxy; callers pass `MCP_DEV_ENTRY` only.
  Propagated to `.mcp.json` (+ regenerated `opencode.json` via `mcpsync sync`),
  the three `11-agent-files/lib` config templates, and `add-mcp-app`.
- **A startup warning for the case a default cannot fix.** up-bank-mcp's point,
  taken as code rather than prose: every repo scaffolded earlier pins
  `MCP_DEV_CMD` in its host config, an override beats the default by
  construction, and those repos stay broken *while looking fixed*. The proxy now
  warns when it sees a tsx-shaped override. Verified it discriminates: warns on
  `pnpm tsx …`, silent on a `node --import` override, silent when unset.
- **`tests/tsx-spawn-inventory.test.ts`** — fails on any NEW `.bin/tsx` call
  site AND on a stale exemption, so the allowlist cannot rot into decoration.
  Verified red in both directions before being trusted. Two entries remain with
  reasons: `stress-tui.ts` and `repl-pipe.test.ts`.
- **Four consumer sessions told about the tsx trap** — eqstack, up-bank-mcp,
  browser-tab-mcp, life-stack — with the de-minified source, the two-row
  reproduction and the one-line fix. **browser-tab-mcp confirmed VERIFIED YES
  in one grep** (`apps/browser-tab-mcp/scripts/stress-tui.ts:29` spawns,
  `:83` kills) and reported that it retroactively explains a failure they had
  already written up as "probably a shutdown-trap race": their TUI soak exits
  143 with no handler at heavy scale and 0 at default scale, which is the 30ms
  ack window exactly. Recorded in their PR #74.

## Open

- ~~The two #67 changes are merged but untested in anger.~~ **BOTH PROVEN
  2026-08-21** on the `robustness@0.10.0` release run (`32404112566`,
  `completed/success`). npm reports a real attestation —
  `provenance: { predicateType: "https://slsa.dev/provenance/v1" }` — the first
  this repo has ever produced. The relocated `resync-example` job ran and
  committed `chore(example): resync generated output after release`, taking
  `example/` to `^0.10.0`. DEFERRED #38's fix works. The original entry read:
- ~~**The two #67 changes are merged but UNTESTED IN ANGER.**~~ Neither the
  `resync-example` job nor provenance runs until a `packages/**` change reaches
  `main`. Provenance is the one with teeth: it 422s and **fails the publish
  outright** if the repo is private or `repository.url` mismatches. Both
  preconditions verified at merge time — repo public, five manifests
  case-exact, and `check-publishable-manifests.mjs` holds the second one
  mechanically — but the first real release is the actual test. DEFERRED #38
  also asked for a deliberate failed-chain observation; that was **not** done,
  and the evidence is three organic occurrences rather than an induced one.
- **DEFERRED #40** — 19 prose sites say the stress harness has 13 assertions;
  it has 15. Recorded, not swept. `docs/PROJECT_STATE.md:287` must stay at 13:
  it is a dated record of a run that really did have 13.
- **DEFERRED #39** (logger rotates but never reaps) — recorded, not implemented.
- **`docs/PROJECT_STATE.md` is stale in two ways** and was left alone
  deliberately: its registry table says `robustness@0.8.0` (published is 0.9.0)
  and it still records provenance as removed. The file warns against trusting
  its own version numbers; the provenance line is a decision record that is now
  wrong. Not fixed here to avoid a conflict with this checkpoint's own edits.
- **mcpsync migration** — life-stack answered all four questions with evidence
  (move-but-unpublished / stop bundling / `apps/mcpsync` / no accumulated bugs).
  Recorded in #10. Blocked on George; see below.

## Corrections

- **"Wiping `docs/` from history would remove the private-repo references" is
  FALSE.** They live in `packages/` (39 files), `apps/` (24), `docs/` (19),
  `scripts/` (4) — mostly field-notes explaining why a fix exists. Worse,
  `docs/` is byte-mirrored into `10-docs-readme/lib/docs` and shipped into every
  generated repo, so deleting it would break the product. History rewriting was
  considered and NOT done.
- **The macOS divergence was real, and BOTH of my earlier diagnoses were
  wrong. Root cause now proven.** `node_modules/.bin/tsx` does not run your
  code — it spawns a **grandchild** and relays signals to it on a **30ms
  budget** (tsx 4.23.1, `dist/cli.mjs`, `relaySignalToChild`): forward the
  signal, wait 30ms for the child to report over IPC that it arrived, and if
  that report is late, `kill("SIGKILL")` and `process.exit(128 + signum)`.
  SIGKILL cannot be trapped, so no handler runs and no marker is ever written.
  Reproduced app-independently with a 5-line script that traps SIGTERM and
  writes a file:

  | child event loop | wrapper exit | trap handler |
  |---|---|---|
  | idle | `code=0 signal=null` | ran |
  | busy (200ms blocks) | `code=143 signal=null` | **never ran** |

  The busy row is the CI observation verbatim, including `code=143 signal=null`
  where a genuinely untrapped signal reports `code=null signal=SIGTERM`. With
  `node --import <tsx loader>` the same script survives a 600ms-blocked loop.
  **The app was always correct; the harness was killing it.** Neither earlier
  "fix" could have worked, because both left tsx in the signal path.

  Two consequences for the CI-matrix argument, in opposite directions: the
  second leg DID find a real defect — one shipped into every generated repo —
  which is a point in favour of keeping it; and the defect is load-dependent
  rather than platform-specific, so what earns its place is a *differently
  loaded* runner, not a Darwin one. Since the repo is public the leg is free,
  so it stays, trimmed to the platform surface.
- **The template's `ci.yml` is NOT mirrored from the root `ci.yml`.**
  `golden.test.ts:65` maps `12-ci-release/lib/.github/workflows/ci.yml` →
  `example/.github/workflows/ci.yml`. They are legitimately different (template
  uses `pnpm test`, not `test:coverage`; a filtered `check:usage`). I clobbered
  it with `cp` and reverted; do not "sync" them.

## Traps

- **A CHECK THAT CANNOT SUCCEED RETURNS NOTHING, AND NOTHING READS AS
  ALL-CLEAR.** life-stack's framing, earned against a check I wrote and shipped
  to four sessions: `grep -rn 'bin/tsx' --include='*.ts' tests scripts` returns
  zero on a repo whose tsx invocations live in `mise.toml` or an extensionless
  `bin/` wrapper — and zero is exactly what "unaffected" looks like. Worse, the
  obvious repair `| grep -v node_modules` filters LINES, so it drops every real
  call site, which are all written as path strings CONTAINING `node_modules`
  (`resolve(ROOT, "../../node_modules/.bin/tsx")`). Both forms return a clean
  bill of health on this very repo, and life-stack then verified that the second
  form returns zero on THEIRS — the error reproduced inside the correction to
  the error. Their distinction is the precise one: `--exclude-dir` prunes the
  SEARCH SPACE before matching, a trailing `grep -v` post-filters RESULT LINES
  and is therefore defeated by any source line that quotes the path it excludes.
  Those are not two spellings of one idea.

  **A third flavour, from eqstack, and the nastiest: the tool is not the tool
  you think it is.** Claude Code sessions install a shell FUNCTION shimming
  `grep` to an embedded ugrep with `--ignore-files`, which honours
  `.gitignore` — and generated MCP host configs are both the files people
  gitignore and the place `.bin/tsx` invocations live. `type grep` confirms the
  shim in this session; the blast radius here is zero (checked: 18 files either
  way, nothing relevant is gitignored) but the mechanism is real. Use
  `command grep` to bypass it.

  Three independent filters, three silent zeros, one day. And eqstack found the
  hole in the rule itself: **a positive control must be shaped to fail if the
  SUSPECTED filter is active.** Re-running a second recursive sweep validates
  recursion, not the filter — it goes through the same shim. Against a
  gitignore-honouring tool the control is a direct file argument on a known
  hit, not another `-r`.

  **A filter argument is itself a claim about where the answer lives, and a
  wrong one returns zero rather than an error.** The habit that catches it, and
  it generalises well past grep: **when a check returns zero, re-run it in a
  shape known to return non-zero before believing the zero.** Same discipline as
  reading an effective config back off a running system rather than trusting the
  source that was supposed to produce it — assert the positive control appears,
  do not settle for the negative case failing.
- **NEVER SIGNAL A CHILD SPAWNED THROUGH `node_modules/.bin/tsx`.** It is a
  supervisor, not a runner: it SIGKILLs its grandchild when the child's IPC
  signal-ack misses a 30ms window, which a loaded runner misses routinely and
  an idle laptop never does. Use `node --import <tsx loader> <entry>` — one
  process, so the signal reaches your code and the child IS the subject under
  test. Resolve the loader with `createRequire(import.meta.url).resolve("tsx")`
  so it depends on neither tsx's internal layout nor the child's cwd. **This
  applies to every consumer repo that tests signal handling under tsx** —
  EQStack, up-bank-mcp, browser-tab-mcp and life-stack all spawn MCP servers in
  tests; none has been told yet.
- **Asserting on a proxy for the event instead of the event — four times in one
  week**: a fixed 20ms flush (`useDevStats`), a registration position (shutdown
  marker), a wrapper's exit code, then that wrapper's exit *timing*. Each passed
  locally and failed on a loaded runner. The fourth is the instructive one: the
  proxy was not merely noisy, it was measuring a **different process**. Before
  polling harder, ask what the thing you are observing actually is.
- **Two agents in one checkout will collide.** A subagent switched branches
  while this session had uncommitted work; the commit landed on its branch and
  untangling cost a `reset --hard`. Give subagents a `git worktree`.
- **`cp` between canonical and `lib/` assumes a mirror that may not exist.**
  Check `LIB_TO_CANONICAL` before copying; some pairs are deliberately divergent.
- **`pnpm lint:fix` AFTER mirroring silently desyncs the mirror** — biome
  excludes `lib/`. Lint first, then copy.

## Tree

`main` at `2e53d1d`, working tree **clean**, no dirty paths, no worktrees
(`/private/tmp/wt-robustness-hook` removed after #62 landed). Only this
checkpoint branch is open.

Two remote branches are dead and can be deleted whenever convenient:
`ci/stop-duplicating-work-per-os` (`976707e`, superseded by #66 and never
PR'd) and `fix/resync-example-after-skipped-job` (#61, closed).

## Blocked on you

- **mcpsync: should it be published, and soon?** This is the single input that
  decides the migration. If YES → **do not move it**; publishing from here needs
  only a bootstrap `pnpm publish` + a trusted-publisher entry against a workflow
  that already exists. If NO/later → move to `apps/mcpsync` in life-stack, which
  has no release pipeline at all. `@george43g/mcpsync` has **never** been
  published (E404), so no trusted publisher exists anywhere to migrate.
- **DEFERRED #38** — implement the `if: always()` resync job? It edits the
  pipeline that publishes everything.
- **npm provenance** — now possible since the repo is public. Needs
  `NPM_CONFIG_PROVENANCE: "true"` per release step, and deliberately NOT in
  `publishConfig` (that also fires on local `pnpm publish`, which has no OIDC
  provider). Not done.

## Resume

**Nothing is blocked and nothing is mid-flight.** The queue is landed, the tree
is clean, and every item below is a choice rather than a continuation.

**The one thing to watch, unprompted, is the NEXT RELEASE RUN.** It is the
first exercise of both #67 changes, and provenance is the one that can fail
hard — a 422 at the publish step means either the repo went private or a
`repository.url` drifted. If that happens, the fix is to remove the five
`NPM_CONFIG_PROVENANCE: "true"` lines, not to debug semantic-release. The
`resync-example` job failing is comparatively benign: it means `example/` stays
stale and the next PR trips the sync check, which is the status quo ante.

Then, in rough priority order:

1. The three items under **Blocked on you** — mcpsync is the only one that
   gates other work.
2. **DEFERRED #40** (the 13-vs-15 assertion count) — cheap, and the durable
   version makes the harness assert its own case count so docs cannot drift
   again.
3. **DEFERRED #39** (logger rotates but never reaps) — matters more now that
   #62 shipped observe-only mode, which is the first feature that makes a
   process log steadily and unattended forever.
4. `docs/PROJECT_STATE.md` — its registry table and its provenance decision are
   both stale; see Open.

Consumer sessions are current and the round is closed out. All four were told
about the tsx trap and about all three defects in the check that shipped with
it. Outcomes: browser-tab-mcp affected and fixed (their PR #75); up-bank-mcp
affected and fixed (their PR #24 merged), and they contributed the group-kill
row plus confirmation on tsx **4.22.3**; eqstack affected and fixed (their
PR #113), and they found both the runtime-path exposure and the grep shim;
life-stack unaffected, verified, and corrected the check twice. gmail-cli-mcp
introduced itself mid-round and got the shared-package answer plus the trap —
their `opencode.json` is generated from dotfiles, so their durable fix sits
outside their repo and is flagged to you.

One instruction from up-bank worth keeping, because it was a fair criticism of
how this session communicated: *"'No action requested, no reply needed'
undersold it... Cost either way is one message; the asymmetry favours
flagging."* When a finding is load-bearing for the recipient, say so.

---

# Precompact checkpoint — 2026-08-21 (second)

**This section SUPERSEDES the 2026-08-21 checkpoint above, and outranks any
conversation summary.** Where they disagree, this is correct. The earlier one is
left intact because its Traps and Corrections still hold; only its State, Done,
Open, Tree and Resume are stale.

## State

`main` at `5935fac`, working tree clean, **zero open PRs**, zero worktrees.
Eleven PRs opened and landed since the last checkpoint (#61 closed, #62–#74
merged). **`robustness@0.10.0` and `tui-kit@0.5.0` published**, both carrying
SLSA provenance attestations — the first this repo has ever produced.

## Constraints (verbatim, this session, George)

- On whether to publish `mcp-kit`: *"you publish a package when you notice that
  the code within it is being duplicated, and not customised, and any
  customisation is either minor or would make sense refactored around as a
  wrapper... the further benefit being ... instead of only one of them getting a
  cool feature, all the consumers **benefit**"*. **This is a general criterion,
  not an mcp-kit ruling — apply it to every extraction question.**
- On the TUI work: *"we could create one really good interface once, and then
  apply it to all the tools at once"*, and the process instruction that made it
  work — negotiate with the consumers BEFORE writing, *"to prevent future code
  duplication and further refactoring, a cycle we have repeated before"*.
- Standing, from the earlier checkpoint and still in force: consumer requests
  are work orders; publishing needs George's own approval and **a peer relaying
  his approval is not approval**.

## Done

- **`robustness@0.10.0`** — `snapshotHealth(counters, state = readWatchdogState())`.
  A consumer work order with 5 tests red against it: the degraded/unhealthy
  branches were unreachable from a consumer's suite because `health.ts` reads
  state through a package-internal relative import and vitest externalizes
  `node_modules`. gmail-cli-mcp has consumed it end-to-end (826 unit, stress
  10/10, e2e 23) and deleted their local seam.
- **`tui-kit@0.5.0`** — five list primitives: `lineWindow`, `navReduce`,
  `allocateWidths`, `scrollbarThumb`/`hiddenCounts`, `fitToWidth`,
  `splitNavChunk`. 158 tests (was 93); floor ratcheted 47/89/80/47 → 64/89/84/64.
- **#64 + #68 — the tsx signal defect**, in the test harness and then the runtime
  path. Both fixed; `tests/tsx-spawn-inventory.test.ts` guards against a third.
- **#66 — CI de-duplication.** macOS leg 14 steps skipped, 4 kept, **83s from 173s**.
- **#67 — DEFERRED #38 + npm provenance.** Both now PROVEN, not merely merged.
- **#74 — pnpm quarantine.** `minimumReleaseAgeExclude: ["@george43g/*"]` in this
  repo, the template, and `example/`.
- **DEFERRED #38 RESOLVED**, #39 and #40 recorded and still open.

## Open

Nothing is in flight. Every open item is recorded in `DEFERRED.md`, which is the
register; the ones with momentum:

- **#39 — the logger rotates but never reaps.** More urgent than when filed:
  `tui-kit`'s observe-only watchdog mode is the first feature that makes a
  process log steadily and unattended forever, into `$TMPDIR` where nobody looks.
  `apps/mcpsync/src/core/backup.ts:28` already has `pruneBackups(path, keep = 5)`
  — this repo knows the pattern, it just never applied it to logs.
- **#40 — the stress harness is 15 assertions; 19 prose sites say 13.** The
  durable fix is to stop hardcoding it, not to sweep once.
- **mcp-kit's shape.** Not "should it publish" — George's criterion answers that
  once the shape is right. gmail-cli-mcp read the source and found **two contract
  conflicts**, which is the criterion FAILING today: handler context (mcp-kit
  assumes handlers close over deps; theirs need a per-session `ctx` rebuilt at
  runtime by `switch_account`) and text-envelope authorship (mcp-kit does
  `JSON.stringify`; theirs are hand-authored and are a wire contract their CLI
  renders and e2e asserts). Two additive seams would fix both — `context?: () =>
  TCtx`, and `handler` returning `{text?, structured}` defaulting to today's
  behaviour — plus `scopes?`/`scopeCheck?` and an async `onErrorResponse?`.
- **up-bank-mcp never answered the TUI survey.** Theirs is the domain most
  likely to break `lineWindow`: non-uniform row heights and date-grouping
  headers. Most likely source of a tui-kit 0.6.0.

## Corrections

- **Both of my earlier tsx diagnoses were wrong**, and the root cause is now
  proven: `node_modules/.bin/tsx` is a supervisor that runs your code as a
  GRANDCHILD and relays signals on a **30ms IPC-ack budget**, then SIGKILLs it.
  Killing the process GROUP does not help — the wrapper is in it. Reproduced
  app-independently and independently confirmed in four consumer repos.
- **"macOS never finds anything in 30+ runs" was wrong**, and it is why the
  macOS CI leg survived: it caught a defect shipped into every generated repo
  that ubuntu never surfaced. The correct generalisation is narrower than either
  version I gave browser-tab-mcp: **a differently-LOADED runner finds timing
  defects; a differently-PLATFORMED one is incidental.**
- **A consumer's `resolutionMode: lowest-direct` report did not reproduce and
  was NOT acted on.** They re-ran it and retracted with evidence. One cargo-cult
  config line avoided across five repos. **Do not add `resolutionMode: highest`
  anywhere.**

## Traps

- **A CHECK THAT CANNOT SUCCEED RETURNS NOTHING, AND NOTHING READS AS
  ALL-CLEAR.** Three independent instances in one day, all in the same grep:
  a `--include`/path filter that excluded every file that could match; a
  `| grep -v node_modules` that filters LINES and so drops the very lines being
  hunted (they are path strings containing `node_modules`); and Claude Code's
  shell shimming `grep` to a **gitignore-honouring ugrep**, so `command grep` is
  needed to bypass it. The rule, sharpened by eqstack: **a positive control must
  be shaped to fail if the SUSPECTED filter is active** — re-running the same
  recursive sweep validates recursion, not the filter.
- **This trap recurs inside the guards written to prevent it.** The
  `tsx-spawn-inventory` test asserted "no violations found", which is also what a
  broken scan reports; eqstack caught it and it now asserts the enumeration
  worked. Any guard whose only assertion is an absence needs a positive control.
- **A fix that changed nothing survives with a confident causal comment
  attached.** gmail's `resolutionMode` retraction and my two tsx misdiagnoses are
  the same failure: a plausible cause adopted while the real one was still
  unfound, then never re-tested once the real fix landed.
- **semantic-release reads commit type against the DIFF's paths, not the scope.**
  A `fix(scaffolder):` touching `packages/robustness/README.md` would have cut a
  robustness patch whose whole diff was prose. Split it; verified after merge
  that `docs(robustness):` published nothing.

## Tree

`main` at `5935fac`, clean, no worktrees, no open PRs, no stashes. Two abandoned
local-only branches exist and can be deleted freely: `ci/stop-duplicating-work-per-os`
(`976707e`, superseded by #66) and the remains of the closed #61.

## Blocked on you

- **mcpsync: should it be published, and soon?** Unchanged and still the single
  input that decides its migration. life-stack answered all four questions with
  evidence, recorded in DEFERRED #10.
- **The mcp-kit seams** — George deferred the decision pending negotiation with
  all four consumers. Three have now weighed in; up-bank has not.

## Resume

**Nothing is mid-flight.** Tree clean, no open PRs, no background tasks, nothing
staged.

The standing directive is *"keep going autonomously"*. In priority order:

1. **Chase up-bank-mcp's TUI survey reply** — the one consumer shape not folded
   in, and the one most likely to require a tui-kit 0.6.0.
2. **DEFERRED #39** (logger reaper), now the most consequential open item.
3. **The mcp-kit design round** — design the four seams against all four
   consumers' shapes, then take the publish question back to George with the
   criterion satisfied rather than worked around.
4. **DEFERRED #40**, cheap, and best done by making the harness assert its own
   case count so the docs cannot drift again.

**Watch on the next release run**: provenance is now ON, and it FAILS the
publish outright (422) if the repo ever goes private or a `repository.url`
drifts. If a publish dies there, the fix is to remove the five
`NPM_CONFIG_PROVENANCE` lines, not to debug semantic-release.

### Addendum, minutes after the above

**The pnpm quarantine fix (#74) is now confirmed by a real consumer, which the
section above could not claim.** When it was written the evidence was a scratch
probe here plus the reporter's own bisection; the fix was justified as
*forward-compatible* rather than as fixing something live, because pnpm 10.29.3
has the guard off by default.

gmail-cli-mcp then consumed `tui-kit@0.5.0` on pnpm 11 with
`minimumReleaseAgeExclude` in place, and the range **picked up the fresh publish
first try** (Gmail-MCP-Server `main` @ `37be062`). That closes the loop: the
exclude works in a real consumer against a genuinely fresh version, which is the
exact scenario the quarantine breaks and the one this fleet's
"report-a-gap-get-a-fix-published" workflow depends on.

Same message confirms the third consumer round-trip in a row completing the way
they are supposed to: they collapsed both call sites to `fitToWidth` and
**deleted their local `padToWidth`** — after the health seam and the tsx spawn
fix, the third time a consumer has deleted their own code rather than wrapping
ours. That is the criterion George stated for extraction actually being met, and
it is worth watching as the measure of whether a lift landed.
