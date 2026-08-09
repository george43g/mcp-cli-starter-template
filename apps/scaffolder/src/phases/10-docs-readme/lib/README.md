<div align="center">

# example-repo

**MCP server + CLI + TUI — one bin, three surfaces, production-ready from commit 1.**

[![CI](https://github.com/george43g/mcp-cli-starter-template/actions/workflows/ci.yml/badge.svg)](https://github.com/george43g/mcp-cli-starter-template/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@george43g/example-repo-mcp.svg)](https://www.npmjs.com/package/@george43g/example-repo-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js >=24](https://img.shields.io/badge/node-%3E%3D24-brightgreen.svg)](https://nodejs.org)

[Install](#install) · [Tools](#tools) · [Connect from your editor](#one-click-install) · [Docs](#docs) · [Skill for AI agents](#install-the-companion-skill)

![example-repo TUI](docs/screenshots/tui.gif)

![example-repo CLI](docs/screenshots/overview.gif)

</div>

---

> **This README is a scaffold.** Edit it to describe what your tool actually does. The structure below — install snippets, tool table, IDE integrations, skill install — is the recommended public-style format.

## Install

```bash
# Run directly (no install needed)
npx @george43g/example-repo-mcp mcp

# Or install globally
npm  install -g @george43g/example-repo-mcp
pnpm add  -g @george43g/example-repo-mcp
```

After install, `example-repo` is on your PATH. All subcommands route through that single bin:

```bash
example-repo mcp              # run the MCP server (stdio)
example-repo mcp --http       # run via Streamable HTTP (requires MCP_HTTP_TOKEN)
example-repo tui              # launch the Ink TUI
example-repo doctor           # preflight checks (Node version, native deps, env)
example-repo repl             # interactive REPL — same dispatcher as MCP
example-repo health           # one-shot health snapshot
example-repo noop --input hi  # call any tool directly from the CLI
```

### Working on this repo

```bash
mise trust .    # ← do this first
mise install
pnpm install
```

`mise trust .` is not optional and not a formality. mise refuses to load a
`mise.toml` it has not seen before, so skipping it makes `mise install` — and
anything downstream of it, like `pnpm artifacts` or `pnpm completions` — fail in
a way that reads like a broken checkout rather than a security prompt. It is
mise's supply-chain guard: a config file can declare tools and tasks, so it
wants you to have looked at it once.

This repo has two: one at the root and one per app.

## One-click install

Paste these into your MCP host's config. The bin name is `example-repo` once installed via npm; the `npx` form works without a local install.

### Claude Desktop / Code (`claude_desktop_config.json` or `.mcp.json`)

```json
{
  "mcpServers": {
    "example-repo": {
      "command": "npx",
      "args": ["-y", "@george43g/example-repo-mcp", "mcp"]
    }
  }
}
```

### Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "example-repo": {
      "command": "npx",
      "args": ["-y", "@george43g/example-repo-mcp", "mcp"]
    }
  }
}
```

### Warp / Codex / OpenCode

Identical JSON snippet — they all consume the same shape under `mcpServers`. See `opencode.json` and `.cursor/mcp.json` in this repo for working examples (with relative paths for local dev).

## Tools

The starter ships two demo tools plus a dev-only log inspector. Replace these with your own — declare a `ToolDefinition` in `src/tools/<name>.ts`, register it in `src/tools/registry.ts`, and it'll appear in MCP `tools/list`, the CLI as a subcommand, and the REPL automatically.

| Tool | Description | Annotations |
|---|---|---|
| `health_check` | Returns server/runtime/transport snapshot. Never touches external I/O. | read-only, idempotent |
| `noop` | Echo a string (optionally upper-cased). Demonstrates the Rust acceleration fallback path. | read-only, idempotent |
| `get_logs` | **Dev-mode only** (`EXAMPLE_REPO_DEV=1`). Returns the last N lines from the in-memory ring buffer. | read-only |

## Install the companion skill

This repo ships with a Claude skill that teaches an AI agent how to use your tool end-to-end. The skill lives at `skills/example-repo/SKILL.md` and is meant to be rewritten by you (or by the AI itself, after first reading the tool) to document the tool's actual behavior.

```bash
# Copy the skill into your global Claude skills dir
mkdir -p ~/.claude/skills/example-repo
cp skills/example-repo/SKILL.md ~/.claude/skills/example-repo/

# Or symlink (so updates from this repo show up automatically)
ln -s "$(pwd)/skills/example-repo/SKILL.md" ~/.claude/skills/example-repo/SKILL.md
```

## Docs

| File | What it covers |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Canonical agent guide (also `CLAUDE.md`, `.cursorrules` as symlinks) |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How packages fit together; which to delete if you don't need a surface |
| [`docs/HTTP_MODE.md`](docs/HTTP_MODE.md) | Streamable HTTP transport: bearer auth, `/health`, reverse-proxy patterns |
| [`docs/RUST_ACCELERATION.md`](docs/RUST_ACCELERATION.md) | napi-rs build, `.node` binary handling, drift-check between Zod and serde |
| [`docs/TUI_DESIGN.md`](docs/TUI_DESIGN.md) | Theme system, keybindings, dev stats, cache invariants |
| [`docs/GUARDRAILS_MCP_RESPONSES.md`](docs/GUARDRAILS_MCP_RESPONSES.md) | UUID-gated instructions + prompt-injection defense |
| [`docs/RELEASE.md`](docs/RELEASE.md) | Enabling semantic-release for npm publish |
| [`docs/NATIVE_SCAFFOLDERS.md`](docs/NATIVE_SCAFFOLDERS.md) | When to use official generators for new leaf workspaces |

The repo-level `skills/cli-artifacts/SKILL.md` preserves usage docs,
completions, and manpage generation if this MCP app is replaced or removed.
`skills/workspace-scaffolding/SKILL.md` guides native generator selection for
new apps and packages.

## What's inside (template author's eyes only)

This section is for the engineer running the scaffolder — delete it once you've made the tool your own.

```
apps/
  example-repo-mcp/             your tool — clone-and-rename target
    src/
      cli.ts                THE SINGLE BIN — commander dispatch
      index.ts              runMcpServer() + callMcpTool() (library exports)
      commands/http.ts      HTTP transport wiring (delete file to drop HTTP)
      tui/                  Ink TUI — delete dir + the `tui` subcmd if not needed
      tools/                health_check + noop demo + dev-only get_logs
      dispatcher.ts         invariants block; withTimeout + perf + abort + error wrap
      native-bridge.ts      tryLoadNative() with MCP_DISABLE_NATIVE escape
    scripts/
      mcp-dev-proxy.ts      handshake-replay proxy for live source-reload
      stress-mcp.ts         13-assertion robustness harness
      screenshots/          VHS .tape files driving docs/screenshots/*.gif
    .usage.kdl              CLI spec → completions + manpage + markdown docs
  rust-accel/               napi-rs crate (optional acceleration)

packages/
  robustness, mcp-kit, cli-kit, tui-kit, shared-types,
  tsconfig, biome-config, vitest-config

mise.toml                   toolchain pins (node, pnpm) + named tasks
.github/workflows/          ci.yml, release.yml (disabled by default), readme-check.yml, screenshots.yml
docs/                       Mintlify-ready (docs.json + MDX pages)
skills/example-repo/             Repo-installable companion skill (rewrite at scaffold time)
```

## License

MIT
