import { printAuto } from "@george43g/cli-kit";
import { readCanonical } from "../core/canonical.js";
import { detectedHosts } from "../core/hosts/index.js";
import type { HostAdapter } from "../core/hosts/types.js";
import type { McpServer } from "../core/schema.js";

export interface ListOpts {
  json?: boolean | undefined;
  config?: string | undefined;
}

/**
 * Native-level drift for one server on one host:
 *   ✓      present and byte-identical to what mcpsync would write
 *   drift  present but differs from mcpsync's rendering
 *   -      in canonical, absent from the host (would be added on apply)
 *   extra  present on the host but NOT in canonical (host-only)
 *   off    disabled in canonical (apply skips it)
 *   ·      not in canonical and not on the host
 */
function cell(host: HostAdapter, name: string, canonical: Record<string, McpServer>): string {
  const canon = canonical[name];
  const raw = host.readRaw();
  const inHost = Object.hasOwn(raw, name);
  if (!canon) return inHost ? "extra" : "·";
  if (canon.enabled === false) return "off";
  if (!inHost) return "-";
  const expected = JSON.stringify(host.toNative(canon));
  const actual = JSON.stringify(raw[name]);
  return expected === actual ? "✓" : "drift";
}

/** Show a servers×hosts drift grid across detected hosts. */
export function runList(opts: ListOpts = {}): void {
  const hosts = detectedHosts();
  if (!hosts.length) {
    process.stdout.write("No MCP hosts detected on this machine.\n");
    return;
  }
  const canonical = readCanonical(opts.config);

  const names = new Set<string>(Object.keys(canonical));
  for (const h of hosts) for (const n of Object.keys(h.readRaw())) names.add(n);
  if (!names.size) {
    process.stdout.write("No MCP servers found in canonical config or on any detected host.\n");
    return;
  }

  const sorted = [...names].sort();
  const rows = sorted.map((name) => {
    const row: Record<string, string> = { server: name };
    for (const h of hosts) row[h.id] = cell(h, name, canonical);
    return row;
  });

  printAuto(
    rows,
    {
      head: ["server", ...hosts.map((h) => h.id)],
      rows: (r) => [r.server ?? "", ...hosts.map((h) => r[h.id] ?? "·")],
    },
    { json: opts.json ?? false },
  );
}
