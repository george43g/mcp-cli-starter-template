# mcp-cli-starter-template

Turborepo starter for building **MCP + CLI + TUI** tools with optional **Rust acceleration**.

Each tool ships three surfaces from a single workspace:

- **`{{name}}-mcp`** — Model Context Protocol server (stdio default, Streamable HTTP opt-in)
- **`{{name}}-cli`** — Commander-based CLI for humans and scripts
- **`{{name}}-tui`** — Ink/React full-screen terminal UI

Plus a **`rust-accel`** napi-rs module that any tool can call into for hot paths, with a transparent TypeScript fallback.

## Why this template

The template extracts every reusable pattern from two production MCP servers (`imsg-mcp`, `Gmail-MCP-Server`) so every new tool starts at parity, not from scratch. You get:

- **Robustness harness**: event-loop watchdog (spike + sustained-lag), RSS/heap leak detector, idle-restart, shutdown registry trapping SIGINT/TERM/HUP/QUIT + stdin EOF + orphan reparent detection
- **Structured logging**: NDJSON files + 500-line ring buffer + perf spans + heartbeat
- **MCP best practices**: per-tool timeouts via `withTimeout`, `AbortSignal` honored, structured error wrapping, prompt-injection guardrails, sanitization
- **Both transports**: stdio (default) + Streamable HTTP with bearer auth + `/health` for reverse-proxy probes
- **Dev workflow**: MCP dev proxy with handshake replay (Cursor/Claude/Warp keep their session across source-file restarts), 9-case stress harness, VHS screenshot tape
- **Rust acceleration**: napi-rs v3 module with hand-mirrored types and a CI drift-check test
- **Multi-env env loading**: Vite-style precedence (`.env` → `.env.local` → `.env.[mode]` → `.env.[mode].local`)
- **Secrets**: env-JSON → 1Password (opt-in) → file chain
- **Agent-ready**: `AGENTS.md` (canonical), `CLAUDE.md` + `.cursorrules` symlinks, `.mcp.json` + `opencode.json` + `.cursor/mcp.json` with relative paths, pre-baked `mcp-tool-author` and `pr-review-sop` Claude skills

## Quickstart

```bash
git clone https://github.com/george43g/mcp-cli-starter-template.git my-new-tool
cd my-new-tool
pnpm install
pnpm tsx scripts/init-template.mjs --name my-tool
```

The init script:
1. Validates the name (kebab-case)
2. Replaces `{{name}}` / `{{NAME_UPPER}}` across every tracked file
3. Renames `apps/{{name}}-mcp/` and a few placeholder paths
4. Updates all `package.json` names + bin maps
5. Deletes itself
6. Stages everything with `git add -A` so you can review with `git diff --cached`

Then:

```bash
pnpm install   # re-resolve workspace links after rename
pnpm build     # build everything
pnpm test      # run unit + integration tests
pnpm stress    # run 9-case MCP stress harness
```

## What's in the box

```
apps/
  {{name}}-mcp/           # your tool — clone-and-rename target
    src/
      index.ts            # MCP entry (stdio + --http)
      cli.ts              # commander bin (mcp/http/tui/doctor/health/noop/cli REPL)
      tui/                # Ink TUI — delete if not needed
      tools/              # health_check + noop demo + dev-only get_logs
      dispatcher.ts       # invariants comment-block; withTimeout + perf + abort + error wrap
      native-bridge.ts    # tryLoadNative() with MCP_DISABLE_NATIVE escape
    scripts/
      mcp-dev-proxy.ts    # handshake-replay proxy for dev workflow
      stress-mcp.ts       # 9-case robustness harness
      screenshots/        # VHS .tape files
  rust-accel/             # napi-rs crate (optional acceleration)

packages/
  robustness/             # env + logger + watchdog + shutdown + with-timeout + health + retry + rate-limit
  mcp-kit/                # tool-registry + dispatch + stdio/http transports + sanitize + prompt-injection
  cli-kit/                # commander helpers + tty/color/output + env↔flag binder + REPL
  tui-kit/                # ink themes + hooks (useDevStats, useMouse, useVimKeys) + components
  env-loader/             # Vite-style .env precedence in plain Node
  secrets/                # env-json → 1Password → file chain (no keychain)
  shared-types/           # Zod schemas + Rust mirror + drift-check
  tsconfig/               # base + node + react TS configs
  biome-config/           # single biome.json source
  vitest-config/          # shared preset with c8 coverage
```

## Removing surfaces you don't need

The template demos all three surfaces (MCP + CLI + TUI). Each is opt-out:

- **No TUI**: delete `src/tui/`, remove `{{name}}-tui` from `apps/{{name}}-mcp/package.json` `bin`, drop the `tui` import from `src/cli.ts`. Delete `packages/tui-kit/` from `pnpm-workspace.yaml` if no other app uses it.
- **No HTTP**: delete `src/commands/http.ts` from the CLI, remove the `--http` flag handler from `src/index.ts`, drop HTTP case 9 from `scripts/stress-mcp.ts`.
- **No Rust**: delete `apps/rust-accel/`, delete `src/native-bridge.ts`, remove the rust path from `src/tools/noop.ts`.

## Docs

- `AGENTS.md` — canonical agent guide (also at `CLAUDE.md`, `.cursorrules` as symlinks)
- `docs/ARCHITECTURE.md` — how packages fit together
- `docs/HTTP_MODE.md` — Streamable HTTP transport details
- `docs/RUST_ACCELERATION.md` — napi build, binary handling, drift-check
- `docs/TUI_DESIGN.md` — theme system, keybindings, dev stats, cache invariants
- `docs/GUARDRAILS_MCP_RESPONSES.md` — UUID-gated instruction pattern for prompt-injection defense
- `docs/RELEASE.md` — enabling semantic-release for npm publish

## License

MIT
