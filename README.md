<div align="center">

# mcp-cli-starter-template

**A programmable MCP+CLI+TUI starter for Node.js — and the scaffolder that ships it.**

[![CI](https://github.com/george43g/mcp-cli-starter-template/actions/workflows/ci.yml/badge.svg)](https://github.com/george43g/mcp-cli-starter-template/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js >=24](https://img.shields.io/badge/node-%3E%3D24-brightgreen.svg)](https://nodejs.org)

</div>

This repo is two things at once:

1. **A static starter template** — clone, run a rename script, and you have a working MCP server with single-bin CLI/TUI/REPL surfaces, optional Rust acceleration, robustness harness (watchdog + logger + shutdown + retry), CI matrix, and Mintlify-ready docs.

2. **A programmable scaffolder/migrator** (`apps/scaffolder/`, bin `mcp-scaffold`) — runs the same template assembly as 21 ordered migrations across 12 phases. Generates fresh starters into empty directories, OR retrofits subsets of the rules to existing MCP servers.

Both produce the same output. The scaffolder exists because copy-and-rename works once; selective retrofit against existing MCP servers (like `imsg-mcp` or `Gmail-MCP-Server`) needs something programmable.

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

## What the scaffolder produces

Twelve phases applied in order. Each phase has 1–5 migrations. See `mcp-scaffold list` for the full ordered list, or `skills/mcp-starter-architect/SKILL.md` for the canonical AI-readable guide describing every rule + how to apply it manually.

| Phase | Scope |
|-------|-------|
| 01-bootstrap | Mode, package manager, name, monorepo skeleton |
| 02-toolchain | mise, node version, git, .gitignore (with LFS anti-footgun), .gitattributes |
| 03-configs | Shared tsconfig + biome + vitest packages + full turbo.json (30+ env vars) |
| 04-robustness | env + NDJSON logger + watchdog (event-loop + memory + idle) + shutdown registry + withTimeout + health + retry + rate-limit |
| 05-utility-pkgs | env-loader, secrets (env-JSON → 1Password → file), cli-kit, tui-kit |
| 06-mcp-kit | tool-registry, dispatcher (6 invariants), stdio + Streamable HTTP transports, sanitize, prompt-injection guardrails |
| 07-shared-types | Zod schemas + Rust drift-check |
| 08-app | The user-facing tool — single bin, MCP/CLI/TUI/REPL surfaces, dev MCP proxy, 11-case stress harness, MCP Resources demo (`health://`, `logs://recent/{n}`), MCPB Desktop bundle |
| 09-rust-accel | Optional napi-rs v3 crate with hand-mirrored types |
| 10-docs-readme | Mintlify config + MDX scaffold + reference markdown + public-style README |
| 11-agent-files | AGENTS.md (canonical) + CLAUDE.md/.cursorrules symlinks + .mcp.json + Claude/Cursor/OpenCode skill files |
| 12-ci-release | matrix CI + (disabled) semantic-release + screenshots CI + .releaserc + .npmignore |

## Scaffolder usage

```
mcp-scaffold init [target]              fresh scaffold (defaults to cwd)
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

### Diff-safe apply (retrofit existing repos)

`apply` and `migrate` against an existing repo default to **dry-run** (just preview the changes). Once you pass `--execute`, the scaffolder writes new files but **preserves files that already exist and diverge from the template** — your customizations stay put. The recap groups divergent files by migration:

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

`init` defaults to `--force` (fresh scaffold semantics — empty dir, no risk).

## Repo layout

```
apps/
  example-repo-mcp/           the live "golden output" — referenced + diffed in CI
  rust-accel/             optional napi-rs v3 crate
  scaffolder/             the programmable scaffolder/migrator
    src/
      core/               Migration base + IoC config + phase runner + helpers
      phases/             01-bootstrap … 12-ci-release (21 migrations, 145 lib files)
      ui/                 banner, recap, progress
    bin/cli.ts            commander dispatch
    scripts/              build-templates.mjs (codegen: lib/** → src/generated/templates.ts)
    .usage.kdl            CLI spec → completions + manpage + markdown docs
    mise.toml             docs/completions/manpage tasks

packages/
  robustness, mcp-kit, cli-kit, tui-kit, env-loader, secrets, shared-types,
  tsconfig, biome-config, vitest-config

completions/scaffolder/   bash + zsh + fish completions for mcp-scaffold
docs/                     Mintlify config + MDX pages + reference markdown
docs/scaffolder-cli/      generated per-subcommand markdown
man/                      generated mcp-scaffold(1) manpage
skills/
  mcp-starter-architect/  comprehensive AI guide — every rule, every retrofit step
  example-repo/               cloned-tool's project skill scaffold
```

## Development

```
pnpm install
pnpm verify                                 # lint + typecheck + test + build
pnpm --filter @george43g/mcp-scaffold test  # golden-output drift test + unit tests
mise run --cd apps/scaffolder smoke         # full end-to-end: init + install + test
mise run --cd apps/scaffolder docs          # regenerate docs/scaffolder-cli/*.md
mise run --cd apps/scaffolder completions   # regenerate completions/scaffolder/*
mise run --cd apps/scaffolder manpage       # regenerate man/mcp-scaffold.1
```

## License

MIT — see [LICENSE](LICENSE).
