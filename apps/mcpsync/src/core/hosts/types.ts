import type { McpServer } from "../schema.js";

export interface HostCapabilities {
  /** How the host is configured: a JSON/TOML file, or an official CLI. */
  mechanism: "file" | "cli";
  /** Supports http/sse (remote) servers. */
  http: boolean;
  /** Supports per-server environment variables. */
  env: boolean;
  /** Supports a per-project scope in addition to user scope. */
  project: boolean;
}

export interface WriteResult {
  /** Backup path created before writing, or null when nothing was written. */
  backup?: string | null;
  /** The native (host-shaped) value written, for display (single-server writes). */
  native?: unknown;
  /** If the config path was a symlink, its resolved real target. */
  linkTarget?: string;
  /** Whether the write actually changed anything on disk. */
  changed: boolean;
  /** The config path that would be / was written. */
  path?: string;
}

/**
 * A host adapter. Interface-bounded so hosts are independently testable and
 * (from Stage 2 on) parallelizable. `read`/`write` are the Locked Contract;
 * `readRaw`/`toNative` are additions used by the drift grid.
 */
export interface HostAdapter {
  id: string;
  label: string;
  configPath: string;
  restart: string;
  capabilities: HostCapabilities;
  /** True when the host is installed / its config dir exists. */
  detect(): boolean;
  /** Read the raw native `mcpServers` map (host-shaped), for drift display. */
  readRaw(): Record<string, unknown>;
  /** Read + normalize into canonical servers. */
  read(): McpServer[];
  /** Convert a canonical server into this host's native shape. */
  toNative(server: McpServer): unknown;
  /** Write servers into the host config. See json-adapter for `prune` semantics. */
  write(servers: McpServer[], opts?: { dryRun?: boolean; prune?: boolean }): WriteResult;
  /** Remove a server by name. */
  remove(name: string, opts?: { dryRun?: boolean }): WriteResult;
}
