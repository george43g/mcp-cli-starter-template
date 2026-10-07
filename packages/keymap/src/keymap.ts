/**
 * Declared bindings → an immutable, diagnosed keymap.
 *
 * Defaults are meant to be kept: every tool binding `ctrl+d` to the same thing
 * is the point of the package. But two tools can collide, so a consumer may
 * override any binding — and every override is REPORTED as a `non-default`
 * diagnostic, so the tool can show "you changed the defaults" instead of the
 * change being invisible.
 */

import { canonicalKeys, type KeyStep, parseKeys } from "./notation.js";

/** One declared binding. Plain data, so presets can be spread and extended. */
export interface Binding {
  /** Stable identifier; what the matcher reports and overrides target. */
  id: string;
  /** One sequence or several alternatives: `"g g"` or `["g g", "home"]`. */
  keys: string | readonly string[];
  /** What it does, for legends and help text. */
  desc: string;
  /** Section heading in cheatsheets. Defaults to {@link DEFAULT_GROUP}. */
  group?: string;
  /** `file:line` of the code that handles it, for the `--keys` collector rows. */
  location?: string;
}

/** A binding after overrides, with every sequence parsed and canonicalised. */
export interface ResolvedBinding {
  readonly id: string;
  /** Canonical (`plain`) spellings, in declaration order. May be empty (unbound). */
  readonly keys: readonly string[];
  readonly sequences: readonly (readonly KeyStep[])[];
  readonly desc: string;
  readonly group: string;
  readonly location?: string;
  /** The keys as declared before any override, canonicalised. */
  readonly defaultKeys: readonly string[];
  readonly isDefault: boolean;
}

export type Diagnostic =
  | {
      kind: "conflict";
      /** The sequence bound more than once. */
      keys: string;
      /** Every id bound to it, in declaration order. The FIRST one wins at runtime. */
      ids: string[];
      message: string;
    }
  | {
      kind: "prefix-ambiguity";
      /** The shorter sequence; it fires immediately at runtime. */
      prefix: string;
      prefixId: string;
      /** The longer sequence; it is unreachable while the prefix is bound. */
      keys: string;
      id: string;
      message: string;
    }
  | { kind: "unknown-override"; id: string; message: string }
  | {
      kind: "non-default";
      id: string;
      defaultKeys: string[];
      keys: string[];
      message: string;
    };

export type DiagnosticKind = Diagnostic["kind"];

export interface DefineKeymapOptions {
  /**
   * Replace a binding's keys by id. `[]` unbinds it. An override equal to the
   * default (after canonicalising) is not reported.
   */
  overrides?: Readonly<Record<string, string | readonly string[]>>;
  /**
   * Throw on `conflict` and `prefix-ambiguity` — both leave a binding that can
   * never fire. Off by default so a user's override cannot crash a tool.
   */
  strict?: boolean;
}

export interface Keymap {
  readonly bindings: readonly ResolvedBinding[];
  readonly diagnostics: readonly Diagnostic[];
  /** True when the binding exists and carries its declared keys. */
  isDefault(id: string): boolean;
  get(id: string): ResolvedBinding | undefined;
}

export const DEFAULT_GROUP = "General";

/** Thrown by `defineKeymap` for malformed input, and by `strict` mode. */
export class KeymapError extends Error {
  override name = "KeymapError";
}

const asList = (keys: string | readonly string[]): readonly string[] =>
  typeof keys === "string" ? [keys] : keys;

function canonicalList(id: string, keys: string | readonly string[]): string[] {
  const out: string[] = [];
  for (const spec of asList(keys)) {
    let canon: string;
    try {
      canon = canonicalKeys(spec);
    } catch (error) {
      throw new KeymapError(`binding "${id}": ${(error as Error).message}`);
    }
    if (!out.includes(canon)) out.push(canon);
  }
  return out;
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((k, i) => k === b[i]);

export function defineKeymap(
  bindings: readonly Binding[],
  options: DefineKeymapOptions = {},
): Keymap {
  const overrides = options.overrides ?? {};
  const diagnostics: Diagnostic[] = [];
  const seenIds = new Set<string>();
  const resolved: ResolvedBinding[] = [];

  for (const b of bindings) {
    if (typeof b.id !== "string" || b.id === "") throw new KeymapError("binding with an empty id");
    if (seenIds.has(b.id)) throw new KeymapError(`duplicate binding id "${b.id}"`);
    seenIds.add(b.id);

    const defaultKeys = canonicalList(b.id, b.keys);
    const override = Object.hasOwn(overrides, b.id) ? overrides[b.id] : undefined;
    const keys = override === undefined ? defaultKeys : canonicalList(b.id, override);
    const isDefault = sameList(keys, defaultKeys);
    if (!isDefault) {
      diagnostics.push({
        kind: "non-default",
        id: b.id,
        defaultKeys: [...defaultKeys],
        keys: [...keys],
        message: `"${b.id}" is rebound from [${defaultKeys.join(", ")}] to [${keys.join(", ")}]`,
      });
    }

    const entry: ResolvedBinding = Object.freeze({
      id: b.id,
      keys: Object.freeze(keys),
      sequences: Object.freeze(keys.map((k) => Object.freeze(parseKeys(k)))),
      desc: b.desc,
      group: b.group ?? DEFAULT_GROUP,
      ...(b.location === undefined ? {} : { location: b.location }),
      defaultKeys: Object.freeze(defaultKeys),
      isDefault,
    });
    resolved.push(entry);
  }

  for (const id of Object.keys(overrides)) {
    if (!seenIds.has(id)) {
      diagnostics.push({
        kind: "unknown-override",
        id,
        message: `override for unknown binding "${id}" was ignored`,
      });
    }
  }

  // Conflicts: one sequence, several ids.
  const owners = new Map<string, string[]>();
  for (const b of resolved) {
    for (const k of b.keys) {
      const ids = owners.get(k) ?? [];
      ids.push(b.id);
      owners.set(k, ids);
    }
  }
  for (const [keys, ids] of owners) {
    if (ids.length > 1) {
      diagnostics.push({
        kind: "conflict",
        keys,
        ids,
        message: `"${keys}" is bound to ${ids.map((i) => `"${i}"`).join(" and ")}; "${ids[0]}" wins`,
      });
    }
  }

  // Prefix ambiguity: a complete sequence that is also the start of a longer one.
  for (const [prefix, prefixIds] of owners) {
    for (const [keys, ids] of owners) {
      if (keys.length > prefix.length && keys.startsWith(`${prefix} `)) {
        diagnostics.push({
          kind: "prefix-ambiguity",
          prefix,
          prefixId: prefixIds[0]!,
          keys,
          id: ids[0]!,
          message: `"${prefix}" ("${prefixIds[0]}") fires immediately, so "${keys}" ("${ids[0]}") can never be reached`,
        });
      }
    }
  }

  if (options.strict) {
    const fatal = diagnostics.filter((d) => d.kind === "conflict" || d.kind === "prefix-ambiguity");
    if (fatal.length > 0) {
      throw new KeymapError(`keymap is ambiguous:\n  ${fatal.map((d) => d.message).join("\n  ")}`);
    }
  }

  const byId = new Map(resolved.map((b) => [b.id, b]));
  return Object.freeze({
    bindings: Object.freeze(resolved),
    diagnostics: Object.freeze(diagnostics.map((d) => Object.freeze(d))),
    isDefault: (id: string) => byId.get(id)?.isDefault ?? false,
    get: (id: string) => byId.get(id),
  });
}
