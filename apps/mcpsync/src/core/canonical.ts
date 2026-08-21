import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { backup } from "./backup.js";
import { formatJson } from "./json-format.js";
import { type McpServer, McpServerSchema } from "./schema.js";

export const CANONICAL_DEFAULT = join(homedir(), ".mcp.json");

/** Parse JSON at `path`; return {} on a missing file or a parse error (never throws). */
export function readRawJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Parse JSON at `path` for a WRITE path. Unlike `readRawJson` (never throws, so
 * read-only surfaces don't crash on a corrupt file), an existing-but-unparseable
 * file THROWS here: silently treating it as `{}` would rebuild the document and
 * discard every non-MCP key the corrupt file still holds. A missing or empty
 * file is a legitimate fresh start and returns {}.
 */
export function readRawJsonStrict(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf8");
  if (text.trim() === "") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `refusing to overwrite ${path}: existing content is not valid JSON (${(err as Error).message}). Fix or remove it first.`,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`refusing to overwrite ${path}: existing content is not a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

/**
 * Coerce any host/user server shape into the canonical McpServer (validated).
 * Uses conditional key assignment (never assigns `undefined`) so the object
 * satisfies exactOptionalPropertyTypes before it is parsed.
 */
export function normalize(raw: unknown, name: string): McpServer {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const url = typeof s.url === "string" ? s.url : undefined;
  const type = typeof s.type === "string" ? s.type : undefined;
  const rawT = typeof s.transport === "string" ? s.transport : undefined;
  const transport: McpServer["transport"] =
    rawT === "stdio" || rawT === "http" || rawT === "sse"
      ? rawT
      : type === "sse"
        ? "sse"
        : type === "http" || url
          ? "http"
          : "stdio";

  const draft: Record<string, unknown> = { name, transport };
  if (typeof s.command === "string") draft.command = s.command;
  if (Array.isArray(s.args)) draft.args = s.args;
  const env = s.env ?? s.environment;
  if (env && typeof env === "object") draft.env = env;
  if (url !== undefined) draft.url = url;
  if (s.headers && typeof s.headers === "object") draft.headers = s.headers;
  if (typeof s.cwd === "string") draft.cwd = s.cwd;
  if (typeof s.enabled === "boolean") draft.enabled = s.enabled;
  if (s.scope === "user" || s.scope === "project") draft.scope = s.scope;

  return McpServerSchema.parse(draft);
}

/** Load the canonical manifest as a name→McpServer map. */
export function readCanonical(path: string = CANONICAL_DEFAULT): Record<string, McpServer> {
  const raw = readRawJson(path);
  const servers =
    raw.mcpServers && typeof raw.mcpServers === "object"
      ? (raw.mcpServers as Record<string, unknown>)
      : {};
  const out: Record<string, McpServer> = {};
  for (const [n, s] of Object.entries(servers)) out[n] = normalize(s, n);
  return out;
}

/**
 * Reduce a McpServer back to a minimal on-disk entry: drop the name and every
 * value that equals its default (stdio / enabled:true / scope:user) plus empty
 * collections, so the canonical file stays terse and ${VAR}-clean and round-trips.
 */
export function toCanonicalEntry(server: McpServer): Record<string, unknown> {
  const e: Record<string, unknown> = {};
  if (server.transport !== "stdio") e.transport = server.transport;
  if (server.command) e.command = server.command;
  if (server.args?.length) e.args = server.args;
  if (server.env && Object.keys(server.env).length) e.env = server.env;
  if (server.url) e.url = server.url;
  if (server.headers && Object.keys(server.headers).length) e.headers = server.headers;
  if (server.cwd) e.cwd = server.cwd;
  if (server.enabled === false) e.enabled = false;
  if (server.scope !== "user") e.scope = server.scope;
  return e;
}

export interface CanonicalWriteResult {
  backup: string | null;
  changed: boolean;
}

/**
 * Write the canonical manifest, preserving any non-`mcpServers` top-level keys.
 * Backs up before overwriting; a no-op write (nothing changed) skips both the
 * backup and the write.
 */
export function writeCanonical(
  servers: Record<string, McpServer>,
  path: string = CANONICAL_DEFAULT,
  opts: { dryRun?: boolean } = {},
): CanonicalWriteResult {
  const doc = readRawJsonStrict(path); // throws on a corrupt file — never silently rebuild
  const before = JSON.stringify(doc);
  const mcpServers: Record<string, unknown> = {};
  for (const [n, s] of Object.entries(servers)) mcpServers[n] = toCanonicalEntry(s);
  doc.mcpServers = mcpServers;
  const changed = JSON.stringify(doc) !== before;
  if (opts.dryRun || !changed) return { backup: null, changed };
  const b = backup(path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${formatJson(doc)}\n`);
  return { backup: b, changed };
}
