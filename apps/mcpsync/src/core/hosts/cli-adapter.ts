import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { normalize, readRawJson } from "../canonical.js";
import type { McpServer } from "../schema.js";
import type { HostAdapter } from "./types.js";

/**
 * Build the `claude mcp add --scope user …` argv for a server. Pure — unit
 * tested; `${VAR}` placeholders are passed as literal strings (no shell), so
 * secrets are never baked at add time. Ported from ~/dotfiles/mcp/sync.sh.
 */
export function buildClaudeAdd(s: McpServer): string[] {
  if (s.transport !== "stdio" && s.url) {
    const argv = ["mcp", "add", "--scope", "user", "--transport", s.transport, s.name, s.url];
    for (const [k, v] of Object.entries(s.headers ?? {})) argv.push("--header", `${k}: ${v}`);
    return argv;
  }
  const argv = ["mcp", "add", "--scope", "user", s.name];
  for (const [k, v] of Object.entries(s.env ?? {})) argv.push("-e", `${k}=${v}`);
  argv.push("--", s.command ?? "", ...(s.args ?? []));
  return argv;
}

export const buildClaudeRemove = (name: string): string[] => ["mcp", "remove", "-s", "user", name];

/**
 * Field-level drift for a CLI host — the stored entry matches the canonical
 * server. Lenient on `type` (Claude omits it for stdio and may store
 * http/sse/undefined for remote), exactly like sync.sh's `matches()`.
 */
function claudeMatches(canon: McpServer, raw: unknown): boolean {
  const cur = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (canon.transport !== "stdio" && canon.url) {
    const type = cur.type;
    return (
      cur.url === canon.url &&
      (type === "http" || type === "sse" || type === undefined) &&
      JSON.stringify(cur.headers ?? {}) === JSON.stringify(canon.headers ?? {})
    );
  }
  return (
    cur.command === canon.command &&
    JSON.stringify(cur.args ?? []) === JSON.stringify(canon.args ?? []) &&
    JSON.stringify(cur.env ?? {}) === JSON.stringify(canon.env ?? {})
  );
}

export interface CliAdapterConfig {
  id: string;
  label: string;
  /** Executable name (e.g. "claude"). */
  bin: string;
  /** JSON file the host stores user-scope servers in (read fidelity). */
  readPath: string;
  restart: string;
}

/**
 * Adapter for a host whose config is owned by an official CLI (Claude Code).
 * Reads the source-of-truth file directly (never `mcp list`, which the imsg
 * prototype found returns noise). Writes shell out to the CLI — so no backup is
 * taken (the CLI owns the file). A full-sync write (`prune`) also removes
 * user-scope servers absent from the given set (sync.sh reconcile semantics);
 * a merge write only adds/updates.
 */
export function cliAdapter(cfg: CliAdapterConfig): HostAdapter {
  const { id, label, bin, readPath, restart } = cfg;
  const run = (argv: string[]): void => {
    execFileSync(bin, argv, { encoding: "utf8", stdio: "ignore" });
  };

  return {
    id,
    label,
    configPath: readPath,
    restart,
    capabilities: { mechanism: "cli", http: true, env: true, project: false },
    detect: () => existsSync(readPath),
    readRaw() {
      const doc = readRawJson(readPath);
      return doc.mcpServers && typeof doc.mcpServers === "object"
        ? (doc.mcpServers as Record<string, unknown>)
        : {};
    },
    read() {
      return Object.entries(this.readRaw()).map(([n, s]) => normalize(s, n));
    },
    toNative(server: McpServer) {
      // Claude stores a standard shape; surface it for display/JSON.
      if (server.transport === "stdio") {
        return {
          command: server.command,
          args: server.args ?? [],
          ...(server.env && Object.keys(server.env).length ? { env: server.env } : {}),
        };
      }
      return {
        type: server.transport,
        url: server.url,
        ...(server.headers && Object.keys(server.headers).length
          ? { headers: server.headers }
          : {}),
      };
    },
    matches: claudeMatches,
    write(servers, opts = {}) {
      const { dryRun = false, prune = false } = opts;
      const current = this.readRaw();
      const names = servers.map((s) => s.name);
      const commands: string[] = [];
      const exec = (argv: string[]) => {
        commands.push(`${bin} ${argv.join(" ")}`);
        if (!dryRun) run(argv);
      };

      if (prune) {
        for (const name of Object.keys(current)) {
          if (!names.includes(name)) exec(buildClaudeRemove(name));
        }
      }
      for (const s of servers) {
        const has = Object.hasOwn(current, s.name);
        if (has && claudeMatches(s, current[s.name])) continue; // already in sync
        if (has) exec(buildClaudeRemove(s.name)); // re-add on drift (claude add won't overwrite)
        exec(buildClaudeAdd(s));
      }
      return { changed: commands.length > 0, path: readPath, backup: null, commands };
    },
    remove(name, opts = {}) {
      const { dryRun = false } = opts;
      const has = Object.hasOwn(this.readRaw(), name);
      const commands: string[] = [];
      if (has) {
        commands.push(`${bin} ${buildClaudeRemove(name).join(" ")}`);
        if (!dryRun) run(buildClaudeRemove(name));
      }
      return { changed: has, path: readPath, backup: null, commands };
    },
  };
}
