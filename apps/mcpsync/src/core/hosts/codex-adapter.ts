import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { backup } from "../backup.js";
import { normalize } from "../canonical.js";
import type { McpServer } from "../schema.js";
import {
  BLOCK_BEGIN,
  BLOCK_END,
  namesOutsideBlock,
  parseManagedTables,
  type RawCodexTable,
  spliceBlock,
  tomlBasicString,
  tomlStringArray,
} from "../toml.js";
import type { HostAdapter, WriteResult } from "./types.js";

const VAR_RE = /\$\{([A-Z0-9_]+)\}/g;
const varsIn = (s: string): string[] => [...String(s).matchAll(VAR_RE)].map((m) => m[1] as string);

/**
 * Canonical → the codex fields that actually get emitted (only ${K}-passthrough
 * env and a `Bearer ${VAR}` Authorization header survive; everything else is
 * dropped with a NOTE, exactly like render.js). Used for both rendering and
 * drift comparison, so `matches` and `write` can never disagree.
 */
export function toCodexTable(s: McpServer): { table: RawCodexTable; notes: string[] } {
  const notes: string[] = [];
  const table: RawCodexTable = {};
  if (s.transport !== "stdio" && s.url) {
    table.url = s.url;
    const auth = s.headers?.Authorization;
    const bearer = auth ? /^Bearer \$\{([A-Z0-9_]+)\}$/.exec(auth) : null;
    if (bearer) table.bearer_token_env_var = bearer[1] as string;
    else if (s.headers && Object.keys(s.headers).length)
      notes.push(`non-Bearer headers not supported by codex: ${Object.keys(s.headers).join(", ")}`);
    return { table, notes };
  }
  if (s.command) table.command = s.command;
  if (s.args?.length) table.args = s.args;
  if (s.env && Object.keys(s.env).length) {
    const passthrough: string[] = [];
    for (const [k, v] of Object.entries(s.env)) {
      const vs = varsIn(v);
      if (vs.length === 1 && vs[0] === k) passthrough.push(k);
      else
        notes.push(
          `non-passthrough env skipped for ${s.name}: ${k} (${vs.join("+") || "literal"})`,
        );
    }
    if (passthrough.length) table.env_vars = passthrough;
  }
  return { table, notes };
}

/** codex managed-block table → canonical McpServer (reverse of toCodexTable). */
function fromCodexTable(name: string, raw: RawCodexTable): McpServer {
  if (raw.url) {
    const headers = raw.bearer_token_env_var
      ? { Authorization: `Bearer \${${raw.bearer_token_env_var}}` }
      : undefined;
    return normalize({ url: raw.url, ...(headers ? { headers } : {}) }, name);
  }
  const env = raw.env_vars?.length
    ? Object.fromEntries(raw.env_vars.map((k) => [k, `\${${k}}`]))
    : undefined;
  return normalize({ command: raw.command, args: raw.args ?? [], ...(env ? { env } : {}) }, name);
}

const tablesEqual = (a: RawCodexTable, b: RawCodexTable): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** Render the full managed block (markers included) from the given servers. */
function renderBlock(
  servers: McpServer[],
  taken: Set<string>,
): { block: string; skipped: string[] } {
  const lines = [BLOCK_BEGIN, "# GENERATED FROM the mcpsync canonical manifest — do not hand-edit"];
  const skipped: string[] = [];
  for (const s of servers) {
    if (taken.has(s.name)) {
      skipped.push(s.name);
      continue;
    }
    const { table, notes } = toCodexTable(s);
    lines.push("", `[mcp_servers.${s.name}]`);
    if (table.url) {
      lines.push(`url = ${tomlBasicString(table.url)}`);
      if (table.bearer_token_env_var)
        lines.push(`bearer_token_env_var = ${tomlBasicString(table.bearer_token_env_var)}`);
    } else {
      if (table.command) lines.push(`command = ${tomlBasicString(table.command)}`);
      if (table.args?.length) lines.push(`args = ${tomlStringArray(table.args)}`);
      if (table.env_vars?.length) lines.push(`env_vars = ${tomlStringArray(table.env_vars)}`);
    }
    for (const note of notes) lines.push(`# NOTE: ${note}`);
  }
  lines.push(BLOCK_END);
  return { block: `${lines.join("\n")}\n`, skipped };
}

/**
 * Codex adapter. Codex has an official `codex mcp add`, but writing through it
 * would land outside the dotfiles `# >>> dotfiles-mcp` block (risking duplicate,
 * invalid TOML tables) and diverge from render.js. So mcpsync manages the block
 * as a FILE writer — byte-parity with render.js, coexisting with dotfiles — and
 * skips any server already defined outside the block.
 */
export function codexAdapter(configPath: string): HostAdapter {
  const readText = (): string => (existsSync(configPath) ? readFileSync(configPath, "utf8") : "");

  return {
    id: "codex",
    label: "Codex",
    configPath,
    restart: "Applies on the next codex run.",
    capabilities: { mechanism: "file", http: true, env: true, project: false },
    detect: () => existsSync(configPath) || existsSync(dirname(configPath)),
    readRaw() {
      return parseManagedTables(readText());
    },
    read() {
      return Object.entries(this.readRaw() as Record<string, RawCodexTable>).map(([n, t]) =>
        fromCodexTable(n, t),
      );
    },
    toNative(server: McpServer) {
      return toCodexTable(server).table;
    },
    matches(canon: McpServer, raw: unknown) {
      return tablesEqual(toCodexTable(canon).table, raw as RawCodexTable);
    },
    willSkip(name: string) {
      return namesOutsideBlock(readText()).has(name);
    },
    write(servers, opts = {}) {
      const { dryRun = false, prune = false } = opts;
      const existing = readText();
      const taken = namesOutsideBlock(existing);
      const managedNow = this.read();
      const merged = prune
        ? servers
        : [...managedNow.filter((m) => !servers.some((s) => s.name === m.name)), ...servers];
      const { block, skipped } = renderBlock(merged, taken);
      const next = spliceBlock(existing, block);
      const changed = next !== existing;
      const result: WriteResult = { changed, path: configPath };
      if (skipped.length) result.skipped = skipped;
      if (dryRun || !changed) {
        result.backup = null;
        return result;
      }
      result.backup = backup(configPath);
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, next);
      return result;
    },
    remove(name, opts = {}) {
      const { dryRun = false } = opts;
      const existing = readText();
      const taken = namesOutsideBlock(existing);
      const kept = this.read().filter((m) => m.name !== name);
      const { block } = renderBlock(kept, taken);
      const next = spliceBlock(existing, block);
      const changed = next !== existing;
      const result: WriteResult = { changed, path: configPath };
      if (dryRun || !changed) {
        result.backup = null;
        return result;
      }
      result.backup = backup(configPath);
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, next);
      return result;
    },
  };
}
