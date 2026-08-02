import type { HostAdapter } from "./hosts/types.js";
import type { McpServer } from "./schema.js";

/**
 * Per-server drift status on one host:
 *   ok     present and matches what mcpsync would write
 *   drift  present but differs
 *   add    in canonical (enabled), absent from the host — would be added
 *   extra  present on the host but not in canonical
 *   off    disabled in canonical — apply skips it
 *   skip   the host intentionally won't manage it (e.g. codex out-of-block)
 */
export type ServerStatus = "ok" | "drift" | "add" | "extra" | "off" | "skip";

export interface HostDiffEntry {
  name: string;
  status: ServerStatus;
}

export interface HostDiff {
  hostId: string;
  label: string;
  entries: HostDiffEntry[];
}

/** Compute the status of one server on one host given the host's raw config. */
export function statusOf(
  host: HostAdapter,
  name: string,
  canonical: Record<string, McpServer>,
  raw: Record<string, unknown>,
): ServerStatus {
  const canon = canonical[name];
  if (!canon) return "extra";
  if (canon.enabled === false) return "off";
  if (host.willSkip?.(name)) return "skip";
  if (!Object.hasOwn(raw, name)) return "add";
  return host.matches(canon, raw[name]) ? "ok" : "drift";
}

/** Diff every server (canonical ∪ host) on a single host. */
export function diffHost(host: HostAdapter, canonical: Record<string, McpServer>): HostDiff {
  const raw = host.readRaw();
  const names = [...new Set([...Object.keys(canonical), ...Object.keys(raw)])].sort();
  return {
    hostId: host.id,
    label: host.label,
    entries: names.map((name) => ({ name, status: statusOf(host, name, canonical, raw) })),
  };
}

/** Glyphs for the drift grid / sync plan. */
export const STATUS_GLYPH: Record<ServerStatus, string> = {
  ok: "✓",
  drift: "drift",
  add: "-",
  extra: "extra",
  off: "off",
  skip: "skip",
};
