# @george43g/mcp-scaffold

**Programmable scaffolder + migrator for MCP+CLI+TUI starter projects.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js >=24](https://img.shields.io/badge/node-%3E%3D24-brightgreen.svg)](https://nodejs.org)

Generates fresh Node.js MCP servers — full Turborepo monorepo with single-bin CLI/TUI/REPL surfaces, optional Rust acceleration, robustness harness (watchdog + logger + shutdown registry), Mintlify-ready docs, and CI matrix — OR retrofits subsets of the rules to your existing MCP server.

```bash
# Fresh scaffold
npx @george43g/mcp-scaffold init my-tool --name foo

# Retrofit an existing repo (dry-run by default; --execute to write)
npx @george43g/mcp-scaffold apply --target ~/repos/my-existing-mcp

# List all 21 migrations across 12 phases
npx @george43g/mcp-scaffold list
```

## Commands

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

## What gets generated

12 phases applied in order, 21 migrations, 145 template files:

| Phase | Scope |
|-------|-------|
| 01-bootstrap | mode, package manager, name, monorepo skeleton |
| 02-toolchain | mise, node, git, .gitignore (LFS anti-footgun), .gitattributes |
| 03-configs | shared tsconfig + biome + vitest + full turbo.json |
| 04-robustness | env + NDJSON logger + watchdog + shutdown + withTimeout + health + retry + rate-limit |
| 05-utility-pkgs | env-loader, secrets, cli-kit, tui-kit |
| 06-mcp-kit | tool-registry, dispatcher (6 invariants), stdio + HTTP transports, sanitize, guardrails |
| 07-shared-types | Zod schemas + Rust drift-check |
| 08-app | the user-facing tool — single bin, MCP/CLI/TUI/REPL, dev MCP proxy, stress harness |
| 09-rust-accel | optional napi-rs v3 crate with hand-mirrored types |
| 10-docs-readme | Mintlify scaffold + reference markdown + public-style README |
| 11-agent-files | AGENTS.md + CLAUDE.md/.cursorrules symlinks + .mcp.json + Claude/Cursor skill files |
| 12-ci-release | matrix CI + disabled semantic-release + screenshots CI + .releaserc + .npmignore |

## Diff-safe retrofit

`apply` defaults to **dry-run**. When you pass `--execute`, files that already exist AND diverge from the template are **preserved** by default — your customizations stay put. Pass `--force` to overwrite them.

```
$ mcp-scaffold apply --target ~/repos/my-mcp --execute
  18 applied · 7 skipped · 6 divergent files preserved (pass --force to overwrite) · 0 failed

  Divergent files (preserved)
    10-docs-readme/m1-docs-readme
      · README.md
      · docs/GUARDRAILS_MCP_RESPONSES.md
    12-ci-release/m1-ci-release
      · .github/workflows/ci.yml
      · ...

  → 3 retrofit intents captured. Open RETROFIT.md for manual steps + ready-to-paste AI prompts.
```

## RETROFIT.md — the per-repo retrofit checklist

For migrations that **couldn't auto-apply** to your repo (the 'new'-only ones that lay down a fresh monorepo skeleton, port the whole `apps/<name>-mcp/` tree, or add the optional Rust acceleration crate), `apply --execute` writes a `RETROFIT.md` at the target repo root. Each section contains:

- What the migration would have done in a fresh scaffold
- Why it couldn't be auto-applied (mode mismatch, divergent files, etc.)
- Numbered manual steps to apply it by hand
- **A self-contained AI prompt** — copy-paste it into Claude/Cursor/etc. unmodified to have an agent do the retrofit for you

This is the bridge between "the scaffolder applied what it safely could" and "here's what you still need to do." Read it after every apply.

## Learn more

- **Source**: [github.com/george43g/mcp-cli-starter-template](https://github.com/george43g/mcp-cli-starter-template)
- **Architect skill** (comprehensive AI guide for every rule + retrofit strategy): see `skills/mcp-starter-architect/SKILL.md` in the source repo
- **Per-subcommand docs**: [docs/scaffolder-cli/](https://github.com/george43g/mcp-cli-starter-template/tree/main/docs/scaffolder-cli)

## License

MIT
