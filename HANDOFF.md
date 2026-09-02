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
| mcpsync | `apps/mcpsync` landed (5 stages + audit + publish prep); npm publish DEFERRED — release job is `workflow_dispatch`-only; local global bin installed via `pnpm add -g`. Desktop write-guard merged (`95f6c03`, PR #2). Round 2026-08-05 merged (`9d90a2c`, PR #3): 3 life-stack findings resolved + `imsg-mcp`→`EQStack` doc rename. Home decision REVERSED same session → relocate mcpsync to life-stack after publishing the kits (DEFERRED #10; import-as-library retracted for an optional `npx` shell-out). **MIGRATED OUT 2026-08-22** to `life-stack/apps/mcpsync` without publishing; `apps/mcpsync/` and the six `docs/plans/2026-08-mcpsync-*` plans are removed from this repo (DEFERRED #10). |
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

### Second addendum — two more consumer defects, both fixed

**`tui-kit@0.5.1`** — eqstack found a **fail-open** in the primitives within an
hour of adopting them. `lineWindow`'s guard was `budgetLines <= 0`, and every
comparison with NaN is FALSE, so that spelling ADMITTED NaN and every subsequent
break condition was false forever: a NaN row count from a non-TTY render
environment returned an entire 5,000-item list, costing them 64MB of retained
React fiber.

Their rule is now `src/finite.ts`: **any numeric parameter feeding a loop's
break condition must be validated with a POSITIVE predicate.** Three of the five
affected sites were NOT in their report and were found by writing the tests —
`allocateWidths` had the identical failure in its growth loop, `scrollbarThumb`
emitted NaN geometry, and `fitToWidth` THREW on `" ".repeat(Infinity)`.

**The observation worth carrying past this bug**: their hand-rolled predecessor
failed CLOSED under the same input *by accident* — `x <= NaN` is also always
false, so its loops never ran and it rendered one item. **Extraction inverted an
accidental safety into a fail-open.** That is a hazard of lifting in general: an
original's safety properties may not be properties at all, only consequences of
a shape the lift did not preserve. It is the sharpest argument available for why
a lift needs its own adversarial tests rather than inheriting confidence from
the code it replaces.

**mcpsync** — life-stack reported that generated `opencode.json` fails
`biome check` on every reconcile, because `JSON.stringify(doc, null, 2)` expands
every array while Biome and Prettier collapse short primitive ones. They asked
whether the expansion was DELIBERATE and offered to close the issue if so.
Reading the writer settled it: four `JSON.stringify(doc, null, 2)` sites, no
comment, no width awareness — **it was never a decision.** Fixed with a
width-aware writer at **80 columns, deliberately not this repo's 100**, because
80 is both Biome's and Prettier's default and an array collapsed at 80 survives
any formatter set at 80 or wider.

**This repo had the same bug and had not noticed.** Our `opencode.json` passes
`biome check` only because mcpsync skips the write when nothing changed
semantically, and the last real write happened to be followed by `lint:fix`. The
workflow `AGENTS.md` documents produces a file that fails `pnpm lint`.

Five consumer defect reports in two days, every one of them real, and three of
them finding bugs in this repo that its own suite did not.

### Third addendum — two corrections to me, and a deployment fact

**I gave life-stack wrong remediation advice and they caught it.** I told them to
reinstall the global `mcpsync` bin to pick up the fix. **No reinstall is needed
or possible**: the pnpm shim at `~/Library/pnpm/mcpsync` is PATH-BASED —

    exec node "$basedir/../../repos/mcp-cli-starter-template/apps/mcpsync/dist/cli.js"

— so it runs this repo's `dist/` in place. Verified here. Two consequences worth
knowing before telling any consumer to "reinstall":

1. The advice sends them after a **no-op**, and worse, gives them a reason to
   believe they are done when the real dependency is *this repo's build step*.
2. **`apps/mcpsync/dist/` is GITIGNORED.** Every consumer on this machine shares
   one binary whose contents are whatever was last built locally. There is no
   deploy step for mcpsync other than someone running `pnpm --filter
   @george43g/mcpsync build` here. That is undocumented and fragile.

**My "longest array is 55 columns" was wrong for their file.** They measured all
13 primitive arrays rather than taking the number: 11 collapse under 80, 2
exceed 100, **0 in the 81-100 gap**, longest collapsed line 160 columns. The
conclusion held, but via a case neither of us had in view — the two long ones
are safe because BOTH tools expand them, not because they are short.

**A trap in the same family as the false-all-clear one, and it is now three
sightings across three sessions in one day: AN OPERATION THAT SUCCEEDED BECAUSE
IT HAD NOTHING TO DO.** life-stack's `mcpsync apply` reported "unchanged 16
server(s)" and never wrote, so the new formatter never ran and a green result
proved nothing. A peer hit the same shape with `docker compose up --dry-run`
against an already-converged stack — clean "Running" for seven services, code
path under test never executed. And it is exactly why this repo's own
`opencode.json` looked fine.

The defence is the same one: **make the operation actually do the work before
believing its success.** They verified in a scratch project with no existing
output file, so the write path had to run. A no-op success and a real success
are indistinguishable from the exit code.

---

# Precompact checkpoint — 2026-08-22

**This section SUPERSEDES both 2026-08-21 checkpoints above, and outranks any
conversation summary.** Where they disagree, this is correct. Those are kept
because their Traps and Corrections still hold; their State/Open/Tree/Resume are
stale.

## State

`main` at `068d273`, tree clean, **zero open PRs**, zero worktrees.
Published: `robustness@0.10.0`, `tui-kit@0.5.1`, `cli-kit@2.0.1`,
`secret-store@0.2.2` — all four verified with `npm view` at checkpoint time.
The TUI plan is `complete`. Five consumer defect reports in two days, every one
real, three of which found bugs in this repo its own suite did not.

## Constraints (verbatim, and the first is a general rule, not a ruling)

- On when a package earns extraction — **apply this to every future extraction
  question, not just the mcp-kit one it was asked about**:
  > you publish a package when you notice that the code within it is being
  > duplicated, and not customised, and any customisation is either minor or
  > would make sense refactored around as a wrapper ... the further benefit
  > being ... instead of only one of them getting a cool feature, all the
  > consumers **benefit**
- On the TUI work: *"we could create one really good interface once, and then
  apply it to all the tools at once"*, with the process instruction that made it
  work — negotiate with the consumers BEFORE writing, *"to prevent future code
  duplication and further refactoring, a cycle we have repeated before"*.
- Standing: consumer requests are work orders; **publishing needs George's own
  approval and a peer relaying it is not approval**; peer repos are read-only.

## Done

- **`robustness@0.10.0`** (`fa862b8`) — `snapshotHealth(counters, state?)`, a
  consumer work order with 5 tests red against it. Consumed end-to-end by
  gmail-cli-mcp.
- **`tui-kit@0.5.0` → `0.5.1`** (`12aa2e2`, `PR #77`) — five list primitives,
  then a fail-open fix. See Corrections.
- **mcpsync emits formatter-stable JSON** (`4d556a6`) — `formatJson` at 80
  columns, deliberately not this repo's 100, because 80 is both Biome's and
  Prettier's default.
- **TUI plan `complete`** — `docs/plans/2026-08-tui-shared-primitives.md`. The
  main result is a REJECTION: the Miller-column navigator was refused by three
  consumers from three different shapes, and none was built.
- **DEFERRED #38 RESOLVED and proven**; **#41 opened** with the measured
  starvation table.

## Open

Every open item is in `DEFERRED.md`, which is the register. With momentum:

- **#41 — three of five consumers cannot receive any recent kit release.**
  Eight frozen ranges measured 2026-08-22 by reading every consumer manifest
  against `npm view`. All five sessions were sent per-repo tables; up-bank,
  life-stack and browser-tab have acted (their PRs await George in their own
  repos). **EQStack has not replied to the starvation report** — `voice-mcp` at
  robustness `^0.7.0` and `imsg-mcp` at `^0.8.1` were the state when read.
- **#39 — the logger rotates but never reaps.** Never attempted. More urgent
  since observe-only watchdog mode makes a process log unattended forever.
- **#40 — the stress harness is 15 assertions; 19 prose sites say 13.**
  Recorded, not swept.
- **mcp-kit's shape** — four additive seams designed but NOT built:
  `context?: () => TCtx`, `handler` returning `{text?, structured}`,
  `ToolDefinition.scopes?` + `scopeCheck?`, and an async `onErrorResponse?`.
  George deferred this pending negotiation with all four consumers; **all four
  have now answered**, so the blocker is discharged and it is buildable.

## Corrections

- **`tui-kit@0.5.0` shipped a FAIL-OPEN and 0.5.1 fixes it.** `lineWindow`'s
  guard was `budgetLines <= 0`; every comparison with NaN is false, so it
  ADMITTED NaN and returned an entire 5,000-item list. **Three of the five
  affected sites were not in the report** and were found by writing the tests —
  `allocateWidths` had the identical failure in its growth loop, `scrollbarThumb`
  emitted NaN geometry, and `fitToWidth` THREW on `" ".repeat(Infinity)`.
- **Consumer starvation has THREE mechanisms, not the one I reported.** A caret
  on 0.x; a version-PINNED `minimumReleaseAgeExclude` that stops covering the
  next release; and a LOCKFILE pinned below a correct specifier. **Each survives
  fixing the others.** I knew only the first.
- **I told life-stack to reinstall the global `mcpsync` bin. There is no
  reinstall** — the pnpm shim is path-based and runs this repo's `dist/` in
  place, and `dist/` is gitignored. The advice was a no-op that would also have
  given false confidence; mcpsync's only deploy step is a build here.
- **"What you are not receiving" was the wrong framing for a version bump**,
  per browser-tab: *"adopting an API to justify a bump inverts the dependency."*
  Being three minors behind is itself the defect.
- **My "three consumers rejected the navigator" is weaker than it sounds**, per
  up-bank: all three have flat-or-flattenable lists, so they may be three
  samples of one shape rather than three tests. The decision stands on *no
  consumer needing recursion today*.

## Traps

- **AN OPERATION THAT SUCCEEDED BECAUSE IT HAD NOTHING TO DO.** Four sightings
  in one day across four sessions: `mcpsync apply` skipping a
  semantically-identical write so a new formatter never ran; a peer's
  `docker compose up --dry-run` against an already-converged stack; turbo
  replaying a cache hit indistinguishable from a passing build; and this repo's
  own `opencode.json` looking clean for the first reason. **A no-op success and
  a real success are identical from the exit code.** Make the operation actually
  do the work — a scratch dir with no existing output, `turbo --force`, a fresh
  worktree — before believing it.
- **EXTRACTION CAN INVERT AN ACCIDENTAL SAFETY.** EQStack's hand-rolled walk
  failed CLOSED under NaN *by accident* — `x <= NaN` is also always false, so
  its loops never ran. Lifting it into a shared primitive turned that into a
  fail-open. **An original's safety properties may not be properties at all,
  only consequences of a shape the lift did not preserve.** A lift needs its own
  adversarial tests rather than inheriting confidence from what it replaces.
- **VALIDATE NUMERIC LOOP BOUNDS WITH A POSITIVE PREDICATE.** `x <= 0` is FALSE
  for NaN and therefore admits it; `!(x > 0)` does not. Now `packages/tui-kit/src/finite.ts`.
- **A REPORT SCOPED TO ONE PACKAGE TEACHES THE RECIPIENT TO CHECK THAT
  PACKAGE.** up-bank's, after I named one starved dep and they found two. The
  failure is per-range, so the check must be per-package across every manifest —
  send the table, never the name.
- **A HAND-MAINTAINED VERSION ALLOW-LIST FAILS EXACTLY LIKE A CARET.** Both
  silently stop covering the next release and neither reports it. A wildcard
  cannot go stale; a version list provably does.

## Tree

`main` at `068d273`, clean, no worktrees, no open PRs, no stashes.

## Blocked on you

- **mcpsync: should it be published, and soon?** Unchanged; the single input
  deciding its migration. life-stack's four-part answer is in DEFERRED #10.
- **The mcp-kit seams** — you deferred this until all four consumers had weighed
  in. **They now have.** Buildable on your word.
- Consumer PRs in their own repos await your merge: browser-tab #87/#88,
  up-bank #27, EQStack #115. Not mine to merge.

## Resume

**Nothing is mid-flight.** Tree clean, no open PRs, no background tasks, nothing
staged, no unanswered peer message.

The standing directive is *"keep going autonomously"*. In priority order:

1. **The mcp-kit design round** — the only item whose blocker was discharged
   this session. Four seams, all additive, all defaulting to today's behaviour.
   Then take the publish question back to George with his criterion satisfied
   rather than worked around.
2. **DEFERRED #39** (logger reaper) — the most consequential untouched item.
3. **Chase EQStack on the starvation table** — the one consumer that has not
   replied, and the one furthest behind on features built at its own request.
4. **DEFERRED #40**, best done by making the harness assert its own case count.

**Watch on the next release**: provenance is ON and FAILS the publish outright
(422) if the repo goes private or a `repository.url` drifts. If a publish dies
there, remove the five `NPM_CONFIG_PROVENANCE` lines rather than debugging
semantic-release. And sweep the consumer manifests per #41, or the release
reaches two of five repos.

### Addendum — 2026-08-22, EQStack's reply (closes `Resume` item 3, not #41)

- **EQStack is current; the chase is closed.** `main` @ `594d23f` — robustness
  `^0.10.0` in both apps, tui-kit `^0.5.1`, and the lockfile resolving `0.10.0`
  / `0.5.1` (`pnpm-lock.yaml:650,654`), so all three starvation mechanisms are
  clear there. They verified from disk, not from the specifier.
- **Correction, theirs, and it deletes an exception I was carrying.** "You are
  two minors behind your own feature" was WRONG: imsg adopted
  `getShutdownCause` / `noteShutdownCause` / `memorySampled` **at `^0.8.1`**,
  when they shipped, and has been a thin delegate over the kit since
  (`apps/imsg-mcp/src/shutdown.ts:29`, `src/watchdog.ts:28`,
  `src/tui/App.tsx:709` — verified in their tree, not taken on their word). The
  caret starved them of 0.9/0.10 only, neither from their brief. So
  browser-tab's *"adopting an API to justify a bump inverts the dependency"*
  holds **with no carve-out**; the pure-starvation argument was the whole
  argument. Also: `voice-mcp`'s `^0.7.0` was not deliberate, it predated the
  0.8.x arc.
- **#41 STAYS OPEN — browser-tab-mcp's `main` is still starved on both kits**
  (`^0.7.0` in the app and `packages/mcp-kit`, tui-kit `^0.4.1` @ `dc6e068`).
  Four of five consumers are current; that one is not.
- **A fourth hazard, and it is the merge that creates it.** browser-tab's fix
  exists as two unmerged branches, and each branch's lockfile pins the OTHER kit
  at the old version. Whichever merges second hits a `pnpm-lock.yaml` conflict,
  and resolving it by taking one side wholesale — the ordinary reflex for a
  generated file — silently reverts the other kit **while both manifests still
  read correctly**. Recorded in `DEFERRED.md` #41 with the branch/lockfile table
  and sent to them.
- **Trap, generalised**: *a fix split across two branches is not a fix, and the
  lockfile is where the split bites.* Only a resolved-version read after
  installing on the merge result catches it — the specifier will look right.

# Checkpoint — 2026-08-22 (evening)

**This section SUPERSEDES the 2026-08-22 checkpoint above and outranks any
conversation summary.** Where they disagree, this is correct. The earlier one is
kept for its Traps and Corrections, which still hold; its State/Open/Tree/Resume
are stale — in particular its `Resume` list is now three-quarters done.

## State

`main` at `d0219ae`+, tree clean. **`robustness@0.11.0` published** (George's
approval). **mcp-kit is publish-shaped and waiting on George's one-time npm
bootstrap** — nothing else blocks it. DEFERRED **#39 and #40 are RESOLVED**;
#41 gained two new mechanisms and now argues the OPPOSITE of what it did this
morning. Four of five consumers are current on all kits.

## Constraints (verbatim, George, this session)

- On mcp-kit, answering the extraction question he had deferred: **"Publish
  mcp-kit"** — taken against a measurement of his own criterion rather than a
  request.
- On mcpsync: **"Migrate without publishing"** — it leaves as a private tool
  installed from a local path, not a registry dependency.
- Standing and unchanged: publishing needs George's own approval; a peer
  relaying it is not approval; peer repos are read-only.

## Done

- **`robustness@0.11.0`** (`pruneLogs`, DEFERRED #39) — `npm view` confirms
  0.11.0. Rotation bounded file size and nothing reaped; a live process's open
  file is never deleted; `getFileLogLines`' fallback ordering fixed. up-bank
  measured it end-to-end: **84 files/1.5MB → 9 files/204KB, live pid preserved,
  `/health` 200 throughout**, and the ordering bug was PRESENT for them, not
  latent — their `get_logs` had been answering with the wrong process's file.
- **DEFERRED #40 RESOLVED mechanically** (`#87`) — `EXPECTED_ASSERTIONS`
  asserted against the harness's own run, `pnpm check:stress-count` asserting
  45 prose references against it, in `pnpm verify` and its own CI step. 19 was
  an undercount; it is 45 across 25 files.
- **mcp-kit seams** (`#89`) — `ContentBlock` + `toContent`, `devOnlyEnabled`.
  Both lifted from browser-tab's vendored copy, i.e. both already duplicated.
- **mcp-kit publish shape** (`#91`) — manifest, LICENSE, `.releaserc.json`,
  `PUBLISHABLE`, release job, `paths`. `PENDING_BOOTSTRAP` in
  `build-templates.mjs` keeps the scaffolder vendoring until the package exists.
- **mcpsync departure half** (`#90`) — `private: true`, out of `PUBLISHABLE`,
  release job deleted, `apps/mcpsync/HANDOFF.md` written to travel with the app.
- **Caught an unguarded mcp-kit release job before it fired** (`#93`) — see
  Corrections. A release run was CANCELLED mid-flight to stop it.

## Open

Everything open is in `DEFERRED.md`, which is the register.

- **#25 step 3 — whether the scaffolder stops vendoring mcp-kit.** Blocked on
  the bootstrap publish (the E2E smoke installs from the real registry, so it
  cannot pass until the package exists). Deliberately a separate decision: a
  vendored copy is customisable by the generated repo, which is what browser-tab
  did.
- **#10 — the mcpsync LANDING.** life-stack answered the placement definitively
  (`apps/mcpsync/`, flat, beside `opkeep`, `AGENTS.md:75`) and then **refused to
  create it on my relay of George's decision** — correctly; they hold the same
  line I do. They have put it to George directly and will pull it in themselves.
  `apps/mcpsync/` stays here until they confirm it has arrived.
- **#41 — the starvation is CLEARED, the mechanism is not.** As of this evening
  all five consumers resolve `robustness@0.11.0` and `tui-kit@0.5.1`, verified
  from their LOCKFILES rather than their specifiers:

  | repo | robustness | tui-kit |
  |---|---|---|
  | EQStack (`cd6aaf7`) | 0.11.0 | 0.5.1 |
  | browser-tab-mcp (`d9eb157`) | 0.11.0 | 0.5.1 |
  | life-stack | 0.11.0 | — |
  | up-bank-mcp | 0.11.0 | 0.5.1 |
  | Gmail-MCP-Server (`66986bf`) | 0.11.0 | 0.5.1 |

  First time in this arc that every consumer is current. **The entry stays open
  because nothing mechanical produced that** — five hand-written tables and five
  sessions acting on them did, and the next release re-arms it. The durable form
  is life-stack's `check-dep-ranges.mjs`, extended to assert the RESOLVED version
  rather than the range's shape.
- **#12 the rename** — not started.

## Corrections

- **THE COMPARATOR-RANGE RECOMMENDATION IS WITHDRAWN, AND IT WAS THIS REPO'S
  OWN ADVICE TO FIVE CONSUMERS.** `>=0.x <1` takes the newest version **only on
  first resolution**; an existing satisfying lockfile entry is kept forever and
  `pnpm install` reports nothing. `apps/mcpsync` here carried `">=0.1.1 <1"`
  resolving to **0.1.1 — the first version ever published, ten minors behind.**
  Found only because it poisoned `packages/mcp-kit`'s identical new specifier
  (`TS2305: has no exported member 'getShutdownCause'`). **A hand-bumped caret
  is now the BETTER option**: it starves visibly and gets fixed; a comparator
  range starves invisibly while reporting success.
- **I sent the wrong number to four sessions before catching it.** "Comparator
  repos: 2 of 2 reach 0.11.0" was read off SPECIFIERS — the exact error EQStack
  corrected me on that morning. Gmail's lockfile held 0.10.0. It was 1 of 2, and
  the one that made it had run `pnpm update`, which silently rewrites the range
  back to a caret (life-stack's finding, confirmed here).
- **My "two minors behind their own feature" about EQStack was wrong** — imsg
  adopted 0.8.x when it shipped. That deleted the only exception to browser-tab's
  rule that a bump ships on starvation grounds alone.
- **My first red-drill of `toContent` was invalid** — I threw INSIDE the try, so
  it proved the catch catches. The real drill removes the guard.
- **THE mcp-kit RELEASE JOB I ADDED IN #91 WOULD HAVE ATTEMPTED `1.0.0`.**
  `semantic-release`'s first release for a package is 1.0.0 — **it does not read
  the manifest's version**. My comment on that job claimed it would "find
  nothing to do" until the bootstrap; a fresh package with `feat` commits in its
  path has plenty to do. It would have failed at the npm step (no
  `NPM_TOKEN`, and trusted publishing needs the package to exist), but *"it
  fails safely"* is not a basis for an immutable version number in a repo that
  has already published two unintended majors. The in-flight run was cancelled
  before the job ran; `npm view @george43g/mcp-kit` returns 404. Gated in #93,
  and `resync-example` drops mcp-kit from `needs` while the gate is on —
  DEFERRED #38's bug, walked back into within one PR.

## Traps

- **A NEGATIVE FROM A SHAPE THAT CANNOT REACH THE CODE IS NOT WEAK EVIDENCE, IT
  IS NO EVIDENCE.** up-bank could not reproduce the duplicate shutdown marker on
  0.11.0 and asked whether the path had closed. It had not — their run exited in
  6ms with no `cleanup_timeout`, so the force-exit net never armed. Re-measured:
  `GUARD=0 → 2 markers, GUARD=1 → 1`. They flagged their own calibration rather
  than concluding, which is the only reason it got measured.
- **A KIT BUMP COLLECTS BLAME FOR EVERY FLAKE IT COINCIDES WITH**, from
  browser-tab: their bump PR went red three times and the cause was six
  integration files sharing one 500-port band under parallel forks, with the
  collision silent. *A consumer-side flake that clusters on a dep-bump PR is not
  evidence against the dep until the bump's diff contains a mechanism.*
- **ABSENCE-BY-GREP IS ONLY VALID FOR SYMBOLS CONFIRMED TO BE LITERALS.** Every
  `MCP_*` knob here is built as `key("LOG_KEEP_FILES")`, so the literal never
  appears in the artifact. life-stack nearly filed a documented-but-unwired bug
  on that; their control passed by luck.
- **"DO YOU HAVE A GATE" IS THE WRONG QUESTION; "DOES YOUR GATE COVER THE
  SURFACE THAT CHANGES" IS THE RIGHT ONE** — up-bank. Their stress cases 8–16
  gate lifecycle on both transports; nothing gates logging, and both 0.11.0
  fixes landed in the ungated half.
- **A STALE RECOMMENDATION IN A DECISION REGISTER IS WORSE THAN NO ENTRY.**
  up-bank rewrote their George-facing backlog question rather than appending my
  retraction to it.

## Tree

`main`, clean, no worktrees, no stashes. Published:
`robustness@0.11.0`, `cli-kit@2.0.1`, `tui-kit@0.5.1`, `secret-store@0.2.2`.
`mcp-kit@0.1.0` is shaped but **not on npm**.

## Blocked on you

- **The one-time `pnpm publish` bootstrap of `@george43g/mcp-kit@0.1.0`**, then
  its Trusted Publisher on npmjs.com (`george43g` / `mcp-cli-starter-template` /
  `release-packages.yml`, environment empty). Trusted publishing requires the
  package to already exist. Until then its release job runs, verifies, and finds
  nothing to do. This unblocks #25 step 3.
- **Confirming the mcpsync landing to life-stack directly.** They will not act
  on my relay, and they are right not to.

## Resume

**Nothing is mid-flight.** No background tasks, nothing staged, no unanswered
peer message.

1. **Wait on George's two items above** — both unblock work rather than being
   work.
2. **#41 needs the durable form life-stack built** — a check, not a report:
   fail the build on a first-party range that pins a 0.x minor, AND on a
   resolved version below the published one, which no range-shape test can see.
   Their `scripts/check-dep-ranges.mjs` is the reference.
3. **#12 the rename** — untouched, and the last large item.

**Watch on the next release**: `packages/mcp-kit/**` is now in
`release-packages.yml` paths and the job is chained after secret-store, so a
push touching mcp-kit runs a fifth job. Provenance is ON and fails the publish
outright (422) if this repo goes private.

# Checkpoint — 2026-08-22 (night)

**This section SUPERSEDES both 2026-08-22 checkpoints above and outranks any
conversation summary.** Where they disagree, this is correct. Their Traps and
Corrections still hold; their State / Open / Tree / Resume are stale — the
evening one's `Blocked on you` is now empty, and its `Resume` is done.

## State

**All five packages published and tagged**, mcpsync gone, `main` clean. The
release pipeline is fully armed for the first time: `mcp-kit@0.1.0` shipped and
its job ungated. Telemetry is **parked by George mid-design**, pending his own
proposal.

## Constraints (verbatim, George, this session)

- On telemetry, stopping the design: *"actually no. stop. you assumptions are
  wrong. I will propose a way forward for you, so just park this for now."*
  **Do not resume that design from DEFERRED #43** — it holds facts, not a plan.
- On the spool location, his position, recorded unadopted and **contradicting**
  g-home-server's measurement: *"the logs SHOULD get stored in the TMP directory
  - this guarantees that they'll eventually get deleted rather than piling up or
  if they contain sensetive info."*
- On the npm token he pasted: *"that token will expire after 7 days, so dont
  worry about exposing it. i will disable it right after the publish is done."*
  It is `npm_qjKpHAd…` — **treat as live until he confirms revocation**; it was
  never written to a repo file and never added to GitHub Actions.

## Done

- **`@george43g/mcp-kit@0.1.0` is on npm**, tagged `mcp-kit-v0.1.0` → `d0219ae`,
  Trusted Publisher `id: 8bf00f47-fb66-47e6-a0d5-ba99ee4b4df2`, release job
  ungated (`3171d53`). George ran the publish; I ran `npm trust` and the tag.
- **`robustness@0.12.0`** (`68cb5c7`) — opt-in email redaction, `redactEmail()`,
  `redactionCoverage()`, coverage printed in the startup line.
- **`apps/mcpsync/` removed** (`11b9914`), 74 files, −7067 lines. Verified from
  GitHub before deleting: 5 commits ancestors of life-stack `origin/main`,
  `src/`+`tests/` byte-identical across 51 files.
- All five verified live: robustness 0.12.0, cli-kit 2.0.1, tui-kit 0.5.1,
  secret-store 0.2.2, mcp-kit 0.1.0 — each with a matching remote tag.

## Open

Every open item is in `DEFERRED.md`, the register. Evidence each is still open:

- **#25 step 3 — does the scaffolder stop vendoring mcp-kit?** Unblocked (it is
  on npm) and deliberately not done. `PENDING_BOOTSTRAP` at
  `build-templates.mjs:67` still names it, and `06-mcp-kit/lib/src/` +
  `example/packages/mcp-kit/` still exist. **A real trade, not an oversight**: a
  vendored copy is customisable by the generated repo, which is what browser-tab
  did.
- **#43 telemetry** — parked by George, above.
- **#12 the rename** — never attempted. Touches published `repository.url`.
- **#3 MCPB bundle is broken**, reframed 2026-08-x, not fixed.
- **#41 starvation** — all five consumers were current at 0.11.0; **0.12.0 has
  already re-opened the gap**: EQStack resolves 0.12.0, browser-tab / life-stack
  / up-bank resolve **0.11.0** (read from their lockfiles tonight). Nothing
  mechanical holds it — five hand-written tables did.
- **#11 `packages/secrets` / `env-loader`** — retire or justify. Dormant.
- **#36 / #37** — release-please for generated repos; consumer-side canary.

## Corrections

- **"The publish didn't land" was WRONG.** After George's successful publish,
  `npm view` and a direct registry GET both 404'd for minutes and I told him it
  had failed. **My negative control was mis-specified**: `robustness` answering
  200 proves the QUERY works, not that a BRAND-NEW name propagates instantly.
  `npm trust` succeeding while reads still 404'd is what settled it. *A control
  must vary the thing under test.*
- **Publishing 0.1.0 did NOT close the 1.0.0 hazard.** semantic-release resolves
  `lastRelease` from **git tags**, not the registry. Every other package had a
  tag; mcp-kit had none. Without `mcp-kit-v0.1.0` the first automated run would
  have cut **1.0.0**. **Bootstrapping needs three things, not two.**
- **`imsg-mcp` IS published, at 1.25.1, under its UNSCOPED name.** I queried
  `@george43g/imsg-mcp`, found 404, and told EQStack to add `private: true` as
  "cheap insurance". That would have **silently ended their releases** —
  `semantic-release-monorepo`'s `ignorePrivate` skips private packages. Worse
  than a lookup error: **my own tool output printed `name='imsg-mcp'` three
  lines above the query that used the scoped form.** The probe saw it; I
  overrode it with an expectation.
- **The externalise cost I quoted three times did not exist.** My own
  `apps/mcpsync/HANDOFF.md` claimed externalising the kits meant moving
  `cli-table3`/`picocolors`/`ink`/`react` out of `dependencies`. All seven were
  already direct deps. *A cost that travels through three hands unchecked is
  folklore, not a measurement* — hardest to question when it came from the
  upstream doc.

## Traps

- **A CHECK YOU HAVE NOT WATCHED FAIL IS NOT A CHECK.** life-stack's grep for
  leftover inlining matched the *import binding* as readily as inlined source —
  it would have passed either way. Distinct from, and worse than, the
  succeeded-because-empty family: a test with no discriminating power.
- **A NEGATIVE FROM A SHAPE THAT CANNOT REACH THE CODE IS NO EVIDENCE, NOT WEAK
  EVIDENCE.** up-bank could not reproduce the duplicate shutdown marker because
  their cleanup returned in 6ms and never armed the 3s force-exit net. Hedging
  such a null as "weak" invites averaging it against a positive.
- **A RETENTION POLICY RIGHT FOR DISK IS NOT RIGHT FOR DELIVERY.** `pruneLogs`
  reaps by count (`MCP_LOG_KEEP_FILES=5`) and reaps **silently**. Five files is
  five *rotations*, minutes under burst. Correct for the problem it solved;
  wrong the moment a shipping requirement appeared under it.
- **INFERRING BEHAVIOUR FROM A MISSING CALL SITE IS ONLY VALID WHEN THE
  BEHAVIOUR REQUIRES ONE.** Two sessions concluded their apps had not adopted
  phone redaction, from a missing import; the default-on logger had been doing
  it all along. Pairs with: absence-by-grep is valid only for symbols confirmed
  to be literals (`key("LOG_KEEP_FILES")` never appears as `MCP_LOG_KEEP_FILES`).
- **A RELATIVE LINK IN A FILE DESIGNED TO MOVE is a defect at authoring time.**
  Neither repo's docs check covers `apps/*/README.md`.

## Tree

`main` at `3171d53`, level with origin, clean. On branch
`docs/park-telemetry`, clean, **PR #99 open** (docs-only, CI running). One
worktree, no stashes. Peer repos untouched.

## Blocked on you

- **PR #99** — merge when green (docs only).
- **#25 step 3** — the de-vendoring decision. Yours; it changes what every
  future `mcp-scaffold init` emits.
- **The telemetry proposal** you said you would bring.
- **Revoking the npm token** you pasted, once you are satisfied.

## Resume

**Nothing is mid-flight** beyond PR #99 awaiting CI. No background tasks, nothing
staged, no unanswered peer message — eqstack, up-bank, browser-tab, life-stack
and gmail all closed their threads.

1. **Merge #99.**
2. **Wait for George's telemetry proposal.** Do not design against #43.
3. **#25 step 3** when he decides; it is the only kit item left with momentum.
4. **#41's durable fix** — life-stack's `check-dep-ranges.mjs` extended to assert
   the RESOLVED version, since mechanism 5 is invisible to any range-shape test.
   0.12.0 re-opened the gap within the hour, which is the argument for it.

**Watch on the next release**: the mcp-kit job is now ungated and in
`resync-example`'s `needs`, so a push touching `packages/mcp-kit/**` runs a
fifth publishing job for the first time. It has never run live.

---

# 2026-08-23 — mcp-kit de-vendored; five generated-app decisions queued on George

**Where this file and any summary disagree, this file is correct.**

## State

`main` at `5d86258`, clean, no open PRs. mcp-kit is de-vendored (#100) and the
record for everything below is merged (#101). **Five decisions are queued on
George; no work is staged or in progress, and no peer thread is open.**

## Constraints (new this session, verbatim)

- *"yes stop vendoring mcp-kit - repos move to depending on the npm lib."* — done, #100.
- *"3. you have my merge word"* (#100) and *"yes to merge 101"* — both applied.
  Neither extends to anything else; the five below are unauthorised.

## Done

| | anchor |
|---|---|
| mcp-kit de-vendored; phase 06 deleted, `PENDING_BOOTSTRAP` emptied | `2c75633`, E2E smoke rc=0 |
| Dead code the deletion orphaned removed; coverage 84.33% → **85.88%**, floor NOT lowered | `apps/scaffolder/src/core/package-port.ts` |
| `check:usage` wired into `verify` — it was absent, so a usage drift was green locally and red in CI | red-drilled by injecting drift |
| up-bank migrated to `@george43g/mcp-kit@^0.1.0` | their PR #33 |

## Open — the five, all George's

1. **`devOnlyEnabled` unwired** in `apps/example-repo-mcp/src/dispatcher.ts` — `get_logs` is hidden from `tools/list` but still **callable by name**, in every generated repo. up-bank demonstrated the identical shape returning a real payload with `MCP_DEV` unset. One line, no release. #44.
2. **Log prefix — two call sites.** `index.ts` brands too late; **`cli.ts` never brands at all** (`grep -c` → 0, both here and in browser-tab). Reproduced: `TMPDIR=… node dist/cli.js health` → `mcp/mcp-97487-….ndjson`. One line each, no release. #45.
3. **`devOnly` semantics** — flip the default to fail-closed, rename the field, or throw at construction. **Only item that cuts a release, and on a 0.x it is 1.0.0, not 0.2.0.** browser-tab's `sanitizeContent` lift rides the same release. #44.
4. **Behavioural test in the template** — spawn every subcommand the bin dispatches under an isolated `TMPDIR`, assert no default-prefix dir appears; subcommand set from the bin's own command table. Catches both of (2) without distinguishing them. #45.
5. **Port life-stack's `check-deps-stale.mjs`** (138 lines, no deps, `exit 2` on unreachable registry). `verify` never touches the network, so **nothing here detects a stale lockfile**. #41.

## Corrections (claims now void)

- **#41's caret flip is WITHDRAWN.** "A hand-bumped caret is the better option" was given to four sessions and is wrong. `scripts/check-publishable-manifests.mjs:170-200` reads sibling floors, runs in `verify`, and its own error text says *"Prefer a comparator range"* — the repo held the answer executably the whole time.
- **The scaffolder-caret "finding" is WITHDRAWN, before it was built.** `README.md:25` is `npx @george43g/mcp-scaffold …` and the repo is PUBLIC, so generated repos go to strangers; a comparator there would promise forward-compat across every future 0.x to people with none of our conventions. `build-templates.mjs:207` is **correct**.
- **"De-vendoring is a free upgrade"** — wrong. Loss-free ≠ free: 29 type errors across 9 files for up-bank.
- **mcpsync is NOT a third instance** of the missing-brand defect — nothing outside its `src/tui/` imports robustness, so its CLI never logs. Two instances, not three.

## Traps

- **An anchor inherited from another tree is not an anchor.** Worst case is byte-identical code at a different offset — every check except the line number passes.
- **A rule correct in its own scope reads as universal the moment you go hunting for instances of it.** The hunt supplies surfaces; the scope does not travel with them.
- **Having the means to check is not checking** — life-stack's staleness check existed, worked, and had never once been run.
- **`pruneLogs` is a measurement hazard, not just retention.** A `$TMPDIR` inventory went stale within hours.
- **Enumerate from the system, not from a list someone wrote once.** Hit three times: entry points, log prefixes, subcommands.

## Tree

`main` `5d86258`, clean, level with origin, **no open PRs**. `docs/record-log-prefix-findings` merged and deleted. Nothing staged, no worktrees. Only this repo was written to; peer repos were read-only throughout.

## Blocked on you

The five above, plus Vector: **the ingest password** (`INGEST_BASIC_AUTH_GHOMESERVER` in `key-vault`, George-only) and **plan approval**. dotfiles holds the full record at `~/dotfiles/docs/vector-rollout.md`; nothing installed, tapped or configured.

## Resume

**One thing is mid-flight, and it is a question to George, not work.**

`5d86258` (this entry's own correction) was pushed **directly to `main`**, not
through a PR — a deviation from the convention every other change this session
followed. It is docs-only and touches no published package, so no release job
fires. **I flagged it and offered to revert and re-land it as a PR; he has not
answered.** Nothing depends on the answer; do not revert unilaterally.

Its CI run was still in progress at checkpoint time — `gh run list --branch main
--limit 2` settles it. `README check` had already passed. The CI run on the
preceding commit `7237982` shows **cancelled**, which is the concurrency group
superseding it, not a failure.

Otherwise nothing is mid-flight: #100 and #101 merged, no branch, no staged edit,
no background task, no unanswered peer message.

Next action is George's answer on the five. (1), (2) and (4) are one sitting and need no release. (3) is the only release decision, and on a 0.x it cuts **1.0.0**, not 0.2.0 — browser-tab's `sanitizeContent` lift rides the same release. (5) is a port of a file that already exists in life-stack.

**Do not start any of them without his word.** Each changes what generated repos do, and the two recommendations withdrawn above were both stopped by asking a peer to argue against them, not by review.

---

# 2026-08-24 — all five decided by George, plus Vector approved in full

**Precedence: where this entry and any summary disagree, this entry is correct.**
It records DECISIONS, not completed work. Nothing below is implemented yet unless
its row says so.

## State

All five queued items and the Vector question were put to George sequentially on
2026-08-24 and answered. **Two releases are now authorised in shape: `mcp-kit`
1.0.0 and a `robustness` minor.** No code has been written against any of them.

## Constraints (new this session, verbatim)

- *"you need to provide the most important bits to me in a dot point summary at
  the end of each turn to ensrue i read it"* — 2026-08-24. Now also in
  `~/.claude/CLAUDE.md`: `needs you` first, then `done`, then `next`. Anything
  requiring George to act must be a bullet, never prose.

## Settled — the five, with the option George chose

| # | Decision | Consequence |
|---|---|---|
| 1 | **Wire `devOnlyEnabled: devModeEnabled`** into `apps/example-repo-mcp/src/dispatcher.ts:26-31`, **plus** browser-tab's transport-level assertion (`stress-mcp.ts:596-597`) that `get_logs` answers "Unknown tool name" by direct name with dev off. | No release. Harness goes 15 → **16** assertions, so `EXPECTED_ASSERTIONS` (`stress-mcp.ts:197`) and the **13 markdown files** quoting "15-assertion" all move; `pnpm check:stress-count` enforces it. Three surfaces: canonical → `08-app/lib/` → `regen:example`. |
| 2 | **Structural brand-on-import module.** A `src/log-brand.ts` whose module-scope side effect calls `setLogFilePrefix(slug)`, imported **first** by `cli.ts`, `index.ts` and `tui/index.tsx`. | No release. Chosen over the one-line `cli.ts` patch so ordering is correct by construction, not by luck. |
| 3 | **(D) Throw at construction.** `buildDispatcher` throws when the registry holds a `devOnly` tool and no `devOnlyEnabled` predicate was passed, naming the offending tools. | **Cuts `mcp-kit` 1.0.0.** browser-tab's `sanitizeContent` lift rides it. **Makes item 1 a hard prerequisite** — the generated app throws without it. up-bank is pinned `^0.1.0` and generated repos get `^<version>` (`build-templates.mjs:207`), so 1.0.0 reaches nobody automatically: it is a coordination event across three consumers. |
| 4 | **Full behavioural test + the robustness late-brand detector.** Spawn every subcommand under an isolated `TMPDIR`, enumerated from the bin's own command table, assert no default-prefix directory appears; kill the long-running ones. Plus the zero-false-positive detector at `setLogFilePrefix` (`logger.ts:118`) warning via `writeStderrLine` when `logFilePath` is already non-null. | Test: no release, lands in the **template** (four surfaces). Detector: **a `robustness` release.** |
| 5 | **Port life-stack's `check-deps-stale.mjs` + a scheduled CI job** that fails loudly. Not a PR gate — `verify` stays network-free. | No release. Also clears the live staleness found while deciding it (below). |

**Chosen option text is preserved because the reasoning is not recoverable from
the diff:** item 3 went to (D) over (A)-flip and (C)-rename because D *dissolves*
up-bank's fork — under D you cannot have a `devOnly` tool without a predicate, so
the field genuinely is a gate and the name stops lying without a rename.

## Settled — measured while deciding, not previously known

| # | Finding | Anchor |
|---|---|---|
| M1 | **This repo is dependency-stale RIGHT NOW, and `pnpm verify` is blind to it.** `packages/mcp-kit/package.json` declares `@george43g/robustness` at `>=0.11.0 <1` as a real `dependency`; published latest is **0.12.0**; the lockfile retains `'@george43g/robustness@0.11.0'`. Mechanism 5, live, in the repo that has been auditing four consumers for exactly this. | `npm view` + `pnpm-lock.yaml`, 2026-08-24 |
| M2 | **18 of 20 first-party edges are `workspace:*`** — which is why M1 hid. `mcp-kit → robustness` is the only registry-resolved first-party edge, and it is the one that drifted. `tui-kit` holds robustness as `devDependencies: workspace:*` + `peerDependencies: >=0.1.1 <1`, so it does not resolve from the registry. | manifest scan, 2026-08-24 |
| M3 | **`@george43g/shared-types` returns E404 on `npm view` and that is correct** — it is `private: true` and absent from `PUBLISHABLE` (`scripts/check-publishable-manifests.mjs:42-53`). The ported staleness check must distinguish *deliberately unpublished* from *registry unreachable*, or it exits 2 forever. | 2026-08-24 |
| M4 | **Vector O3 is closed for `example-repo-mcp`: CLEAN.** `MCP_LOG_DIR` is empty in `.env.example` across all three surfaces; the only non-empty settings are `tests/http-lifecycle.test.ts:81` and `scripts/stress-mcp.ts:384`, both temp dirs they create. No absolute override in any production config. This was the last outstanding row in that audit. | 2026-08-24 |

## Corrections (claims now void)

- **"Log prefix — two call sites; `index.ts` brands too late" is WRONG for this
  repo, and it was my row.** DEFERRED #45's own entry-point audit says
  `index.ts` ✓, `tui/index.tsx` ✓, **`cli.ts` ✗**, `commands/http.ts` ✗-but-harmless.
  **One call site here, not two.** The "brands too late" mechanism is real but was
  measured in browser-tab's tree. I conflated the general trap with our instance.
  What *is* true of `index.ts`: it brands as the first statement inside
  `runMcpServer()`, so it is correct **by current call ordering, not by
  construction** — which is the argument for item 2's structural fix.

## Settled — Vector

**George approved the plan IN FULL, all five emitters** (2026-08-24), over the
staged option I recommended. The staged alternative and its reasoning are in
`Rejected` below so this is not re-litigated.

- Install/supervision per `~/dotfiles/docs/vector-rollout.md` S1-S2: mise pin
  `vector = "0.57.0"`, **own launchd plist**, `brew services` rejected
  (`Formula/vector.rb:56` sets `keep_alive false`, unoverridable).
- **`INGEST_BASIC_AUTH_GHOMESERVER` is still George's to create** — approval of
  the plan does not create the credential. Verified absent: zero matches across
  all 529 key-vault items. **Nothing runs until it exists.**
- **Accepted with the plan, explicitly:** up-bank account identifiers and
  browser-tab URLs are covered by **no** redaction rule at any version; gmail and
  imsg ship email addresses with redaction defaulting off; browser-tab, up-bank
  and life-stack resolve robustness **0.11.0**, where the email-redaction
  identifier does not exist in the shipped `dist/` at all.
- **O12's single artifact folds into the mcp-kit 1.0.0 already authorised by item
  3**: a guard beside `packages/mcp-kit/src/dispatch.ts:155-161`, which copies
  `err.message`/`err.stack` verbatim into `dispatch_error` and is inherited by
  every consumer. Doing it in that release avoids a second coordination event
  across the same three consumers.

**dotfiles owns install/config and has not been told yet** — the vector-rollout
record is in a peer repo and this session is read-only there.

## Rejected (so they are not re-proposed)

| Option | Why | Rejected by |
|---|---|---|
| Item 2 as a one-line `cli.ts` patch | Closes the measured defect but leaves the arrangement correct-by-ordering, so a future entry point repeats the trap. | George, for the structural module |
| Item 3 (A) flip default / (C) additive rename | (A) picks a default instead of answering what `devOnly` means, and fails silently. (C) is a minor that reaches everyone automatically but documents the trap rather than closing it. | George, for (D) |
| Item 4 one-shot subcommands only | Drawing the line by hand is the exact enumeration failure that let `cli.ts` through, and `mcp` is the entry point that matters most. | George |
| Item 5 manual `pnpm check:deps-stale` only | life-stack's own caveat: it had never once been executed before the day it caught this — *a correct check nobody runs fails exactly like a broken one*. | George, for the scheduled job |
| Vector staged rollout (safe emitters first) | Recommended by this session: ship `example-repo-mcp` + browser-tab, hold gmail/imsg/up-bank until O12 answered per-emitter. George took full approval instead, accepting the exposure listed above. | George |

## Open

| # | Question | Whose call |
|---|---|---|
| O-A | **Does authorising the 1.0.0 *shape* authorise the *publish*?** The standing constraint is that publishing needs George's own approval, and `release-packages.yml` fires on push to `main`. Treating the item-3 answer as publish approval would be an inference. **Ask before pushing anything that triggers the release.** | **George** |
| O-B | `INGEST_BASIC_AUTH_GHOMESERVER` creation (Vector O1). | **George** |
| O-C | Vector O11 — is NDJSON-in-`$TMPDIR` the intended coverage boundary, or should stderr-only tools (voice-mcp) be brought in? Not covered by full approval; it is a design question about what is *representable*. | **George** |
| O-D | The direct-to-`main` push of `5d86258`, flagged 2026-08-23, still unanswered. Docs-only, fires no release. **Do not revert unilaterally.** | **George** |

## Tree

`main` at `ef49986`, clean, level with origin, no open PRs. CI on `ef49986` is
**green** — both matrix legs passed; the release-token gate skipped correctly
(push event, docs-only). Nothing staged, no worktrees, no background work.
Only this repo was written to; `~/dotfiles` and all peer repos were read-only.

## Resume

Nothing is in progress. The next action is implementation, and the ordering is
forced by item 3: **item 1 must land before mcp-kit 1.0.0 is consumed**, or the
generated app throws at construction. Suggested batching — (a) items 1+2+4 as one
sitting, no release; (b) item 5, independent, no release; (c) mcp-kit 1.0.0
carrying item 3 + `sanitizeContent` + the O12 `dispatch_error` guard; (d) the
robustness minor carrying item 4's detector. **Stop at O-A before (c) or (d).**

---

# 2026-08-30 — the five are DONE and merged; two releases are staged but UNPUBLISHED

**Precedence: where this entry and any earlier one disagree, this entry is
correct.** The 2026-08-24 entry above lists the five decisions under
*"Open — the five, all George's"*. **That is stale — all five are decided,
implemented and merged.** It also describes the log-prefix defect as "two call
sites, `index.ts` brands too late"; that framing was corrected the same day and
the real mechanism was a third cause entirely (see #46).

## State

`main` at `02ef4dc`. **All five decisions shipped.** Two releases are merged and
**NOT published** — the release job fails on `main` and #112 is the fix.

## Done — the five, with anchors

| # | What | Anchor |
|---|---|---|
| 1 | `devOnlyEnabled` wired; dev tools gated on the CALL path | `80d418b` (#103), red-drilled both ways |
| 2 | `src/log-brand.ts` — branding as a module-scope side effect | `80d418b` (#103) |
| 3 | `devOnly` throws at construction | `9c51a62` (#106) → **mcp-kit 1.0.0, PUBLISHED** |
| 4 | Behavioural log-prefix test, enumerated from the bin's `--help` | `02ef4dc` (#109) — unblocked by #46 |
| 5 | `check-deps-stale.mjs` ported + weekly job | `685bdee` (#104) |

Plus, unplanned and consumer-driven: `robustness@0.13.0` (starvation-aware
watchdog, PUBLISHED), `robustness 0.14.0` (hard-path classification, merged,
UNPUBLISHED), `mcp-kit 2.0.0` (peer dependency, merged, UNPUBLISHED).

## Open

| Item | Owner | Evidence it is still open |
|---|---|---|
| `turbo-test-tasks` | mcp-cli-toolkit | PR #112. `main`'s `turbo.json` still has `test:coverage` and `test:no-native` on `["^build"]` — verified by `git show origin/main:turbo.json`. **Until this merges the release job fails and nothing publishes.** |
| `publish-2.0.0-and-0.14.0` | mcp-cli-toolkit | `npm view` at 2026-08-30 → mcp-kit **1.0.0**, robustness **0.13.0**. Two release runs failed: `33203996874` and `33204002219`. |
| `release-token-edited-trigger` | mcp-cli-toolkit | `ci.yml`'s `pull_request:` declares no `types:`, so `edited` is absent and a body edited after CI goes green is never re-checked. Never attempted. |
| `handoff-direct-push-5d86258` | mcp-cli-toolkit | Asked 2026-08-23, never answered. Docs-only, fires no release. **Do not revert unilaterally.** |

## Elsewhere

- `vector-o11` and `ingest-basic-auth-password` (dotfiles / life-stack) — Vector
  approved in full 2026-08-24; the credential is George's to create. Not this
  session's rows; their owners raise them.

## Corrections (claims now void)

- **"The release is in flight"** — it was not. Two release runs FAILED and
  published nothing. I reported the merges as though they implied publication;
  the only reason I knew otherwise is that I watched the run.
- **"`pnpm verify` exit 0" is not "CI green".** Said three times this session.
  `verify` does not run `readme-check`, and it cannot see a fresh clone — which
  is exactly where the turbo defect lives.
- **DEFERRED #46's "UNKNOWN — not measured"** is answered: up-bank ran the
  install and measured ONE instance. Entry updated.

## Traps

- **Fixing the instance you were shown is not fixing the class.** `test` was
  patched; `test:coverage` and `test:no-native` were not looked at, and the next
  release died in a fresh checkout after every PR check went green.
- **A red-drill that does not go red is evidence of a broken drill**, not of a
  passing test. Removing `cli.ts`'s brand import changed nothing because
  `index.js` imports it transitively.
- **A stale branch can be a REGRESSION dressed as salvage.**
  `ci/stop-duplicating-work-per-os` proposed dropping the macOS leg, arguing the
  legs "never disagreed on a real defect". `main` already carries a later
  rationale saying the opposite — macOS caught a tsx SIGKILL/IPC timing defect
  shipped into every generated repo. Deleted, not landed.
- **`lint:fix` after copying to `lib/` silently creates golden drift.**

## Tree

`main` at `02ef4dc`, clean. One open PR (#112). Branch cleanup done: four dead
local branches and two fully-merged remote remnants deleted; `--prune` cleared
~10 stale refs. `fix/resync-example-after-skipped-job` was superseded (it bumped
`example/` to `^0.9.0`; `main` is at `^1.0.0`).

## Resume

Merge #112 → the release job should publish `mcp-kit@2.0.0` and
`robustness@0.14.0`. **Confirm with `npm view`, never from the workflow's exit
status.** Then notify consumers with two migration notes: declare
`@george43g/robustness` yourself (peer dep), and inject `hostLoadReader` in any
test that drives the hard event-loop path and asserts a kill.

---

# 2026-08-30 (post-crash checkpoint) — two tasks PARKED for the next context

**Precedence: where this entry and any summary disagree, this entry is correct.**
The machine crashed after the 2.0.0/0.14.0 releases published; a full post-crash
audit found git/PRs/npm/records all consistent and nothing to recover. These two
tasks were in flight or newly surfaced, and are parked here fully specified so
they can be executed without re-deriving anything.

## State

`main` at `fc1aa19`, clean, level, no open PRs, no stashes/worktrees.
Published (verified `npm view` 2026-08-30): `mcp-kit@2.0.0`,
`robustness@0.14.0`, `cli-kit@2.0.1`, `tui-kit@0.5.1`, `secret-store@0.2.2`.
Global `mcp-scaffold` bin is a live symlink into `apps/scaffolder` — tracks
every build, never goes stale.

## PARKED 1 — consumer notifications for mcp-kit 2.0.0 + robustness 0.14.0

Never sent; the crash killed the session at exactly this step. Send via
SendMessage under the `querying-peer-agents` contract. **Run `ListAgents` first
— browser-tab session names churn (the defect reporter `browser-tab-mcp-4f` is
long gone), so address whichever browser-tab session is live and write
self-contained.** Recipients: `up-bank-mcp` (asked to be told), the live
browser-tab session, `eqstack`, `life-stack`.

**Rule: cite `npm view` output run AT SEND TIME, never the numbers above.**

Content per release:

- **mcp-kit 2.0.0 (breaking):** `@george43g/robustness` moved from
  `dependencies` to `peerDependencies`, range `>=0.11.0 <1` (deliberately wide —
  every symbol mcp-kit imports exists at 0.11.0, verified against the published
  `index.d.ts`). **Migration: declare robustness in your own package.json** —
  every known consumer already does, so for them it is a version bump with no
  code change. This removes the split-instance hazard BY CONSTRUCTION, so the
  1.0.0 "bump robustness first" ordering note is moot on 2.0.0. Verify with
  `grep -oE "@george43g/robustness@[0-9.]+" pnpm-lock.yaml | sort -u` → one line.
- **robustness 0.14.0:** the hard event-loop path (`event_loop_blocked`) is now
  starvation-classified too — a starved verdict DEFERS the kill (never cancels;
  `starvationMaxConsecutive`, default 5, ≈25s worst case), after up-bank measured
  an 11567ms sample at load 58 being killed. CPU baseline now seeded at
  `install()`. `watchdog_installed` now carries `starvation_aware` + the three
  thresholds, so operators can tell which classifier runs from logs alone
  (up-bank's ask). **Migration note that will bite silently: any test that
  drives the hard path and asserts a kill must inject `hostLoadReader` (e.g.
  `() => 0`)** — a test process is low-CPU by nature, so on a loaded CI host the
  kill is deferred and the test reads as flake. This repo's own suite hit it in
  two tests.
- up-bank offered to report back the one-vs-two lockfile count after bumping;
  invite that. browser-tab should confirm their ~126 respawns stopped on
  0.13.0+ — the `event_loop_starved_not_killed` diagnostic now carries
  `duty_cycle`/`host_load`/`verdict`.

## PARKED 2 — `check-deps-stale.mjs` zero-entries fix

**The weekly job will fail every scheduled run until this lands.** First
scheduled run already failed (run on `fc1aa19`, `schedule` event). Reproduced
locally:

```
check-deps-stale: FAILED — found no @george43g/* resolutions in pnpm-lock.yaml.
  Either nothing depends on them, or the parser broke. Both need a human.
```

Root cause is LEGITIMATE state meeting a designed-loud control: the peer change
(#109) removed the last registry-resolved first-party entry — the lockfile now
has ZERO (`grep -cE "'@george43g/[a-z-]+@[0-9.]+'" pnpm-lock.yaml` → 0), all
first-party edges are `workspace:` links, which `readLock()` correctly excludes.

Fix shape: distinguish three outcomes — (a) registry entries found → check them
as today; (b) **no registry entries but first-party `link:` entries present →
PASS with a message saying the workspace is link-only** (count the links so the
message is affirmative, not an absence); (c) neither → FAIL as today (parser
broke). Red-drill both new branches. Small PR; `verify` does not run it, so CI
green ≠ fixed — confirm by running the script.

## Open (unchanged, George's)

| slug | question |
|---|---|
| `release-token-edited-trigger` | `ci.yml` `pull_request:` lacks `types: [..., edited]`, so a PR body edited after CI goes green is never re-checked — and the body becomes the squash commit. One line, but decide deliberately. |
| `handoff-direct-push-5d86258` | Revert the 2026-08-23 direct-to-main docs push and re-land as a PR, or leave it. Do not revert unilaterally. |

## Resume

Do PARKED 1 then PARKED 2, in that order — consumers are running old kits until
told, and the staleness job fails weekly, not hourly.

---

# 2026-09-02 (AEST) — precompact artifact

**Precedence: where this file and the post-compact summary disagree, this file
is correct.** This entry supplements the parked-tasks entry directly above; it
does not restate it.

## State

`main` at `d22ff0a`, clean, level with origin, no open PRs; both releases
published and verified; two executable tasks parked in the entry above.

## Corrections

- **The entry above is headed "2026-08-30" but was COMMITTED 2026-09-02 04:12
  AEST** (`git log -1 --format=%ci d22ff0a`). My context's date was two days
  stale — the crash gap passed without the context advancing. The content is
  correct; only the heading's date is wrong. Left standing per append-only;
  this line is the correction.
- "Global mcp-scaffold is stale" (said in-session, already retracted there):
  I `cmp`'d the pnpm SHIM against `dist/cli.js`. The shim's target is a live
  symlink into the workspace and was identical. Measurement right, subject
  wrong.

## Open

- `notify-consumers-2.0.0-0.14.0` · mcp-cli-toolkit — never sent (crash killed
  the session at this step). Send-ready spec in the entry above.
- `deps-stale-zero-entries` · mcp-cli-toolkit — never attempted; the scheduled
  run on `fc1aa19` failed and will fail weekly until fixed. Spec above.

## Blocked on you

- `release-token-edited-trigger` · mcp-cli-toolkit — decide whether `ci.yml`'s
  `pull_request:` gains `types: [opened, synchronize, reopened, edited]`.
  Never attempted; asked 2026-08-25 and since, unanswered.
- `handoff-direct-push-5d86258` · mcp-cli-toolkit — revert-and-PR or leave.
  Asked 2026-08-23, unanswered. Do not revert unilaterally.

## Traps

- **A context's "today" can silently lag days across a crash gap.** `date`
  before every stamp; `git log --format=%ci` is the arbiter afterwards.
- **`cmp` on a launcher shim measures the shim.** Resolve to the target first;
  "what is this the measurement OF?" catches what re-running never will.

## Tree

`/Users/george/repos/mcp-cli-starter-template`, branch `main`, 0/0 vs origin,
no dirty paths, no stashes, sole worktree — all mine.

## Resume

Execute PARKED 1 then PARKED 2 from the entry above, in that order. Before
PARKED 1, run `ListAgents` (browser-tab session names churn) and `npm view`
(never quote versions from this file). Nothing is mid-flight: no background
tasks, no staged work, no unanswered peer queries.

---

# 2026-09-02 05:32 AEST — both parked tasks CLOSED; a third found and shipped

**Precedence: where this entry and any summary disagree, this entry is correct.**

## State

Both parked tasks executed and closed. A consumer-reported defect in
robustness 0.14.0 was confirmed, fixed, and published as **0.14.1** in the
same sitting. `main` clean and level; no open PRs.

## Done

- `notify-consumers-2.0.0-0.14.0` — CLOSED. All four notices sent (up-bank,
  browser-tab, eqstack, life-stack), versions cited from `npm view` at send
  time. Returns: up-bank's single-instance grep recorded in DEFERRED #46 as
  the second independent measurement (their commit `a1cab10`); life-stack
  corrected the consumer map (mcpsync consumes robustness only, NOT mcp-kit —
  `apps/mcpsync/package.json:51`); browser-tab answered honest-unknown
  (0.13.0 never deployed — their `^0.12.0` caret pinned the minor through two
  releases; now `^0.14.0` via their PR #138, daemon restart George-gated).
- `deps-stale-zero-entries` — CLOSED by PR #114 (`593ef59`). Three-outcome
  split; link-only lockfile now PASSES affirmatively (19 edges / 9 packages
  named). Red-drilled: fixture test failed against the old code first. New
  `scripts/check-deps-stale.test.mjs` runs the real script against fixture
  lockfiles; 62/62 script tests. `verify` does not run this check — confirmed
  by executing the script against the live lockfile, exit 0.
- **NEW, found mid-task:** robustness 0.14.0 shipped `starvationDutyCycle`
  default **0.15** while its own doc comment/README/rationale said **0.05**
  (`watchdog.ts:279` vs `:127` at v0.14.0). Caught by up-bank reading their
  restarted service's live `watchdog_installed` line against my release note.
  Fixed by PR #115 (`a95d8ce`) → **robustness@0.14.1** published (release run
  33548882442, success). Verified in the shipped artifact itself: unpacked the
  0.14.1 tarball, `dist/watchdog.js` carries `STARVATION_DUTY_CYCLE", 0.05`.
  The self-evidencing test now pins EXACT defaults (0.05/1.0/5), not
  `expect.any(Number)` — presence-not-value was the hole. Both restart-gated
  consumers pinged; up-bank closes their `robustness-0.14.1-threshold-fix`
  row on the new pid's log line. up-bank ran 0.14.0's 0.15 for the interim by
  explicit, endorsed choice (bounded days of a conjunction-gated miss window
  beats a stale launchd override).

## Corrections

- The same release run cut **`cli-kit@2.0.2` — spurious but benign.**
  `fc1aa19` (#113, typed `fix(ci)`) also touched
  `packages/cli-kit/src/tty.test.ts`; semantic-release reads the TYPE against
  every package directory a commit touches. 2.0.1→2.0.2 diff is tests/README
  only, `dist/` unchanged. Trap refined: **the workflow's `paths` exclusion
  gates the TRIGGER, not the analyzer** — a later legitimate release run still
  counts the earlier commit. The defence remains commit-type discipline: the
  cli-kit test edit inside #113's squash should have been its own
  `test(cli-kit):` commit/PR.

## Open

Nothing open that this session owns.

## Blocked on you (unchanged, asked before)

- `release-token-edited-trigger` · mcp-starter-template — add
  `types: [opened, synchronize, reopened, edited]` to `ci.yml`?
- `handoff-direct-push-5d86258` · mcp-starter-template — revert-and-PR or
  leave. Not reverting unilaterally.

## Elsewhere

- `robustness-0.14.1-threshold-fix` · up-bank-mcp — their pickup row; closes
  on their new pid logging `starvation_duty_cycle":0.05`.
- browser-tab daemon restart onto 0.14.1 · browser-tab-mcp — George-gated at
  their end; their standing evidence ask follows it.

## Tree

`/Users/george/repos/mcp-cli-starter-template`, `main` at `ad1a4c0`
(release bump + resync commits pulled), level with origin, clean — all mine.

## Resume

Nothing mid-flight. Next session: only the two Blocked-on-you decisions
remain; consumer evidence (up-bank's log line, browser-tab's post-restart
report) arrives as peer messages and needs no chasing.

**Update, same day 05:44 AEST:** `robustness-0.14.1-threshold-fix` · up-bank-mcp
is CLOSED — their production service (pid 97601) logs
`starvation_duty_cycle":0.05` verbatim; full first-hand chain (npm view,
scoped update, single-instance grep → `@george43g/robustness@0.14.1`, verify,
stress 16/16, /health 200) in their BACKLOG close `a737367`. Interim exposure
lasted under a day; the spurious cli-kit 2.0.2 was not pulled by their scoped
update. Thread closed both sides. Remaining Elsewhere row: only the
browser-tab daemon restart.

**Update, 05:52 AEST:** browser-tab daemon restart · browser-tab-mcp is DONE —
George authorized it; daemon pid 30762 (started 2026-09-01T23:54:49Z) runs
0.14.1 and its `watchdog_installed` line carries `starvation_aware":true,
"starvation_duty_cycle":0.05` verbatim (their log
browser-tab-daemon-30762-2026-09-01T23-54-49.ndjson). They updated BEFORE
restarting, so 0.14.0's 0.15 window was never live there. Remaining external
observation, self-scheduled at their end: the next parallel-agent load storm
either fires `event_loop_starved_not_killed` (verbatim line promised) or the
daemon survives a storm that previously killed it ~10/hour — whichever
arrives, dated. Nothing owed from this side.

**Update, 2026-09-03 — stdout-purity claim made true (`2cc7f68`, PR #116).**
dotfiles' fleet audit traced two false sentences in descendant repos to the
stamped `11-agent-files/lib/AGENTS.md`: "CI grep enforces this" (no grep
existed anywhere; the stress harness silently skips non-JSON stdout lines, so
the invariant had NO enforcement) and a fictional `TOOL_TIMEOUTS_MS` (real
mechanism: `ToolDefinition.timeoutMs`; six sites corrected). Fixed by
IMPLEMENTING: `scripts/check-stdout-purity.mjs` (mcp-kit-marker scoped,
positive controls both ways, 6 subprocess tests) wired into verify+CI here,
in the generated repo, and stamped with a golden byte-equality mapping.
DEFERRED #48 records the general symbol-resolution docs check + trigger.
Descendants' local copies of the false text stay with dotfiles' audit scope
(offered to send corrected text; awaiting their preference). No release fired
— no `packages/**` path in the diff.

**Update, 2026-09-03 06:55 AEST:** the descendant-copies row is CLOSED without
action — both repos fixed their local false text in parallel before my offer
arrived (up-bank `55e03f9`, browser-tab PR #168; dotfiles confirmed "do not
message"). dotfiles recorded the origin findings in the audit (`df1a6d2`) and
corrected the skill's overstatement of path-checker reach (`7d22447`);
DEFERRED #48 upgraded to record the settled position and the
selector-regression warning. Nothing owed anywhere on this thread.
