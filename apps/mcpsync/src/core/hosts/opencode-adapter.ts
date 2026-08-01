import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { backup } from "../backup.js";
import { normalize, readRawJson, readRawJsonStrict } from "../canonical.js";
import type { McpServer } from "../schema.js";
import type { HostAdapter, WriteResult } from "./types.js";

// opencode expresses ${VAR} as {env:VAR}; convert on the way in and out.
const toOpencodeEnv = (s: string): string => s.replace(/\$\{([A-Z0-9_]+)\}/g, "{env:$1}");
const fromOpencodeEnv = (s: string): string => s.replace(/\{env:([A-Z0-9_]+)\}/g, "${$1}");
const mapValues = (o: Record<string, string>, f: (v: string) => string): Record<string, string> =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));

/**
 * Canonical → opencode's outlier native shape: a `mcp` map whose entries use
 * `type:"local"|"remote"`, a `command` ARRAY (not command/args), `environment`
 * (not env), `enabled`, and `{env:VAR}` placeholders. Key order matches
 * render.js so a byte compare in `matches` is stable.
 */
export function toOpencode(s: McpServer): Record<string, unknown> {
  if (s.transport !== "stdio" && s.url) {
    const entry: Record<string, unknown> = { type: "remote", url: s.url, enabled: true };
    if (s.headers && Object.keys(s.headers).length)
      entry.headers = mapValues(s.headers, toOpencodeEnv);
    return entry;
  }
  const entry: Record<string, unknown> = {
    type: "local",
    command: [s.command ?? "", ...(s.args ?? [])],
    enabled: true,
  };
  if (s.env && Object.keys(s.env).length) entry.environment = mapValues(s.env, toOpencodeEnv);
  return entry;
}

/** opencode native entry → canonical McpServer (reverse of toOpencode). */
function fromOpencode(name: string, raw: unknown): McpServer {
  const e = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (e.type === "remote" || (typeof e.url === "string" && !e.command)) {
    const headers =
      e.headers && typeof e.headers === "object"
        ? mapValues(e.headers as Record<string, string>, fromOpencodeEnv)
        : undefined;
    return normalize({ url: e.url, ...(headers ? { headers } : {}) }, name);
  }
  const cmd = Array.isArray(e.command) ? (e.command as string[]) : [];
  const env =
    e.environment && typeof e.environment === "object"
      ? mapValues(e.environment as Record<string, string>, fromOpencodeEnv)
      : undefined;
  return normalize({ command: cmd[0], args: cmd.slice(1), ...(env ? { env } : {}) }, name);
}

/**
 * opencode adapter. The `mcp` key is rewritten; all other top-level keys
 * ($schema, config) are preserved. Full-sync (`prune`) replaces `mcp` with
 * exactly the given servers; a merge adds/updates while keeping the rest.
 */
export function opencodeAdapter(configPath: string): HostAdapter {
  const readMcp = (): Record<string, unknown> => {
    const doc = readRawJson(configPath);
    return doc.mcp && typeof doc.mcp === "object" ? (doc.mcp as Record<string, unknown>) : {};
  };

  return {
    id: "opencode",
    label: "opencode",
    configPath,
    restart: "Restart opencode.",
    capabilities: { mechanism: "file", http: true, env: true, project: false },
    detect: () => existsSync(configPath) || existsSync(dirname(configPath)),
    readRaw: readMcp,
    read() {
      return Object.entries(readMcp()).map(([n, s]) => fromOpencode(n, s));
    },
    toNative: toOpencode,
    matches(canon: McpServer, raw: unknown) {
      return JSON.stringify(toOpencode(canon)) === JSON.stringify(raw);
    },
    write(servers, opts = {}) {
      const { dryRun = false, prune = false } = opts;
      // Strict read (aborts on corrupt, keeps non-mcp keys); fresh file gets $schema.
      const doc = existsSync(configPath)
        ? readRawJsonStrict(configPath)
        : { $schema: "https://opencode.ai/config.json" };
      const before = JSON.stringify(doc);
      const current = prune ? {} : { ...readMcp() };
      for (const s of servers) current[s.name] = toOpencode(s);
      doc.mcp = current;
      const changed = JSON.stringify(doc) !== before;
      const result: WriteResult = { changed, path: configPath };
      if (dryRun || !changed) {
        result.backup = null;
        return result;
      }
      result.backup = backup(configPath);
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, `${JSON.stringify(doc, null, 2)}\n`);
      return result;
    },
    remove(name, opts = {}) {
      const { dryRun = false } = opts;
      if (!existsSync(configPath)) return { changed: false, path: configPath, backup: null };
      const doc = readRawJsonStrict(configPath);
      const before = JSON.stringify(doc);
      const current = { ...readMcp() };
      delete current[name];
      doc.mcp = current;
      const changed = JSON.stringify(doc) !== before;
      const result: WriteResult = { changed, path: configPath };
      if (dryRun || !changed) {
        result.backup = null;
        return result;
      }
      result.backup = backup(configPath);
      writeFileSync(configPath, `${JSON.stringify(doc, null, 2)}\n`);
      return result;
    },
  };
}
