/**
 * Pure grid model for the TUI — no React, no I/O, so it unit-tests against the
 * same stub adapters as diff.ts. `buildMatrix` pivots per-host diffs into a
 * server×host status grid (the same pivot `commands/list.ts` does for the CLI
 * table, kept as a single source of truth via `diffHost`). The App layer maps
 * the pure `ServerStatus` → glyph/color; nothing here touches a palette.
 */

import { diffHost, type ServerStatus, STATUS_GLYPH } from "../core/diff.js";
import type { HostAdapter } from "../core/hosts/types.js";
import type { McpServer } from "../core/schema.js";

/** A host column, reduced to what the grid renders. */
export interface MatrixHost {
  id: string;
  label: string;
}

/** The immutable server×host status grid. */
export interface GridMatrix {
  hosts: MatrixHost[];
  /** Sorted union of every server name across all hosts (canonical ∪ host-only). */
  servers: string[];
  /** Status of one server on one host, or `undefined` when that cell is absent. */
  statusAt(server: string, hostId: string): ServerStatus | undefined;
}

/** Build the grid from the canonical set + a list of (already detected) hosts. */
export function buildMatrix(
  canonical: Record<string, McpServer>,
  hosts: HostAdapter[],
): GridMatrix {
  const diffs = hosts.map((h) => diffHost(h, canonical));
  const servers = [...new Set(diffs.flatMap((d) => d.entries.map((e) => e.name)))].sort((a, b) =>
    a.localeCompare(b),
  );

  // server → hostId → status
  const grid = new Map<string, Map<string, ServerStatus>>();
  for (const d of diffs) {
    for (const e of d.entries) {
      let row = grid.get(e.name);
      if (!row) {
        row = new Map();
        grid.set(e.name, row);
      }
      row.set(d.hostId, e.status);
    }
  }

  return {
    hosts: hosts.map((h) => ({ id: h.id, label: h.label })),
    servers,
    statusAt: (server, hostId) => grid.get(server)?.get(hostId),
  };
}

/** Semantic tone for a cell — the App maps this onto the active palette. */
export type CellTone = "ok" | "warn" | "danger" | "muted" | "faint";

/** Map a drift status to a color tone (pure so the mapping is testable). */
export function statusTone(status: ServerStatus): CellTone {
  switch (status) {
    case "ok":
      return "ok";
    case "drift":
      return "warn";
    case "extra":
      return "danger";
    case "add":
      return "faint";
    default:
      // off | skip — present-but-intentionally-unmanaged
      return "muted";
  }
}

/** Glyph for a cell; an absent cell (server not on this host) renders as `·`. */
export function cellText(status: ServerStatus | undefined): string {
  return status ? STATUS_GLYPH[status] : "·";
}

/** Clamp an index into [0, len-1]; returns 0 for an empty list. */
export function clampIndex(i: number, len: number): number {
  if (len <= 0) return 0;
  return Math.max(0, Math.min(len - 1, i));
}
