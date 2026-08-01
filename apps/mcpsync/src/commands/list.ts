import { printAuto } from "@george43g/cli-kit";
import { readCanonical } from "../core/canonical.js";
import { diffHost, STATUS_GLYPH } from "../core/diff.js";
import { detectedHosts } from "../core/hosts/index.js";

export interface ListOpts {
  json?: boolean | undefined;
  config?: string | undefined;
}

/** Show a servers×hosts drift grid across detected hosts (see diff.ts for the legend). */
export function runList(opts: ListOpts = {}): void {
  const hosts = detectedHosts();
  if (!hosts.length) {
    process.stdout.write("No MCP hosts detected on this machine.\n");
    return;
  }
  const canonical = readCanonical(opts.config);

  // One diff per host, indexed by server name → glyph.
  const diffs = hosts.map((h) => diffHost(h, canonical));
  const byServer = new Map<string, Record<string, string>>();
  for (const d of diffs) {
    for (const e of d.entries) {
      const row = byServer.get(e.name) ?? { server: e.name };
      row[d.hostId] = STATUS_GLYPH[e.status];
      byServer.set(e.name, row);
    }
  }
  if (!byServer.size) {
    process.stdout.write("No MCP servers found in canonical config or on any detected host.\n");
    return;
  }

  const rows = [...byServer.values()].sort((a, b) =>
    (a.server ?? "").localeCompare(b.server ?? ""),
  );
  printAuto(
    rows,
    {
      head: ["server", ...hosts.map((h) => h.id)],
      rows: (r) => [r.server ?? "", ...hosts.map((h) => r[h.id] ?? "·")],
    },
    { json: opts.json ?? false },
  );
}
