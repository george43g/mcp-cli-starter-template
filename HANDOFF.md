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

The repo is **PUBLIC** as of 2026-08-21, `robustness@0.9.0` is published, four
PRs are open, and one pushed branch has no PR yet.

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
- **CI matrix collapsed to one OS**, commit `976707e` on branch
  `ci/stop-duplicating-work-per-os`, pushed. **No PR opened yet.**

## Open

- **#61 is superseded by #64** and should be closed, not merged — #64's
  `regen:example` carries the same resync. Evidence: both modify
  `example/**/package.json` robustness range.
- **#64 is NOT fixed and must NOT be merged.** Verdict arrived after the first
  draft of this checkpoint. Its macOS leg fails at `d22dfce` — the commit that
  added polling — with the poll running its FULL 15s timeout (17104ms) and the
  marker never appearing, while the sibling test passed in 291ms in the same
  run. **A 15s poll that finds nothing is not a race.** On macOS the shutdown
  marker is genuinely never written when a `fetch` precedes the SIGTERM.
  UNVERIFIED hypothesis: the tsx wrapper dies at 143 and macOS tears down the
  process group, so the child never reaches its `exit` handler, whereas Linux
  orphans it and it completes. What would settle it: spawn the built `dist/`
  directly with `node`, removing the wrapper, and see if it survives.
  Note this may be a HARNESS artifact rather than a product defect — nothing in
  production wraps the server in tsx.
- **#62 and #63 open**, both needing a verdict. #63 was failing only because
  `example/` was stale on main.
- **`ci/stop-duplicating-work-per-os` pushed with no PR** — `gh pr list` shows
  only 61–64.
- **DEFERRED #38** (release chain skips the `example/` resync on any upstream
  failure) — observed 3 times, third time it blocked unrelated PR #63. Fix
  recorded in the entry; not implemented.
- **DEFERRED #39** (logger rotates but never reaps) — recorded, not implemented.
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
- **"macOS and Linux never diverged in 30+ CI runs" was overtaken by events,
  and my follow-up diagnosis was ALSO wrong.** A divergence appeared. I called
  it a timing race and shipped a poll; the poll then ran its full 15s timeout
  and still found nothing, which disproves the race. macOS is exposing a real
  behavioural difference, cause unproven — see the #64 entry under Open. So the
  honest position on the CI matrix is narrower than I first argued: the second
  leg found something the first did not, and whether that something is a
  product defect or an artifact of spawning through tsx is **not yet known.**
  The matrix collapse (`976707e`) was justified on cost and duplication, which
  still holds; it was NOT justified on "macOS never finds anything", which is
  now false.
- **The template's `ci.yml` is NOT mirrored from the root `ci.yml`.**
  `golden.test.ts:65` maps `12-ci-release/lib/.github/workflows/ci.yml` →
  `example/.github/workflows/ci.yml`. They are legitimately different (template
  uses `pnpm test`, not `test:coverage`; a filtered `check:usage`). I clobbered
  it with `cp` and reverted; do not "sync" them.

## Traps

- **Asserting on a proxy for the event instead of the event — four times in one
  week**: a fixed 20ms flush (`useDevStats`), a registration position (shutdown
  marker), a wrapper's exit code, then that wrapper's exit *timing*. Each passed
  locally and failed on a loaded runner. Poll for the observable the assertion
  names.
- **Two agents in one checkout will collide.** A subagent switched branches
  while this session had uncommitted work; the commit landed on its branch and
  untangling cost a `reset --hard`. Give subagents a `git worktree`.
- **`cp` between canonical and `lib/` assumes a mirror that may not exist.**
  Check `LIB_TO_CANONICAL` before copying; some pairs are deliberately divergent.
- **`pnpm lint:fix` AFTER mirroring silently desyncs the mirror** — biome
  excludes `lib/`. Lint first, then copy.

## Tree

`main` at `d7260ce`, working tree **clean**, no dirty paths.
A second worktree exists at `/private/tmp/wt-robustness-hook` on
`feat/http-observe-only-watchdog` (PR #62) — it belongs to a finished subagent;
`git worktree remove` it once #62 lands.

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

**Next action: diagnose #64's macOS failure by spawning the built `dist/` with
`node` instead of through the tsx wrapper** — that single change decides whether
this is a harness artifact or a real macOS shutdown defect, and everything else
waits on the answer. Do NOT merge #64 until it is understood; do not "fix" it by
loosening the assertion, which would bury the finding.

After that: open a PR for `ci/stop-duplicating-work-per-os` (`976707e`, pushed,
no PR), then #63 and #62, closing #61 as superseded by #64.

Mid-flight state: nothing staged, nothing uncommitted, no background task
running. The subagent that built the watchdog hook and the HTTP wiring has
finished and reported; its worktree is idle.

