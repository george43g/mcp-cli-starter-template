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
| `pnpm check:publishable-manifests` | Publish shape of the npm-published packages: repository metadata, `files`, no `workspace:` in shipped deps |
| `pnpm verify` | lint + docs check + manifest check + typecheck + test:coverage + build (the CI shape) |
| `pnpm stress` | 13-assertion MCP stress harness against `apps/example-repo-mcp/` |
| `pnpm regen:example` | Rebuild the tracked `example/` output from the scaffolder |

Scaffolder-only commands (codegen, smoke, usage artifacts) are tabled in
[`apps/scaffolder/AGENTS.md`](apps/scaffolder/AGENTS.md).

## Conventions

- **Single source of truth**: canonical files at the repo root + `apps/example-repo-mcp/` + `packages/*`. The scaffolder's `lib/` directories are byte-identical copies, drift-checked.
- **No emojis in source code unless the user requests.** Comments stay terse and "why"-focused.
- **Prefer canonical CLIs** (`pnpm init`, `pnpm pkg set`, `git init`) over file-copying for setup steps. Templates live in `lib/`; raw fs writes for small literals.
- **Conventional Commits** drive semver via the (disabled-by-default) `release.yml` workflow.
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
npm pack dry-run → scaffolder E2E smoke → 13-assertion stress harness →
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
