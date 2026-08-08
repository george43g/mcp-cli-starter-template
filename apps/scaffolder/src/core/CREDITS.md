# Credits — patterns lifted (or deliberately not lifted) from oclif

This file documents which oclif patterns the scaffolder borrowed and which it
deliberately skipped — captured per the original plan §7ι. It exists to give a
future maintainer the same chance to glean patterns without re-reading oclif's
docs from scratch.

Source: https://github.com/oclif/oclif and https://oclif.io/docs

## Adopted (or worth adopting in the future)

### Lifecycle hooks for the phase runner
oclif fires hooks at `init`, `preparse`, `prerun`, `postrun`, and `finally`.
`finally` runs even on command failure (good for cleanup). Our `phase-runner`
currently has no hook surface — every migration just runs sequentially.

**Lift candidate:** add `preMigration` and `postMigration` hooks (and a
`finally` equivalent) to `MigrationContext`. Migrations downstream could
register listeners. Useful when a migration wants to inject side-effects
(e.g. "after every package port, run `pnpm install` to refresh lock").

Not done yet because: no concrete need has surfaced. Plan to add when a
migration genuinely needs cross-cutting wiring.

### `finally` semantics (not `try/catch` swallowing)
oclif's hook docs explicitly note: "Throwing an Error will not cause the CLI
to exit" — hooks must call `context.error()` or `context.exit()` to bail.
Our `phase-runner` already catches per-migration `Error`s and converts them
to `{ status: 'failed', error }`. That's the right pattern; matches oclif's
"errors are data, not control flow."

### `oclif readme` between markers
oclif provides `oclif readme` that injects command-list markdown into a
README between `<!-- commands -->` markers. We achieve the same outcome via
`usage g markdown` (phase θ), writing to `docs/scaffolder-cli/*.md`. If we
ever want the same in the root README, the marker pattern (`<!-- usage:cmd-list -->`)
is the right tool.

### Dev vs prod bins
oclif ships two bins: `bin/dev.js` (tsx; iterative dev) and `bin/run.js`
(compiled production). We have the same split:
- `apps/scaffolder/bin/cli.ts` → built to `dist/cli.js` (prod, shebang)
- `apps/scaffolder/package.json` script `start` → `tsx bin/cli.ts` (dev)

## Deliberately not lifted

### Plugin architecture
oclif lets third parties ship `@scope/plugin-*` packages that register
commands + hooks. Our scaffolder uses a **static barrel** (`src/phases/index.ts`)
listing each phase by import. Why we skipped plugins:

1. Single-bundle distribution: `pnpm dlx @george43g/mcp-scaffold` ships one
   `dist/cli.js`. Plugins require dynamic discovery at runtime, which
   doesn't bundle cleanly.
2. The set of phases is finite and tied to the canonical template. There's
   no value in letting third parties inject new phases — they'd risk shipping
   incompatible scaffolds.
3. For per-tool customization (e.g. "skip the TUI"), feature flags on init
   (`--no-tui` etc.) are simpler and discoverable via `--help`.

If a future use case demands third-party migrations, swap the static barrel
for an oclif-style plugin loader. The `Migration` base class is already
plugin-ready (single interface).

### Topic-separator command naming (`foo:bar`)
oclif uses `:` to encode topic hierarchies. Our migrate command uses `/`:
`mcp-scaffold migrate 06-mcp-kit/m1-mcp-kit`. The `/` matches the
phase + migration filesystem layout exactly — semantically clearer than
`:` would be.

### Heavy-handed manifest
`oclif manifest` writes a `oclif.manifest.json` blob to speed up cold-start
command lookup. Our scaffolder has 5 top-level subcommands (init/apply/plan/
migrate/list) — startup is sub-100ms already. Adding a manifest would be
premature.

### oclif's auto-update plugin
`@oclif/plugin-update` polls for new versions and downloads them. For an
npm-published scaffolder, `npx @george43g/mcp-scaffold@latest` already does
the right thing — no need for a built-in updater.

## TL;DR

The valuable patterns from oclif are the **lifecycle hook taxonomy**
(init/preparse/prerun/postrun/finally, with `finally` running on both
success and failure) and the **errors-as-data** discipline. Both are
candidates for future inclusion when a concrete need arises.

The framework's plugin system, manifest, topic separators, and auto-updater
are correctly skipped: they solve problems we don't have (third-party
extensibility, large command graphs, distribution outside npm).
