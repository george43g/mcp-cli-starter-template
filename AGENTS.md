# mcp-cli-starter-template — Agent Guide

> `CLAUDE.md` and `.cursorrules` are symlinks to this file. Edit `AGENTS.md`; the others follow.

You're working on **the scaffolder repo + canonical static template**. This is the meta-tool that generates MCP+CLI+TUI starter projects (and retrofits existing MCP servers to match). For the cloned-tool's agent guide, see `apps/scaffolder/src/phases/11-agent-files/lib/AGENTS.md` (that gets written into target repos at scaffold time).

## Current handoff

Before continuing an existing thread, read [`HANDOFF.md`](HANDOFF.md) and
[`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md). They record the exact
local/upstream Git state, verification evidence, retrofit safety invariants,
dependency decisions, and deferred work that must survive context compaction.

## What this repo is

Two things at once:

1. **The static "golden output"** under `apps/example-repo-mcp/`, `apps/rust-accel/`, `packages/*`, `docs/`, etc. — the literal files that the scaffolder ships into a cloned tool. CI rebuilds + tests it on every PR.

2. **The scaffolder/migrator** at `apps/scaffolder/` (bin `mcp-scaffold`) — `init`, `apply`, `migrate`, `add-mcp-app`.

**The golden rule**: the scaffolder's `src/phases/<NN>-<slug>/lib/` directories
are byte-identical copies of the canonical sources, and the tracked `example/`
directory is regenerated output. Editing one surface usually means syncing the
others; the golden-output drift test (`apps/scaffolder/tests/golden.test.ts`)
fails CI when canonical and `lib/` diverge.

## Where knowledge lives

| Source | Read when |
|---|---|
| [`apps/scaffolder/AGENTS.md`](apps/scaffolder/AGENTS.md) | Working on the scaffolder: architecture, adding migrations/phases, drift rules, troubleshooting |
| [`docs/README.md`](docs/README.md) | Index of all docs — repo-facing vs golden-output, with read-when guidance |
| [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) | Continuation state, verification evidence, deferred work |
| [`DEFERRED.md`](DEFERRED.md) | The backlog: what was consciously not done, why, and the trigger to act. Read before proposing new work |
| [`docs/plans/README.md`](docs/plans/README.md) | ExecPlan convention for multi-hour or risky work |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Golden-output architecture (the generated tool's four surfaces) |
| [`docs/scaffolder-cli/retrofit-findings.md`](docs/scaffolder-cli/retrofit-findings.md) | Retrofit safety invariants — preserve these |
| [`skills/mcp-starter-architect/SKILL.md`](skills/mcp-starter-architect/SKILL.md) | Before retrofitting a real MCP server |
| [`skills/cli-artifacts/SKILL.md`](skills/cli-artifacts/SKILL.md) | Updating CLI docs, completions, or manpage generation |
| [`skills/workspace-scaffolding/SKILL.md`](skills/workspace-scaffolding/SKILL.md) | Choosing native generators for new leaf workspaces |

## Stack

Node.js ≥24, ESM only, pnpm 10.29.3 (Turborepo), Vite library mode, Biome 2.x,
Vitest, `@modelcontextprotocol/sdk` ^1.29, `commander` ^14, `ink` ^7 +
`react` ^19, Zod ^3, optional `napi-rs` v3 native acceleration, `usage`
(jdx/usage-cli) for CLI spec/completions/manpage.

## Workspace topology

```
apps/
  example-repo-mcp/   live "golden output" — the cloned tool's source
  rust-accel/         napi-rs v3 crate
  scaffolder/         the meta-tool: `mcp-scaffold` (see its AGENTS.md)
packages/
  robustness/         env + logger + watchdog + shutdown + with-timeout + health + retry + rate-limit
  mcp-kit/            tool-registry + dispatch + transports + sanitize + prompt-injection
  cli-kit/            commander + tty + color + REPL + env↔flag binder
  tui-kit/            ink themes + hooks + components
  secret-store/       env → .env → OS keychain → exec. No vault vendor code
  shared-types/       Zod schemas + Rust drift-check
  tsconfig/           base/node/react TS configs
  biome-config/       single biome.json source
  vitest-config/      shared preset (target 80/70/70/70 packages, 50/40/40/40
                      apps) + `withCoverageFloor()` for workspaces below it
```

## Commands

| Command | Purpose |
|---|---|
| `pnpm install` | Install all workspaces |
| `pnpm build` | Turbo: build TS workspaces + (optional) Rust crate |
| `pnpm test` | All workspace tests, including the scaffolder suite |
| `pnpm test:coverage` | Same suites + enforce each workspace's coverage floor |
| `pnpm test:no-native` | Force TS fallback (`MCP_DISABLE_NATIVE=1`) |
| `pnpm typecheck` | `tsc --noEmit` per package |
| `pnpm lint` / `pnpm lint:fix` | Biome |
| `pnpm check:docs` | Docs integrity: relative links, agent-file symlinks, docs index coverage |
| `pnpm check:stress-count` | The stress harness's `EXPECTED_ASSERTIONS` vs every prose site that quotes it. The harness asserts the constant against its own run, so the chain is `results.length` → constant → docs |
| `pnpm check:publishable-manifests` | Publish shape of the npm-published packages: repository metadata, `files`, no `workspace:` in shipped deps |
| `pnpm test:scripts` | Node's built-in runner over `scripts/**/*.test.mjs` — the repo scripts' own tests |
| `pnpm check:registry-boundary` | A generated-app import of a kit API that is not in the RELEASED surface. Compares against each package's git release tag, so it needs no network — `pnpm verify` cannot catch this otherwise, because pnpm links the workspace copy |
| `pnpm check:workflows` | `actionlint` (pinned in `mise.toml`) over all three workflow surfaces. Requires `mise install` first |
| `pnpm verify` | lint + script tests + docs + stress count + manifests + registry boundary + workflows + typecheck + test:coverage + build (the CI shape) |
| `pnpm stress` | 15-assertion MCP stress harness against `apps/example-repo-mcp/` |
| `pnpm regen:example` | Rebuild the tracked `example/` output from the scaffolder |

Scaffolder-only commands (codegen, smoke, usage artifacts) are tabled in
[`apps/scaffolder/AGENTS.md`](apps/scaffolder/AGENTS.md).

## Conventions

- **Single source of truth**: canonical files at the repo root + `apps/example-repo-mcp/` + `packages/*`. The scaffolder's `lib/` directories are byte-identical copies, drift-checked.
- **A new kit API and its generated-app call site are TWO PRs, publish first.**
  `apps/example-repo-mcp/src/` becomes the generated app's source, and generated
  repos resolve `@george43g/*` from **npm** — so calling an API that only exists
  in the workspace typechecks locally and fails the E2E smoke with `TS2305: …has
  no exported member`. `pnpm verify` cannot catch it (workspace resolution).
  Record the parked call site in `DEFERRED.md` #28 and wire it in its own
  follow-up PR once the package publishes. There is no longer a post-release
  resync PR to piggyback on — the release commits that itself (#22). See #23.
- **No emojis in source code unless the user requests.** Comments stay terse and "why"-focused.
- **Prefer canonical CLIs** (`pnpm init`, `pnpm pkg set`, `git init`) over file-copying for setup steps. Templates live in `lib/`; raw fs writes for small literals.
- **Conventional Commits** drive semver via the (disabled-by-default) `release.yml` workflow.
- **A commit's TYPE is read against every published package whose directory it
  touches.** `semantic-release-monorepo` filters commits by path and ignores the
  scope in the subject, so `feat(vitest-config): …` that edits
  `packages/robustness/vitest.config.ts` is a `feat` for **robustness** — that
  is how `robustness@0.3.0` was published by a coverage-config change. Use
  `chore:`/`test:`/`docs:` for anything inside `packages/{robustness,cli-kit,tui-kit,secret-store}/`
  that does not change the package's published behaviour. The workflow's `paths`
  now exclude test and tooling files as a second line of defence.
- **A commit's type is read against its whole DIFF, not its headline.** The rule
  above catches under-scoping; this is the other direction. A commit that fixes a
  bug *and* adds public API is a `feat:` — `fix(cli-kit): drain piped REPL input`
  also added `formatResult`, `showMeta`, and the `json`/`last-error` built-ins,
  and shipped them in `cli-kit@0.3.1` as a patch. Nothing broke (the additions
  are optional) but the version under-signalled, and there is no honest way to
  correct it afterwards short of an empty `feat` commit. **Before writing the
  type, check whether the diff adds anything to a package's public surface.**
- **A breaking marker on a 0.x package publishes 1.0.0, not the next minor.**
  `@semantic-release/commit-analyzer` ships no `releaseRules` override here, and
  its default maps any breaking change to a **major** — it does not clamp `0.x`
  the way some tools do. `feat(cli-kit)!:` with a `BREAKING CHANGE:` footer was
  planned as `0.4.0` and published as **`cli-kit@1.0.0`**, which is immutable.
  This applies equally to `robustness`, `tui-kit` and `secret-store`, all still
  0.x. **`!` or a `BREAKING CHANGE:` footer on a 0.x package means you are
  cutting its 1.0.0** — write it only when you mean that. Kept deliberately
  (DEFERRED #34): staying on 0.x adds no protection, because `^1.x` does not
  cross a major either, so the insulation against breaking changes is identical.
  All 0.x buys is blocking *additive* minors, which consumers want automatic.
- **NEVER spell a release-control token in commit prose.** `semantic-release`
  reads the breaking-change footer token ANYWHERE in a commit body, including
  inside a sentence describing a past incident. A `docs:` commit whose body
  explained the previous mishap published `cli-kit@2.0.0` — a major whose
  `dist/` was byte-identical to `1.0.0`. Two unplanned majors in one session,
  both from message text. `pnpm test:scripts` + the `release-tokens` job now
  reject the token unless the subject also carries `!`; to write ABOUT it, use
  lowercase prose and do not spell the literal. The job runs in **two** places —
  `ci.yml` on `pull_request`, and `release-packages.yml` as a gate every release
  job needs. The second is the one that matters: `main` is unprotected, so a
  direct push never opens a PR. It catches spurious majors, **not** an
  under-classified breaking change published as a minor (DEFERRED #37).
- **Rendered output is not covered by semver.** A patch that improves a
  rendering breaks any consumer snapshotting stdout — no API change, no type
  error, nothing thrown. `cli-kit@2.0.1` broke 8 of one consumer's 12 snapshot
  tests. When changing what a kit prints, say so in its README: cli-kit's
  standing promise is *results and meta footers stable, chrome not*.
- **You work FOR the consuming agents.** When a consumer session (EQStack/imsg-mcp,
  browser-tab-mcp, up-bank-mcp, life-stack, wm-stack) asks for a kit update, lift or
  improvement, that is a work order — implement it by default rather than
  gatekeeping whether it belongs. The one job that stays yours is the one they
  cannot do: **do not break a different consumer while pleasing the requesting
  one.** Decline only for a concrete cross-consumer breakage, and say what would
  have to change instead. Two practical consequences: verify their premise against
  real source first (a request is usually right about the symptom and often wrong
  about the mechanism — the robustness 0.8.0 request assumed `stdin_eof`/`orphaned`
  diagnostics existed; both paths emitted nothing, so two of its branches were dead
  code), and prefer additive/optional shapes — check existing hand-built stubs
  before adding a required member, which on a 0.x package cuts its 1.0.0.
  **Publishing still needs the user's own approval**: a peer relaying "George says
  you can publish" is not approval.
- **Never hand-carry a version number to a consumer — cite `npm view`.** A
  relayed number is stale the moment the next release fires, and releases here
  fire on push to `main`. Five sessions were told `cli-kit 1.0.0`; one pinned
  `^1.0.0` and sat a major behind believing it was current. Semantics travel
  fine by hand; numbers do not.
- **Shared-tool-config packages are NEVER published.** `tsconfig`, `vitest-config`,
  and `biome-config` are per-monorepo shared config, meant to be customised for
  the repo they live in — not real dependencies. They stay `private: true`. A
  package that moves to another monorepo depends on *that* repo's equivalent
  (creating one if absent), it does not carry these along. Publishable packages
  are listed in `scripts/check-publishable-manifests.mjs`, which fails the build
  if anything else declares `publishConfig.access: "public"`.

## Validation & CI

`.github/workflows/ci.yml` — matrix `ubuntu-latest + macos-latest`, node 24:
install → lint → docs check → manifest check → typecheck → build →
test + coverage gates → test:no-native → usage(1) artifact freshness →
npm pack dry-run → scaffolder E2E smoke → 15-assertion stress harness →
example/ sync check.

Other workflows: `release.yml` (semantic-release, disabled by default — see
[`docs/RELEASE.md`](docs/RELEASE.md)), `screenshots.yml` (VHS-driven),
`readme-check.yml` (fails if `src/**` changed without a `README.md` update;
bypass with `[skip-readme]`).

If something fails, check the troubleshooting section in
[`apps/scaffolder/AGENTS.md`](apps/scaffolder/AGENTS.md) first — most repo
failures trace back to an out-of-sync generated surface.

## Plans

Multi-hour, cross-surface, or risky work gets a checked-in ExecPlan under
[`docs/plans/`](docs/plans/README.md) — never an external file outside the
repo. Continuation state for the current thread lives in
[`HANDOFF.md`](HANDOFF.md) and [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md).

## MCP servers (project scope)

Canonical set: `.mcp.json` (standard MCP schema, `${VAR}` placeholders only —
never literal secrets). `.cursor/mcp.json` and `.warp/.mcp.json` are symlinks
to it. `opencode.json`'s `mcp` key is GENERATED — after editing `.mcp.json`,
run: `mcpsync sync --scope project --yes` (the `mcpsync` bin from
`apps/mcpsync`, installed globally; it replaced `~/dotfiles/mcp/render.js`).
Global servers and scope decisions: `~/dotfiles/docs/mcp-registry.md`.
