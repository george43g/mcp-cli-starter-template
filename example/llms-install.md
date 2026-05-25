# Installing example

This page is for end users (and the LLMs assisting them) who want to plug `example-mcp` into an MCP host like Claude Code, Cursor, Warp, or the MCP Inspector.

## Prerequisites

- Node.js 24 or newer (`node --version` should report `v24.x`)
- pnpm 10 (`corepack enable pnpm` if you have Node 24+)
- macOS or Linux (Windows works for the JS bins; Rust acceleration ships binaries for `x86_64-pc-windows-msvc`)

## Install

From the published package (once the maintainer enables release):

```bash
npm install -g @george43g/example-mcp
```

Or from source:

```bash
git clone <repo-url>
cd <repo-name>
pnpm install
pnpm build
```

## Configure your MCP host

### Claude Code

Edit `~/.claude/settings.local.json` (or `.mcp.json` in your project root):

```json
{
  "mcpServers": {
    "example": {
      "command": "example-mcp"
    }
  }
}
```

For the dev-mode proxy (auto-reload on source changes):

```json
{
  "mcpServers": {
    "example-dev": {
      "command": "pnpm",
      "args": ["tsx", "/path/to/repo/apps/example-mcp/scripts/mcp-dev-proxy.ts"],
      "env": { "MCP_DEV": "1" }
    }
  }
}
```

### Cursor

`.cursor/mcp.json` in the project root (same shape as Claude Code's `.mcp.json`).

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector example-mcp
```

Opens a local web UI for poking at tools interactively.

## Configure secrets / env

`example-mcp` reads its config from environment variables. Three options:

1. **Inline env** (CI, Docker, k8s): set `EXAMPLE_CREDENTIALS_JSON` or similar.
2. **1Password CLI** (optional): set `EXAMPLE_CREDENTIALS_OP=op://Vault/Item/field`.
3. **File**: place a JSON file at `~/.example/credentials.json`.

See `apps/example-mcp/.env.example` for the full list of recognized variables.

## Verify

```bash
example-cli doctor          # preflight (Node version, native module, config dir)
example-cli health          # call health_check
example-cli noop --input "hi"  # call the demo tool
```

If anything fails, run with `EXAMPLE_DEV=1` to register the `get_logs` MCP tool, then ask your MCP host to call it.

## Updating

```bash
# Published version
npm install -g @george43g/example-mcp@latest

# Source checkout
git pull
pnpm install
pnpm build
```

After updating, restart your MCP host so it picks up the new code. The dev proxy auto-reloads but the host session caches tool definitions until it reconnects.
