/**
 * Minimal TOML support for the Codex `~/.codex/config.toml` managed block.
 *
 * We only ever read/write the block between the dotfiles markers, and its shape
 * is exactly what render.js hand-emits: `[mcp_servers.<name>]` tables whose
 * values are TOML basic strings or arrays of basic strings. That constrained
 * subset lets us hand-roll both directions zero-dep and stay byte-parity with
 * `~/dotfiles/mcp/render.js` — a general TOML library would reformat the rest of
 * the file and break coexistence.
 */

export const BLOCK_BEGIN = "# >>> dotfiles-mcp";
export const BLOCK_END = "# <<< dotfiles-mcp";

/** A JSON string is a valid TOML basic string for our (${VAR}-only) values. */
export const tomlBasicString = (s: string): string => JSON.stringify(s);
export const tomlStringArray = (arr: string[]): string =>
  `[${arr.map(tomlBasicString).join(", ")}]`;

/** The managed block INCLUDING its markers, or "" when absent. */
export function extractBlock(text: string): string {
  const begin = text.indexOf(BLOCK_BEGIN);
  if (begin === -1) return "";
  const end = text.indexOf(BLOCK_END, begin);
  if (end === -1) return "";
  return text.slice(begin, end + BLOCK_END.length);
}

/** The document with the managed block removed (for scanning out-of-block content). */
export function stripBlock(text: string): string {
  const block = extractBlock(text);
  return block ? text.replace(block, "") : text;
}

/**
 * Names of `[mcp_servers.<name>]` tables defined OUTSIDE the managed block.
 * render.js skips these (a duplicate TOML table is invalid). The regex matches
 * only leaf tables (`]` right after the name), never sub-tables like
 * `[mcp_servers.foo.env]`.
 */
export function namesOutsideBlock(text: string): Set<string> {
  const outside = stripBlock(text).matchAll(/^\[mcp_servers\.([A-Za-z0-9_-]+)\]/gm);
  return new Set([...outside].map((m) => m[1] as string));
}

export interface RawCodexTable {
  command?: string;
  args?: string[];
  env_vars?: string[];
  url?: string;
  bearer_token_env_var?: string;
}

function parseValue(raw: string): string | string[] | undefined {
  const v = raw.trim();
  if (v.startsWith("[")) {
    try {
      const arr: unknown = JSON.parse(v);
      return Array.isArray(arr) ? arr.map(String) : undefined;
    } catch {
      return undefined;
    }
  }
  if (v.startsWith('"')) {
    try {
      return String(JSON.parse(v));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Parse the `[mcp_servers.<name>]` tables inside the managed block into raw
 * field maps. Comment lines and blank lines are ignored; only the fields
 * render.js emits (command/args/env_vars/url/bearer_token_env_var) are read.
 */
export function parseManagedTables(text: string): Record<string, RawCodexTable> {
  const block = extractBlock(text);
  if (!block) return {};
  const out: Record<string, RawCodexTable> = {};
  let current: string | null = null;
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const header = /^\[mcp_servers\.([A-Za-z0-9_-]+)\]$/.exec(trimmed);
    if (header) {
      current = header[1] as string;
      out[current] = {};
      continue;
    }
    if (!current) continue;
    const kv = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(trimmed);
    if (!kv) continue;
    const [, key, rawVal] = kv;
    const value = parseValue(rawVal as string);
    if (value === undefined) continue;
    const table = out[current] as RawCodexTable;
    if (key === "command" && typeof value === "string") table.command = value;
    else if (key === "args" && Array.isArray(value)) table.args = value;
    else if (key === "env_vars" && Array.isArray(value)) table.env_vars = value;
    else if (key === "url" && typeof value === "string") table.url = value;
    else if (key === "bearer_token_env_var" && typeof value === "string")
      table.bearer_token_env_var = value;
  }
  return out;
}

/**
 * Replace the managed block in `existing` with `block`, or append it (separated
 * by a blank line) when no block is present yet.
 */
export function spliceBlock(existing: string, block: string): string {
  const current = extractBlock(existing);
  if (current) {
    // Consume a trailing newline after the block so we don't accumulate blanks.
    const withTrailing = existing.includes(`${current}\n`) ? `${current}\n` : current;
    return existing.replace(withTrailing, block);
  }
  return `${existing.replace(/\s*$/, "")}\n\n${block}`;
}
