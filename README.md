<div align="center">

# mcp-cli-starter-template

**A programmable MCP+CLI+TUI starter for Node.js — and the scaffolder that ships it.**

[![CI](https://github.com/george43g/mcp-cli-starter-template/actions/workflows/ci.yml/badge.svg)](https://github.com/george43g/mcp-cli-starter-template/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js >=24](https://img.shields.io/badge/node-%3E%3D24-brightgreen.svg)](https://nodejs.org)

</div>

This repo is two things at once:

1. **A static starter template** — clone, run a rename script, and you have a working MCP server with single-bin CLI/TUI/REPL surfaces, optional Rust acceleration, robustness harness (watchdog + logger + shutdown + retry), CI matrix, and Mintlify-ready docs.

2. **A programmable scaffolder/migrator** (`apps/scaffolder/`, bin `mcp-scaffold`) — runs the same template assembly as 21 ordered migrations across 10 phases. Generates fresh starters into empty directories, OR retrofits subsets of the rules to existing MCP servers.

Both produce the same output. The scaffolder exists because copy-and-rename works once; selective retrofit against existing MCP servers (like `EQStack` or `Gmail-MCP-Server`) needs something programmable.

## Quickstart — scaffold a new tool

```bash
# Future (once published)
npx @george43g/mcp-scaffold init my-tool --name foo

# Today (clone-and-run)
git clone https://github.com/george43g/mcp-cli-starter-template.git
cd mcp-cli-starter-template
mise install
pnpm install
pnpm --filter @george43g/mcp-scaffold build
node apps/scaffolder/dist/cli.js init /path/to/new-tool --name foo
```

Then in the new tool's directory:

```bash
cd /path/to/new-tool
pnpm install
pnpm build
pnpm test
pnpm --filter @george43g/foo-mcp doctor   # preflight
node apps/foo-mcp/dist/cli.js mcp          # run the MCP server
```

### Coverage gates

`pnpm test` runs the suites; `pnpm test:coverage` runs the same suites and
enforces each workspace's thresholds. `packages/*` target 80/70/70/70 and
`apps/*` target 50/40/40/40, but a workspace that does not meet its target yet
declares an explicit floor via `withCoverageFloor()` in its `vitest.config.ts`,
pinned to what it actually measures.

That is a ratchet rather than an aspiration: it fails the moment coverage
regresses, and the gap up to the preset is visible debt instead of silent debt.
Floors move up as tests land, never down. `pnpm verify` runs the coverage
variant, so a green local verify means the gates passed.

## What the scaffolder produces

Nine phases applied in order. Each phase has 1–5 migrations. Phases 04-robustness, 05-utility-pkgs and 06-mcp-kit are gone, not renumbered — those packages are published, so generated repos take a registry dependency instead of a vendored copy. See `mcp-scaffold list` for the full ordered list, or `skills/mcp-starter-architect/SKILL.md` for the canonical AI-readable guide describing every rule + how to apply it manually.

| Phase | Scope |
|-------|-------|
| 01-bootstrap | Mode, package manager, name, monorepo skeleton |
| 02-toolchain | mise, node version, git, .gitignore (with LFS anti-footgun), .gitattributes |
| 03-configs | Shared tsconfig + biome + vitest packages + full turbo.json (30+ env vars) |
| 07-shared-types | Zod schemas + Rust drift-check |
| 08-app | The user-facing tool — single bin, MCP/CLI/TUI/REPL surfaces, dev MCP proxy, 15-assertion stress harness, MCP Resources demo (`health://`, `logs://recent/{n}`), MCPB Desktop bundle |
| 09-rust-accel | Optional napi-rs v3 crate with hand-mirrored types |
| 10-docs-readme | Mintlify config + MDX scaffold + reference markdown + public-style README + the guard scripts generated CI invokes (`check-docs-links`, `check-stdout-purity`, `check-release-tokens`) |
| 11-agent-files | Full agent configuration for starter layouts; package-manager-aware minimal AGENTS.md + skill skeletons for other existing repos |
| 12-ci-release | matrix CI + release-token guard (own workflow, so it can re-run on the `edited` event — the PR body becomes the squash commit message) + manual-only semantic-release (`workflow_dispatch:`, see [docs/RELEASE.md](docs/RELEASE.md)) + screenshots CI + .releaserc + .npmignore |

## Scaffolder usage

```
mcp-scaffold init [target]              fresh scaffold (defaults to cwd)
mcp-scaffold add-mcp-app <name>         append a second MCP app to an existing repo
mcp-scaffold apply [--target <dir>]     retrofit an existing repo (dry-run; --execute to apply)
mcp-scaffold plan  [--target <dir>]     dry-run preview only
mcp-scaffold migrate <id>               run a single migration or one whole phase
mcp-scaffold list                       list discovered phases + migrations
```

Feature opt-outs (init/apply/plan/migrate):

```
--no-tui                 skip Ink/React TUI
--no-http                skip Streamable HTTP transport
--no-rust-accel          skip napi-rs crate
--no-semantic-release    skip semantic-release workflow
```

Shared lifecycle code can be consumed from npm or generated as editable source.
See [Shared runtime versus generated source](docs/SHARED_RUNTIME.md).

### Adding a second MCP app to a scaffolded repo

`add-mcp-app <name>` runs the 08-app phase migration against the existing monorepo with the new name injected. It scaffolds `apps/<name>-mcp/`, writes `.cursor/rules/<name>.mdc`, and appends a `<name>-mcp-dev` entry to `.mcp.json`. Other root files that hard-code the first app's name (root `mise.toml`'s pinned `screenshots` task, README sections) are intentionally not touched — fix those by hand if your scripts need to cover both apps. The npm scope is auto-detected from the first existing `apps/*-mcp/package.json`; pass `--scope` to override.

```bash
mcp-scaffold add-mcp-app billing               # apps/billing-mcp/ under the detected scope
mcp-scaffold add-mcp-app billing --no-rust-accel
mcp-scaffold add-mcp-app billing --scope @acme  # override detected scope
```

### Diff-safe apply (retrofit existing repos)

`apply` and `migrate` against an existing repo default to **dry-run** (just preview the changes). Generic repositories also default to `--existing-strategy safe`, which runs only explicitly compatible migrations; complete starter-derived layouts keep full behavior. Once you pass `--execute`, the scaffolder writes new files but **preserves files that already exist and diverge from the template** — your customizations stay put. The recap groups divergent files by migration:

```bash
mcp-scaffold apply --target ~/repos/my-existing-mcp --execute
# → 18 applied · 7 skipped · 6 divergent files preserved · 0 failed
#   Divergent files (preserved)
#     10-docs-readme/m1-docs-readme
#       · README.md
#       · docs/GUARDRAILS_MCP_RESPONSES.md
#     ...
```

Pass `--force` to overwrite divergent files (e.g. when you've decided to migrate to the canonical version).

Use `--existing-strategy full` to deliberately evaluate starter infrastructure
against a generic repository, or select one migration with `migrate <id>`.
`--report-json <path>` writes a machine-readable companion to the recap.

`init` defaults to `--force` (fresh scaffold semantics — empty dir, no risk).

Names and package managers are inspected before migrations run. Existing repos derive the bare tool name from `package.json` and detect pnpm/npm/Bun from `--package-manager`, package metadata, then lockfiles. Phase 11 emits minimal documentation with the detected package manager and real scripts for non-starter layouts. Fresh scaffolds are intentionally **pnpm-only**; `init` or `migrate --mode new` rejects npm/Bun before writing files.

Fresh output includes a committed first baseline of CLI help markdown, bash/zsh/fish completions, and a manpage. The generated `cli-artifacts` skill keeps that pipeline portable if the MCP app is later removed, while `workspace-scaffolding` records when to use an official framework generator for a new leaf package. See [Native scaffolder policy](docs/NATIVE_SCAFFOLDERS.md).

## Repo layout

```
apps/
  example-repo-mcp/           the live "golden output" — referenced + diffed in CI
  rust-accel/             optional napi-rs v3 crate
  scaffolder/             the programmable scaffolder/migrator
    src/
      core/               Migration base + IoC config + phase runner + helpers
      phases/             01-bootstrap … 12-ci-release (21 migrations, 123 generated template entries)
      ui/                 banner, recap, progress
    bin/cli.ts            commander dispatch
    scripts/              build-templates.mjs (codegen: lib/** → src/generated/templates.ts)
    .usage.kdl            CLI spec → completions + manpage + markdown docs
    mise.toml             docs/completions/manpage tasks

packages/
  robustness, mcp-kit, cli-kit, tui-kit, secret-store, shared-types,
  tsconfig, biome-config, vitest-config

completions/scaffolder/   bash + zsh + fish completions for mcp-scaffold
docs/                     Mintlify config + MDX pages + reference markdown
docs/scaffolder-cli/      generated per-subcommand markdown
man/                      generated mcp-scaffold(1) manpage
skills/
  mcp-starter-architect/  comprehensive AI guide — every rule, every retrofit step
  example-repo/           cloned-tool's project skill scaffold
  cli-artifacts/          portable CLI artifact maintenance workflow
  workspace-scaffolding/  native-generator selection workflow
```

## Development

```
pnpm install
pnpm verify                                 # lint + typecheck + test + build
pnpm check:stdout-purity                    # no console.* in an MCP app's src — JSON-RPC owns stdout
pnpm --filter @george43g/mcp-scaffold test  # golden-output drift test + unit tests
mise run --cd apps/scaffolder smoke         # full end-to-end: init + install + test
mise run --cd apps/scaffolder docs          # regenerate docs/scaffolder-cli/*.md
mise run --cd apps/scaffolder completions   # regenerate completions/scaffolder/*
mise run --cd apps/scaffolder manpage       # regenerate man/mcp-scaffold.1
pnpm check:usage                            # byte-check scaffolder + canonical app artifacts
```

## License

MIT — see [LICENSE](LICENSE).
