# mcp-cli-starter-template — Agent Guide

> `CLAUDE.md` and `.cursorrules` are symlinks to this file. Edit `AGENTS.md`; the others follow.

You're working on **the scaffolder repo + canonical static template**. This is the meta-tool that generates MCP+CLI+TUI starter projects (and retrofits existing MCP servers to match). For the cloned-tool's agent guide, see `apps/scaffolder/src/phases/11-agent-files/lib/AGENTS.md` (that gets written into target repos at scaffold time).

## Current handoff

Before continuing an existing thread, read `HANDOFF.md` and
`docs/PROJECT_STATE.md`. They record the exact local/upstream Git state,
verification evidence, retrofit safety invariants, dependency decisions, and
deferred work that must survive context compaction.

## What this repo is

Two things at once:

1. **The static "golden output"** under `apps/example-repo-mcp/`, `apps/rust-accel/`, `packages/*`, `docs/`, etc. — the literal files that the scaffolder will ship into a cloned tool. CI rebuilds + tests it on every PR.

2. **The scaffolder/migrator** at `apps/scaffolder/` (bin `mcp-scaffold`). 12 phases, 25 migrations, 172 generated template entries. Drives `init` (fresh scaffold), `apply` (target-profile-aware retrofit), and `add-mcp-app` (append a second MCP app to an already-scaffolded monorepo — runs only the 08-app phase under `mode='add'` with a collision guard).

The scaffolder's `src/phases/<NN-name>/lib/` directories are **byte-identical copies** of the canonical sources. The golden-output drift test (`apps/scaffolder/tests/golden.test.ts`) fails CI when these diverge.

## Stack

- **Runtime**: Node.js ≥24 (native `--env-file-if-exists`)
- **Module system**: ESM only (`type: "module"`)
- **Package manager**: pnpm 10.29.3 (Turborepo workspace)
- **Build**: Vite library mode (the scaffolder bundles to a single `dist/cli.js` with the lib templates inlined via codegen)
- **Lint/format**: Biome 2.x
- **Tests**: Vitest (globals on); 128 scaffolder tests + 14 cloned-tool integration tests + 27 mcp-kit unit tests + 68 robustness unit tests
- **MCP SDK**: `@modelcontextprotocol/sdk` ^1.29
- **CLI**: `commander` ^14
- **TUI**: `ink` ^7 + `react` ^19
- **Schemas**: Zod ^3 + `zod-to-json-schema`
- **Native acceleration (optional)**: `napi-rs` v3
- **CLI spec/completions**: `usage` (jdx/usage-cli) → bash/zsh/fish + manpage + markdown

## Workspace topology

```
apps/
  example-repo-mcp/                   live "golden output" — the cloned tool's source
  rust-accel/                     napi-rs v3 crate
  scaffolder/                     the meta-tool: `mcp-scaffold`
    bin/cli.ts                    commander entry (shebang via vite banner)
    src/
      core/                       Migration base + IoC config + phase runner + fs/git/shell/templating helpers + package-port + CREDITS.md
      phases/<NN>-<slug>/         one dir per migration phase
        lib/                      verbatim template files (drift-checked vs canonical)
        m1-*.ts, m2-*.ts          one Migration class per file
        index.ts                  phase manifest (Phase object)
      phases/index.ts             static barrel (vite-friendly)
      ui/                         banner, recap, progress
      generated/templates.ts      AUTO-GENERATED from lib/** (gitignored)
    scripts/build-templates.mjs   codegen: walks lib/** → generated/templates.ts
    tests/                        unit + integration + golden + migrations
    .usage.kdl                    CLI spec for usage(1)
    mise.toml                     dev tasks (build/dev/test/smoke/docs/completions/manpage)
packages/
  robustness/                     env + logger + watchdog + shutdown + with-timeout + health + retry + rate-limit
  mcp-kit/                        tool-registry + dispatch + transports + sanitize + prompt-injection
  cli-kit/                        commander + tty + color + REPL + env↔flag binder
  tui-kit/                        ink themes + hooks + components
  env-loader/                     Vite-style .env precedence
  secrets/                        env-JSON → 1Password → file chain
  shared-types/                   Zod schemas + Rust drift-check
  tsconfig/                       base/node/react TS configs
  biome-config/                   single biome.json source
  vitest-config/                  shared preset (80/70/70/70 for packages, 50/40/40/40 for apps)
```

## Commands

| Command | Purpose |
|---|---|
| `pnpm install` | Install all workspaces |
| `pnpm build` | Turbo: build TS workspaces + (optional) Rust crate |
| `pnpm test` | All workspace tests, including 128 scaffolder tests |
| `pnpm test:no-native` | Force TS fallback (`MCP_DISABLE_NATIVE=1`) |
| `pnpm typecheck` | `tsc --noEmit` per package |
| `pnpm lint` / `pnpm lint:fix` | Biome |
| `pnpm verify` | lint + typecheck + test + build (the CI shape) |
| `pnpm stress` | 13-assertion MCP stress harness against the canonical `apps/example-repo-mcp/` |

Scaffolder-only (run from inside `apps/scaffolder/`):
| Command | Purpose |
|---|---|
| `pnpm build:templates` | Codegen: scan `lib/**` → `src/generated/templates.ts` |
| `pnpm start -- <args>` | Run via tsx (dev) |
| `pnpm dev` | `vite build --watch` |
| `mise run smoke` | E2E: scaffold into /tmp + assert tests pass |
| `mise run docs` | Generate `docs/scaffolder-cli/*.md` |
| `mise run completions` | bash + zsh + fish |
| `mise run manpage` | `man/mcp-scaffold.1` |
| `pnpm artifacts` | Regenerate all scaffolder usage artifacts |
| `pnpm check:usage` | Byte-check scaffolder usage artifacts |

Repo skills:

- `skills/cli-artifacts/SKILL.md` — update or relocate CLI docs,
  completions, and manpage generation.
- `skills/workspace-scaffolding/SKILL.md` — choose native generators for new
  leaf workspaces without replacing the deterministic root scaffold.

## Scaffolder architecture (high level)

**Migration = atomic ruleset application.** Each migration is a class extending `Migration`, lives at `apps/scaffolder/src/phases/<NN>-<slug>/m<N>-<slug>.ts`. Its `apply()` reads from the IoC `ctx.config`, writes via `ctx.fs.writeIfChanged`, and returns a `MigrationResult`.

**Phase = a directory of related migrations.** Each phase has an `index.ts` exporting `{ order, id, title, migrations }`. Phases run sequentially in numeric order.

**IoC config** (`src/core/config.ts`): hand-rolled root object with `configLeaf<T>` leaves. Reading `await ctx.config.global.repoName.get()` fires an inquirer prompt iff the value hasn't been pre-set via a commander flag. `.peek()` reads without prompting (for `skipIf` predicates).

**Lib → templates codegen**: `scripts/build-templates.mjs` walks `phases/<NN>-<slug>/lib/**` and emits `src/generated/templates.ts` as `{ [relPath]: string }`. Migrations read via `TEMPLATES['04-robustness/lib/src/env.ts']`. The single bundle ships `npx`-friendly.

**Target-profile-aware apply**: target inspection classifies fresh, complete starter-derived, and generic existing repositories. Generic targets default to `--existing-strategy safe`, so only migrations marked `safe-any-existing` run. Complete starter layouts retain full behavior. `--existing-strategy full` or a named migration is the conscious opt-in to broader changes.

**Diff-safe writes**: `fs.writeIfChanged` honors `force`. In existing mode (force=false), files that exist + diverge are returned as `divergent-skipped` (preserved). `init` defaults to force=true. `--force` is the conscious overwrite.

## Adding a new migration

1. Identify the right phase. Add a new file `apps/scaffolder/src/phases/<NN>-<slug>/m<N>-<slug>.ts`.
2. Extend `Migration` base. Set `id`, `title`, `appliesTo: 'new' | 'existing' | 'both'`.
3. Implement `apply(ctx)`. Use `portPackage` if you're shipping a whole subtree; use `ctx.fs.writeIfChanged` directly for one-offs.
4. Register the migration in the phase's `index.ts`.
5. If the migration ships verbatim files, copy them into `lib/` (drift test will catch mismatches).
6. Add a test in `apps/scaffolder/tests/migrations.test.ts`.
7. Re-run `mise run smoke` to verify the scaffold + install + test loop still passes.

## Adding a new phase

1. `mkdir apps/scaffolder/src/phases/<NN>-<slug>/` (next two-digit prefix).
2. Add at least one migration class + `index.ts` exporting the `Phase`.
3. Add the import + push in `src/phases/index.ts` (the static barrel).
4. If the phase ships templates, add the canonical path mapping to `LIB_TO_CANONICAL` in `apps/scaffolder/tests/golden.test.ts`.

## Conventions

- **Single source of truth**: canonical files at the repo root + `apps/example-repo-mcp/` + `packages/*`. The scaffolder's `lib/` directories are byte-identical copies, drift-checked.
- **No emojis in source code unless the user requests.** Comments stay terse and "why"-focused.
- **Prefer canonical CLIs** (`pnpm init`, `pnpm pkg set`, `git init`) over file-copying for setup steps. Templates live in `lib/`; raw fs writes for small literals.
- **Conventional Commits** drive semver via the (disabled-by-default) `release.yml` workflow.

## Testing

- **Scaffolder unit + integration**: `pnpm --filter @george43g/mcp-scaffold test` (128 tests across 12 test files, including `templating`, `config-leaf`, `fs`, `package-port`, `migrations`, `golden`, `retrofit`, `tsconfig`, and `add-mcp-app`)
- **Cloned-tool integration**: `pnpm --filter @george43g/example-repo-mcp test` (14 tests; native + TS fallback paths)
- **13-assertion stress harness**: `pnpm stress` (handshake, health, parallel, timeout, SIGTERM, RSS watchdog, HTTP roundtrip, …)
- **Golden-output drift**: scaffolder's `tests/golden.test.ts` — byte-equal lib vs canonical (excepting `EXEMPT_LIB_PATHS`)
- **E2E in CI**: `.github/workflows/ci.yml` runs `mcp-scaffold init` into a tempdir and asserts `pnpm install && pnpm test` succeed

## CI

`.github/workflows/ci.yml` — matrix `ubuntu-latest + macos-latest`, node 24, Rust toolchain stable. Steps: install → lint → typecheck → build → test → test:no-native → install usage(1) via mise → check usage(1) artifact freshness → npm pack --dry-run → **scaffolder E2E smoke** → 13-assertion stress harness.

`.github/workflows/release.yml` — semantic-release pipeline; **disabled by default** (the `on:` trigger is commented). Enable by uncommenting + adding `NPM_TOKEN` secret. See `docs/RELEASE.md`.

`.github/workflows/screenshots.yml` — VHS-driven; regenerates `docs/screenshots/*.{png,gif}` on `.tape` changes.

`.github/workflows/readme-check.yml` — fails CI if `src/**` changed without a `README.md` update. Bypass with `[skip-readme]` in commit/PR title.

## Plan & origin

The legacy external plan path
`/Users/george/.claude/plans/2-programmable-mcp-scaffolder.md` is no longer
present. Current continuation state lives in `HANDOFF.md` and
`docs/PROJECT_STATE.md`. The comprehensive AI-readable scaffolder guide is
`skills/mcp-starter-architect/SKILL.md` — read it before retrofitting an existing
MCP server. The patterns lifted from oclif (and explicitly skipped) are
documented in `apps/scaffolder/src/core/CREDITS.md`.

## Troubleshooting

- **Golden test fails**: someone edited canonical or lib/ without syncing. Sync the diverging side, re-run `pnpm --filter @george43g/mcp-scaffold test`.
- **`pnpm verify` fails on `example-repo-mcp` tests**: rust-accel may have regenerated `index.{js,d.ts}` — sync to `apps/scaffolder/src/phases/09-rust-accel/lib/`.
- **CI smoke fails locally but not in CI** (or vice versa): pnpm defaults to `--frozen-lockfile` in CI; pass `--no-frozen-lockfile` for the scaffolded output which has no lockfile yet.
- **Biome reformatted a lib/ file**: should not happen (biome.json excludes `apps/scaffolder/src/phases/**/lib`). If it does, the exclusion glob may need fixing.
- **`check:usage` / `cli-artifacts-drift` red on a fresh CI run with no spec change**: usage(1) emits slightly different completion shells across minor versions. `mise.toml` pins `usage = "3.3.0"` in three places (root, `apps/example-repo-mcp/`, scaffolder lib mirror) so local and CI stay byte-equal. To bump: change the pin in all three, regenerate via `mise run --cd apps/scaffolder docs/completions/manpage` and `pnpm artifacts` in `apps/example-repo-mcp/`, commit the new bytes.
