import { existsSync, lstatSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { backup } from "../backup.js";
import { normalize, readRawJson } from "../canonical.js";
import type { McpServer } from "../schema.js";
import { shdq } from "../shell-quote.js";
import type { HostAdapter, HostCapabilities, WriteResult } from "./types.js";

const hasKeys = (o: Record<string, string> | undefined): o is Record<string, string> =>
  !!o && Object.keys(o).length > 0;

/**
 * The login shell used to wrap Claude Desktop launches. Read at CALL time (not
 * module load, as render.js does) so tests can override `process.env.SHELL`.
 */
export function loginShell(): string {
  return process.env.SHELL || "/bin/zsh";
}

/**
 * Wrap a canonical server for Claude Desktop, which never expands ${VAR} and
 * launches from the GUI app env. Each server runs through `$SHELL -lc '…'` so
 * placeholders resolve in the login shell at launch (no secrets at rest);
 * remote (url) servers are bridged via `mcp-remote` (Desktop mcpServers is
 * stdio-only). Ported verbatim from ~/dotfiles/mcp/render.js.
 */
export function toClaudeDesktopServer(s: McpServer): { command: string; args: string[] } {
  const shell = loginShell();
  if (s.transport !== "stdio" && s.url) {
    const parts = ["exec", "npx", "-y", "mcp-remote", s.url];
    for (const [k, v] of Object.entries(s.headers ?? {})) parts.push("--header", `${k}: ${v}`);
    return { command: shell, args: ["-lc", parts.map(shdq).join(" ")] };
  }
  const inner = ["exec", s.command ?? "", ...(s.args ?? [])].map(shdq).join(" ");
  const assigns = Object.entries(s.env ?? {})
    .map(([k, v]) => `${k}=${shdq(v)}`)
    .join(" ");
  return { command: shell, args: ["-lc", assigns ? `${assigns} ${inner}` : inner] };
}

/**
 * Direct native shape for Cursor / Warp — they DO expand ${VAR} and read a
 * standard `mcpServers` map, so placeholders pass through verbatim.
 */
export function toDirectNative(s: McpServer): Record<string, unknown> {
  if (s.transport === "stdio") {
    return {
      command: s.command,
      // Omit empty args/env so the native shape matches the terse canonical
      // form (Cursor/Warp are ${VAR}-passthrough and often symlinked to it) —
      // otherwise a bare `args: []` reads as spurious drift.
      ...(s.args?.length ? { args: s.args } : {}),
      ...(hasKeys(s.env) ? { env: s.env } : {}),
    };
  }
  return {
    type: s.transport,
    url: s.url,
    ...(hasKeys(s.headers) ? { headers: s.headers } : {}),
  };
}

export interface JsonAdapterConfig {
  id: string;
  label: string;
  configPath: string;
  restart: string;
  /** Canonical → native transform for this host. */
  transform: (s: McpServer) => unknown;
  /** Top-level marker array key tracking servers we manage (Claude Desktop). */
  marker?: string;
  capabilities: HostCapabilities;
}

/**
 * Factory for file-merge hosts whose config is JSON with a top-level
 * `mcpServers` map (Claude Desktop, Cursor, Warp).
 *
 * The `prune` write option is the key safety lever:
 *   - `prune: false` (default) — safe MERGE: add/update the given servers, never
 *     delete. For a marker host the marker becomes union(previous, given). Used
 *     by `applyServer` and `apply --only` so siblings are never removed.
 *   - `prune: true` — full sync (render.js semantics): for a marker host, delete
 *     previously-managed servers now absent from the given set, then re-add;
 *     the marker becomes exactly the given names. Unmanaged siblings (not in the
 *     marker) always survive. Used by a full `apply` (no `--only`).
 * Non-marker hosts never delete on write regardless of `prune`.
 */
export function jsonMcpServersAdapter(cfg: JsonAdapterConfig): HostAdapter {
  const { id, label, configPath, restart, transform, marker, capabilities } = cfg;

  const currentServers = (doc: Record<string, unknown>): Record<string, unknown> =>
    doc.mcpServers && typeof doc.mcpServers === "object"
      ? (doc.mcpServers as Record<string, unknown>)
      : {};

  const symlinkTarget = (): string | undefined =>
    existsSync(configPath) && lstatSync(configPath).isSymbolicLink()
      ? realpathSync(configPath)
      : undefined;

  const persist = (doc: Record<string, unknown>): string | null => {
    const b = backup(configPath);
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, `${JSON.stringify(doc, null, 2)}\n`);
    return b;
  };

  return {
    id,
    label,
    configPath,
    restart,
    capabilities,
    detect: () => existsSync(configPath) || existsSync(dirname(configPath)),
    readRaw() {
      return currentServers(readRawJson(configPath));
    },
    read() {
      return Object.entries(this.readRaw()).map(([n, s]) => normalize(s, n));
    },
    toNative(server: McpServer) {
      return transform(server);
    },
    matches(canon: McpServer, raw: unknown) {
      return JSON.stringify(transform(canon)) === JSON.stringify(raw);
    },
    write(servers, opts = {}) {
      const { dryRun = false, prune = false } = opts;
      const doc = readRawJson(configPath);
      const before = JSON.stringify(doc);
      const current = currentServers(doc);
      const names = servers.map((s) => s.name);

      if (marker && prune) {
        const prev = Array.isArray(doc[marker]) ? (doc[marker] as string[]) : [];
        for (const n of prev) if (!names.includes(n)) delete current[n];
      }
      for (const s of servers) current[s.name] = transform(s);
      doc.mcpServers = current;
      if (marker) {
        const prev = Array.isArray(doc[marker]) ? (doc[marker] as string[]) : [];
        doc[marker] = prune ? names : Array.from(new Set([...prev, ...names]));
      }

      const changed = JSON.stringify(doc) !== before;
      const result: WriteResult = { changed, path: configPath };
      const link = symlinkTarget();
      if (link !== undefined) result.linkTarget = link;
      const firstName = names[0];
      if (servers.length === 1 && firstName !== undefined) result.native = current[firstName];

      if (dryRun || !changed) {
        result.backup = null;
        return result;
      }
      result.backup = persist(doc);
      return result;
    },
    remove(name, opts = {}) {
      const { dryRun = false } = opts;
      const doc = readRawJson(configPath);
      const before = JSON.stringify(doc);
      const current = currentServers(doc);
      delete current[name];
      doc.mcpServers = current;
      if (marker) {
        const prev = Array.isArray(doc[marker]) ? (doc[marker] as string[]) : [];
        doc[marker] = prev.filter((n) => n !== name);
      }
      const changed = JSON.stringify(doc) !== before;
      const result: WriteResult = { changed, path: configPath };
      if (dryRun || !changed) {
        result.backup = null;
        return result;
      }
      result.backup = persist(doc);
      return result;
    },
  };
}
