import { homedir } from "node:os";
import { join } from "node:path";
import { normalize } from "../canonical.js";
import type { McpServer } from "../schema.js";
import { jsonMcpServersAdapter, toClaudeDesktopServer, toDirectNative } from "./json-adapter.js";
import type { HostAdapter, WriteResult } from "./types.js";

const HOME = homedir();

/**
 * The file-merge hosts (Stage 1). CLI hosts (Claude Code, Codex) and opencode
 * land in Stage 2. The Claude Desktop marker key is `_mcpManagedByDotfiles` —
 * the SAME key ~/dotfiles/mcp/render.js uses — so mcpsync and the dotfiles
 * renderer coexist without clobbering each other's managed set.
 */
export const HOSTS: Record<string, HostAdapter> = {
  "claude-desktop": jsonMcpServersAdapter({
    id: "claude-desktop",
    label: "Claude Desktop",
    configPath: join(
      HOME,
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    ),
    restart: "Fully Quit + reopen Claude Desktop.",
    transform: toClaudeDesktopServer,
    marker: "_mcpManagedByDotfiles",
    capabilities: { mechanism: "file", http: true, env: true, project: false },
  }),
  cursor: jsonMcpServersAdapter({
    id: "cursor",
    label: "Cursor",
    configPath: join(HOME, ".cursor", "mcp.json"),
    restart: "Reload the Cursor window.",
    transform: toDirectNative,
    capabilities: { mechanism: "file", http: true, env: true, project: true },
  }),
  warp: jsonMcpServersAdapter({
    id: "warp",
    label: "Warp",
    configPath: join(HOME, ".warp", ".mcp.json"),
    restart: "Warp reloads MCP config on change (or via the MCP panel).",
    transform: toDirectNative,
    capabilities: { mechanism: "file", http: true, env: true, project: true },
  }),
};

export function hostList(): HostAdapter[] {
  return Object.values(HOSTS);
}

export function detectedHosts(): HostAdapter[] {
  return hostList().filter((h) => h.detect());
}

/**
 * Apply a single server to one host (or "all" detected hosts). Always a safe
 * MERGE (`prune: false`) so sibling servers are never removed — this is the
 * "an MCP configures itself" entry point. Throws on an unknown host id.
 */
export function applyServer(
  hostId: string,
  server: McpServer,
  opts: { dryRun?: boolean } = {},
): Record<string, WriteResult> {
  const targets =
    hostId === "all" ? detectedHosts() : HOSTS[hostId] ? [HOSTS[hostId] as HostAdapter] : [];
  if (!targets.length) {
    throw new Error(`unknown host: ${hostId} (known: ${Object.keys(HOSTS).join(", ")}, or "all")`);
  }
  const normalized = normalize(server, server.name);
  const out: Record<string, WriteResult> = {};
  for (const h of targets) {
    out[h.id] = h.write([normalized], { dryRun: opts.dryRun ?? false, prune: false });
  }
  return out;
}
