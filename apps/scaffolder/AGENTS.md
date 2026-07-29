# Scaffolder subsystem — Agent Guide

> Scoped guide for `apps/scaffolder/` (bin `mcp-scaffold`). The repo-wide map is
> the root [`AGENTS.md`](../../AGENTS.md); read it first for orientation, the
> golden-output rule, and root commands.

The scaffolder is the meta-tool: 12 phases, 26 migrations, 172 generated
template entries. It drives `init` (fresh scaffold), `apply`
(target-profile-aware retrofit), `migrate <id>` (single migration), and
`add-mcp-app` (append a second MCP app to an already-scaffolded monorepo —
runs only the 08-app phase under `mode='add'` with a collision guard).

Before retrofitting a real MCP server, read
[`skills/mcp-starter-architect/SKILL.md`](../../skills/mcp-starter-architect/SKILL.md)
and the safety invariants in
[`docs/scaffolder-cli/retrofit-findings.md`](../../docs/scaffolder-cli/retrofit-findings.md).

## Architecture

**Migration = atomic ruleset application.** Each migration is a class extending
`Migration`, lives at `src/phases/<NN>-<slug>/m<N>-<slug>.ts`. Its `apply()`
reads from the IoC `ctx.config`, writes via `ctx.fs.writeIfChanged`, and
returns a `MigrationResult`.

**Phase = a directory of related migrations.** Each phase has an `index.ts`
exporting `{ order, id, title, migrations }`. Phases run sequentially in
numeric order via the static barrel `src/phases/index.ts` (vite-friendly).

**IoC config** (`src/core/config.ts`): hand-rolled root object with
`configLeaf<T>` leaves. Reading `await ctx.config.global.repoName.get()` fires
an inquirer prompt iff the value hasn't been pre-set via a commander flag.
`.peek()` reads without prompting (for `skipIf` predicates).

**Lib → templates codegen**: `scripts/build-templates.mjs` walks
`phases/<NN>-<slug>/lib/**` and emits `src/generated/templates.ts` as
`{ [relPath]: string }` (gitignored). Migrations read via
`TEMPLATES['04-robustness/lib/src/env.ts']`. The single Vite bundle ships
`npx`-friendly.

**Target-profile-aware apply**: target inspection
(`src/core/target-inspection.ts`) classifies fresh, complete starter-derived,
and generic existing repositories. Generic targets default to
`--existing-strategy safe`, so only migrations marked `safe-any-existing` run.
Complete starter layouts retain full behavior. `--existing-strategy full` or a
named `migrate <id>` is the conscious opt-in to broader changes.

**Diff-safe writes**: `fs.writeIfChanged` honors `force`. In existing mode
(force=false), files that exist + diverge are returned as `divergent-skipped`
(preserved). `init` defaults to force=true. `--force` is the conscious
overwrite.

**Run reports**: `--report-json` (`src/core/run-report.ts`) emits a
schema-versioned machine-readable companion to the human recap.

**Runtime source**: fresh generation supports
`--runtime-source source|registry` (`src/core/runtime-source.ts`). Source is
the default until `@george43g/robustness` is published; see
[`docs/SHARED_RUNTIME.md`](../../docs/SHARED_RUNTIME.md).

Patterns lifted from oclif (and explicitly skipped) are documented in
[`src/core/CREDITS.md`](src/core/CREDITS.md).

## Commands (run from `apps/scaffolder/`)

| Command | Purpose |
|---|---|
| `pnpm build:templates` | Codegen: scan `lib/**` → `src/generated/templates.ts` |
| `pnpm start -- <args>` | Run via tsx (dev) |
| `pnpm dev` | `vite build --watch` |
| `pnpm test` | 131 tests across 12 files (unit + integration + golden + migrations) |
| `mise run smoke` | E2E: scaffold into /tmp + assert install + tests pass |
| `mise run docs` | Generate `docs/scaffolder-cli/*.md` |
| `mise run completions` | bash + zsh + fish |
| `mise run manpage` | `man/mcp-scaffold.1` |
| `pnpm artifacts` | Regenerate all scaffolder usage artifacts |
| `pnpm check:usage` | Byte-check scaffolder usage artifacts vs `.usage.kdl` |

From the repo root, `node scripts/evaluate-retrofit.mjs` evaluates a target
repo's committed revision in an isolated clone (see
[`docs/scaffolder-cli/evaluations/`](../../docs/scaffolder-cli/evaluations/)).

## Adding a new migration

1. Identify the right phase. Add a new file
   `src/phases/<NN>-<slug>/m<N>-<slug>.ts`.
2. Extend `Migration` base. Set `id`, `title`,
   `appliesTo: 'new' | 'existing' | 'both'`. Mark it `safe-any-existing` only
   if it cannot damage a generic existing repository.
3. Implement `apply(ctx)`. Use `portPackage` if you're shipping a whole
   subtree; use `ctx.fs.writeIfChanged` directly for one-offs.
4. Register the migration in the phase's `index.ts`.
5. If the migration ships verbatim files, copy them into `lib/` (the golden
   drift test will catch mismatches with the canonical source).
6. Add a test in `tests/migrations.test.ts`.
7. Re-run `mise run smoke` to verify the scaffold + install + test loop still
   passes.

## Adding a new phase

1. `mkdir src/phases/<NN>-<slug>/` (next two-digit prefix).
2. Add at least one migration class + `index.ts` exporting the `Phase`.
3. Add the import + push in `src/phases/index.ts` (the static barrel).
4. If the phase ships templates, add the canonical path mapping to
   `LIB_TO_CANONICAL` in `tests/golden.test.ts`.

## Golden-output drift rules

`tests/golden.test.ts` byte-compares every `lib/**` file against its canonical
sibling per `LIB_TO_CANONICAL`. When you edit a canonical file that has a
`lib/` mirror (or vice versa), sync the other side in the same change, then
re-run `pnpm test`. Intentional divergences require an `EXEMPT_LIB_PATHS`
entry with a justifying comment. The tracked `example/` output is a third
surface: regenerate it with `pnpm regen:example` from the repo root when
generated output changes.

## Troubleshooting

- **Golden test fails**: someone edited canonical or `lib/` without syncing.
  Sync the diverging side, re-run `pnpm --filter @george43g/mcp-scaffold test`.
- **`pnpm verify` fails on `example-repo-mcp` tests**: rust-accel may have
  regenerated `index.{js,d.ts}` — sync to `src/phases/09-rust-accel/lib/`.
- **CI smoke fails locally but not in CI** (or vice versa): pnpm defaults to
  `--frozen-lockfile` in CI; pass `--no-frozen-lockfile` for the scaffolded
  output which has no lockfile yet.
- **Biome reformatted a `lib/` file**: should not happen (biome.json excludes
  `apps/scaffolder/src/phases/**/lib`). If it does, the exclusion glob may
  need fixing.
- **`check:usage` / `cli-artifacts-drift` red on a fresh CI run with no spec
  change**: usage(1) emits slightly different completion shells across minor
  versions. `mise.toml` pins `usage = "3.3.0"` in three places (root,
  `apps/example-repo-mcp/`, scaffolder lib mirror) so local and CI stay
  byte-equal. To bump: change the pin in all three, regenerate via
  `mise run --cd apps/scaffolder docs completions manpage` and
  `pnpm artifacts` in `apps/example-repo-mcp/`, commit the new bytes.
- **The socket-based stress runner fails with `listen EPERM` under
  `/tmp/tsx-*/*.pipe`**: restricted-sandbox limitation; classify as
  environmental only when an unrestricted rerun passes.
