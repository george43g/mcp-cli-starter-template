# mcp-cli-starter-template — Agent Guide

> `CLAUDE.md` is a symlink to this file. Edit `AGENTS.md`; it follows.

You're working on **the scaffolder repo + canonical static template**: the meta-tool that generates MCP+CLI+TUI starter projects and retrofits existing MCP servers to match. The generated repo's own guide is `apps/scaffolder/src/phases/11-agent-files/lib/AGENTS.md.tmpl` (stamped as `AGENTS.md`; `.tmpl` so no tool loads the template as instructions).

This file is a map. It states each rule once; the reasons behind the rules are in the linked docs.

## Current handoff

Before continuing an existing thread, read [`HANDOFF.md`](HANDOFF.md) and
[`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md): Git state, verification
evidence, retrofit safety invariants, dependency decisions, deferred work.

## What this repo is

1. **The static "golden output"**: `apps/example-repo-mcp/`, `apps/rust-accel/`, `packages/*`, `docs/`, etc., the literal files the scaffolder ships. CI rebuilds and tests it on every PR.
2. **The scaffolder/migrator** at `apps/scaffolder/` (bin `mcp-scaffold`): `init`, `apply`, `migrate`, `add-mcp-app`.

**The golden rule**: `apps/scaffolder/src/phases/<NN>-<slug>/lib/` holds byte-identical
copies of the canonical sources, and `example/` is regenerated output. Editing one
surface usually means syncing the others; `apps/scaffolder/tests/golden.test.ts`
fails CI when canonical and `lib/` diverge.

## Where knowledge lives

| Source | Read when |
|---|---|
| [`apps/scaffolder/AGENTS.md`](apps/scaffolder/AGENTS.md) | Working on the scaffolder: architecture, migrations/phases, drift rules, troubleshooting |
| [`docs/README.md`](docs/README.md) | Index of all docs, repo-facing vs golden-output |
| [`DEFERRED.md`](DEFERRED.md) | The backlog: what was consciously not done, why, and the trigger. Read before proposing new work |
| [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) | The reasons behind the Conventions below |
| [`docs/CHECKS.md`](docs/CHECKS.md) | What each `verify` gate catches and why it exists |
| [`docs/plans/README.md`](docs/plans/README.md) | ExecPlan convention for multi-hour or risky work |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | The generated tool's four surfaces |
| [`docs/scaffolder-cli/retrofit-findings.md`](docs/scaffolder-cli/retrofit-findings.md) | Retrofit safety invariants: preserve these |
| [`skills/mcp-starter-architect/SKILL.md`](skills/mcp-starter-architect/SKILL.md) | Before retrofitting a real MCP server. **Linked machine-globally by dotfiles** (George 2026-09-03): renaming or moving this directory breaks every session on the machine; coordinate with the dotfiles session first. Content edits need nothing |
| [`skills.md`](skills.md) | Repo skills in `.agents/skills/` (`cli-artifacts`, `workspace-scaffolding`, `mcp-tool-author`, `pr-review-sop`, …), each linked from `.claude/skills/` |

## Stack

Node.js ≥24, ESM only, pnpm 10.29.3 (Turborepo), Vite library mode, Biome 2.x,
Vitest, `@modelcontextprotocol/sdk` ^1.29, `commander` ^14, `ink` ^7 + `react` ^19,
Zod ^3, optional `napi-rs` v3, `usage` (jdx/usage-cli) for CLI spec/completions/manpage.

## Workspace topology

```
apps/
  example-repo-mcp/   live "golden output": the cloned tool's source
  rust-accel/         napi-rs v3 crate
  scaffolder/         the meta-tool `mcp-scaffold` (see its AGENTS.md)
packages/
  robustness/         env + logger + watchdog + shutdown + timeout + health + retry + rate-limit
  mcp-kit/            tool-registry + dispatch + transports + sanitize + prompt-injection
  cli-kit/            commander + tty + color + REPL + env↔flag binder
  tui-kit/            ink themes + hooks + components
  secret-store/       env → .env → OS keychain → exec. No vault vendor code
  shared-types/       Zod schemas + Rust drift-check
  tsconfig/ biome-config/  shared tool config, never published
  vitest-config/      shared preset, also never published: coverage target 80/70/70/70
                      packages, 50/40/40/40 apps; `withCoverageFloor()` below it
```

## Commands

Why each check exists: [`docs/CHECKS.md`](docs/CHECKS.md).

| Command | Purpose |
|---|---|
| `pnpm install` / `pnpm build` | Install; Turbo build of TS workspaces + optional Rust crate |
| `pnpm test` / `pnpm test:coverage` | All workspace tests; the same plus each workspace's coverage floor |
| `pnpm test:no-native` | Force the TS fallback (`MCP_DISABLE_NATIVE=1`) |
| `pnpm typecheck` | `tsc -b` over the root solution |
| `pnpm lint` / `pnpm lint:fix` | Biome |
| `pnpm test:scripts` | Node's test runner over `scripts/**/*.test.mjs` |
| `pnpm check:docs` | Relative links, agent-file symlinks, docs index, AGENTS.md chain ≤ 28,000 B |
| `pnpm check:skills` | `link-repo-skills --check` on `.` and `example/`; skips with one line where the skill is absent |
| `pnpm check:stdout-purity` | No `console.*` in an MCP app's `src/` |
| `pnpm check:stale-plans` | ExecPlan status present, consistent, and not silently stale |
| `pnpm check:stress-count` | Stress harness `EXPECTED_ASSERTIONS` vs every prose site quoting it |
| `pnpm check:publishable-manifests` | Publish shape of the npm-published packages |
| `pnpm check:registry-boundary` | Generated-app imports only use RELEASED kit APIs |
| `pnpm check:workflows` | `actionlint` over all three workflow surfaces (`mise install` first) |
| `pnpm check:turbo-tasks` | Every test-running turbo task depends on its OWN `build` |
| `pnpm check:test-projects` | Test tsconfig projects are wired into the solution |
| `pnpm check:deps-stale` | Registry freshness of first-party deps. **Not in `verify`** (network); weekly workflow. Exit 2 = unreachable, not a pass |
| `pnpm verify` | Everything above except `check:deps-stale` (the CI shape) |
| `pnpm stress` | 15-assertion MCP stress harness against `apps/example-repo-mcp/` |
| `pnpm regen:example` | Rebuild the tracked `example/` from the scaffolder |

Scaffolder-only commands are in [`apps/scaffolder/AGENTS.md`](apps/scaffolder/AGENTS.md).

## Conventions

Reasons and incidents: [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) and
[`docs/RELEASE.md`](docs/RELEASE.md#commit-rules-how-a-message-becomes-a-version).

- **Single source of truth**: canonical files at the repo root + `apps/example-repo-mcp/` + `packages/*`; `lib/` copies are drift-checked.
- **A new kit API and its generated-app call site are TWO PRs, publish first.** Generated repos resolve `@george43g/*` from npm. Park the call site in `DEFERRED.md` #28.
- **No emojis in source code** unless the user asks. Comments stay terse and say why.
- **Prefer canonical CLIs** (`pnpm init`, `pnpm pkg set`, `git init`) over copying files. Templates live in `lib/`.
- **Conventional Commits** drive semver via `release.yml` (disabled by default).
- **A commit's TYPE applies to every published package whose directory it touches**; the scope is ignored. Use `chore:`/`test:`/`docs:` inside `packages/{robustness,cli-kit,tui-kit,secret-store}/` unless published behaviour changes.
- **A commit's type is read against its whole DIFF.** A fix that also adds public API is a `feat:`. Check before writing the type.
- **A breaking marker on a 0.x package publishes 1.0.0**, not the next minor (DEFERRED #34). Write `!` or the breaking footer only when you mean to cut 1.0.0.
- **NEVER spell a release-control token in commit prose.** The breaking-change footer token counts anywhere in a body. To write about it, use lowercase prose and do not spell the literal. Enforced by `release-tokens` in PRs and before every release.
- **Rendered output is not covered by semver.** When changing what a kit prints, say so in its README.
- **A generated monorepo is not an MCP monorepo.** George, 2026-09-23: *"the mcp naming is a vestigial leftover, and many of the tools i build happen to have an mcp api surface … by no means are we LIMITED to that … we can include all kinds of apps that do all kinds of things."* Gate MCP-specific checks on the mcp-kit dependency (DEFERRED #52, #53).
- **You work FOR the consuming agents.** A consumer's kit request is a work order. Decline only when it would concretely break another consumer, and say what would have to change. Verify their premise against the source; prefer additive, optional shapes. **Publishing still needs the user's own approval**; a relayed "George says" is not approval.
- **Never hand-carry a version number to a consumer; cite `npm view`.**
- **Shared-tool-config packages (`tsconfig`, `vitest-config`, `biome-config`) are NEVER published.** They stay `private: true`; `scripts/check-publishable-manifests.mjs` enforces it.
- **Repo skills live in `.agents/skills/<name>/`** with a tracked relative `.claude/skills/<name>` link; run `link-repo-skills --apply` after adding one. Exception: `skills/mcp-starter-architect/` stays put (machine-global link).
- **Keep every AGENTS.md chain ≤ 28,000 B** (Codex truncates at 32,768). Move rationale out, not rules.

## Validation & CI

`.github/workflows/ci.yml`: ubuntu + macos, node 24, the `verify` steps plus
`test:no-native`, usage(1) artifact freshness, npm pack dry-run, scaffolder E2E
smoke, stress harness and the `example/` sync check; a lean `windows-latest`
job runs the suites that spawn processes or print paths. Also
`release-tokens.yml`, `release.yml` ([`docs/RELEASE.md`](docs/RELEASE.md)),
`screenshots.yml`, `readme-check.yml` (bypass `[skip-readme]`); see
[`docs/CHECKS.md`](docs/CHECKS.md#ci-workflows). On failure, check the
troubleshooting section of [`apps/scaffolder/AGENTS.md`](apps/scaffolder/AGENTS.md)
first. Most failures come from a generated surface that is out of sync.

## Plans

Multi-hour, cross-surface or risky work gets a checked-in ExecPlan under
[`docs/plans/`](docs/plans/README.md), never a file outside the repo.

## MCP servers (project scope)

`.mcp.json` is canonical (`${VAR}` placeholders only, never literal secrets).
`.cursor/mcp.json` and `.warp/.mcp.json` symlink to it; `opencode.json`'s `mcp`
key and `.codex/config.toml` are GENERATED. After editing `.mcp.json`, run
`mcpsync sync --scope project --yes`. `mcpsync` lives in `life-stack` now
(DEFERRED #10); details in [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md#mcp-config-mcpjson-is-canonical).
