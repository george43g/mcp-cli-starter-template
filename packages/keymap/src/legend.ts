/**
 * Showing users which keys do what: a JSON legend, HelpBar hints, `--keys`
 * collector rows, and a plain-text cheatsheet — all from the same keymap, so
 * the help can never disagree with the bindings.
 *
 * Rendered output (display strings, hint keys, cheatsheet layout) is not
 * covered by semver; the legend's `keys` (canonical notation) and the TSV
 * column order are.
 */

import type { Keymap, ResolvedBinding } from "./keymap.js";
import { type DisplayStyle, formatKeys } from "./notation.js";

export interface LegendEntry {
  id: string;
  /** Canonical notation (`"g g"`, `"ctrl+d"`): the stable, parseable form. */
  keys: string[];
  /** Rendered for humans in the legend's style. */
  display: string[];
  desc: string;
  group: string;
  isDefault: boolean;
  location?: string;
}

export interface Legend {
  version: 1;
  source: string;
  owner?: string;
  style: DisplayStyle;
  bindings: LegendEntry[];
}

export interface LegendOptions {
  /** The tool the keys belong to (the `--keys` "source" column). Default `""`. */
  source?: string;
  owner?: string;
  /** Display style for `display`. Default `"vim"`. */
  style?: DisplayStyle;
}

/** A JSON-serialisable description of every binding, for build-time legend files. */
export function toLegend(keymap: Keymap, options: LegendOptions = {}): Legend {
  const style = options.style ?? "vim";
  return {
    version: 1,
    source: options.source ?? "",
    ...(options.owner === undefined ? {} : { owner: options.owner }),
    style,
    bindings: keymap.bindings.map((b) => ({
      id: b.id,
      keys: [...b.keys],
      display: b.keys.map((k) => formatKeys(k, style)),
      desc: b.desc,
      group: b.group,
      isDefault: b.isDefault,
      ...(b.location === undefined ? {} : { location: b.location }),
    })),
  };
}

/** tui-kit `HelpBar`'s `KeyHint` shape (structurally identical). */
export interface KeyHint {
  key: string;
  label: string;
}

function pick(keymap: Keymap, ids?: readonly string[]): ResolvedBinding[] {
  if (!ids) return [...keymap.bindings];
  return ids.map((id) => {
    const b = keymap.get(id);
    if (!b) throw new Error(`toHints: no binding with id "${id}"`);
    return b;
  });
}

/**
 * Hints for a help bar: one per binding, alternatives joined with `/`.
 * Unbound bindings (overridden to `[]`) are left out. An unknown id throws —
 * it is a typo, and a help bar that silently drops a key is worse.
 */
export function toHints(
  keymap: Keymap,
  ids?: readonly string[],
  style: DisplayStyle = "vim",
): KeyHint[] {
  return pick(keymap, ids)
    .filter((b) => b.keys.length > 0)
    .map((b) => ({ key: b.keys.map((k) => formatKeys(k, style)).join("/"), label: b.desc }));
}

export interface KeysRowsOptions {
  /** Column 1: which tool/surface these keys belong to. */
  source: string;
  /** Column 4: who owns the binding (a repo, a session, a person). */
  owner: string;
  /** Column 5 fallback when a binding has no `location`. Default `""`. */
  location?: string;
  /** Style of column 2. Default `"vim"`. */
  style?: DisplayStyle;
}

/** Tabs and newlines would break the row; collapse them to a space. */
const cell = (s: string) => s.replace(/[\t\r\n]+/g, " ");

/**
 * Rows for a `--keys` flag, in life-stack's collector format — tab-separated
 * `source  key  description  owner  file:line`, one row per key sequence, no
 * header and no trailing newline on each line.
 */
export function formatKeysRows(keymap: Keymap, options: KeysRowsOptions): string[] {
  const style = options.style ?? "vim";
  const rows: string[] = [];
  for (const b of keymap.bindings) {
    const location = b.location ?? options.location ?? "";
    for (const k of b.keys) {
      rows.push(
        [options.source, formatKeys(k, style), b.desc, options.owner, location]
          .map(cell)
          .join("\t"),
      );
    }
  }
  return rows;
}

export interface CheatsheetOptions {
  style?: DisplayStyle;
  /** Optional first line. */
  title?: string;
  /** Mark rebound keys with ` *` and add a footnote. Default true. */
  markNonDefault?: boolean;
}

const width = (s: string) => Array.from(s).length;

/**
 * A grouped plain-text help block:
 *
 * ```
 * Navigation
 *   j, <Down>   Move down
 *   gg, <Home>  Go to top
 * ```
 *
 * Groups appear in first-declared order; keys are padded to one column.
 */
export function formatCheatsheet(keymap: Keymap, options: CheatsheetOptions = {}): string {
  const style = options.style ?? "vim";
  const mark = options.markNonDefault ?? true;
  const groups = new Map<string, { keys: string; desc: string }[]>();
  let anyChanged = false;
  for (const b of keymap.bindings) {
    if (b.keys.length === 0) continue;
    const changed = mark && !b.isDefault;
    anyChanged ||= changed;
    const rows = groups.get(b.group) ?? [];
    rows.push({
      keys: b.keys.map((k) => formatKeys(k, style)).join(", "),
      desc: changed ? `${b.desc} *` : b.desc,
    });
    groups.set(b.group, rows);
  }
  const col = Math.max(0, ...[...groups.values()].flat().map((r) => width(r.keys)));
  const lines: string[] = [];
  if (options.title) lines.push(options.title, "");
  for (const [group, rows] of groups) {
    if (lines.length > 0 && lines.at(-1) !== "") lines.push("");
    lines.push(group);
    for (const r of rows) lines.push(`  ${r.keys}${" ".repeat(col - width(r.keys))}  ${r.desc}`);
  }
  if (anyChanged) lines.push("", "* changed from the default");
  return lines.join("\n");
}
