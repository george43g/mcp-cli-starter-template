import { homedir } from "node:os";
import { CANONICAL_DEFAULT, readCanonical, writeCanonical } from "../core/canonical.js";
import { HOSTS } from "../core/hosts/index.js";

export interface ImportOpts {
  from: string;
  config?: string | undefined;
  dryRun?: boolean | undefined;
}

/**
 * Pull a host's servers into the canonical manifest.
 *
 * NOTE: importing from claude-desktop is LOSSY — its servers are stored
 * `$SHELL -lc '…'`-wrapped, so the round-trip yields the wrapper command, not
 * the original command/args. Import from a direct host (cursor/warp) for a
 * faithful copy. This matches the imsg-mcp behaviour.
 */
export function runImport(opts: ImportOpts): void {
  const host = HOSTS[opts.from];
  if (!host) {
    process.stderr.write(`✗ --from must be one of: ${Object.keys(HOSTS).join(", ")}\n`);
    process.exitCode = 1;
    return;
  }
  const canonical = readCanonical(opts.config);
  let n = 0;
  for (const server of host.read()) {
    canonical[server.name] = server;
    n++;
  }
  const result = writeCanonical(canonical, opts.config, { dryRun: opts.dryRun ?? false });
  const where = (opts.config ?? CANONICAL_DEFAULT).replace(homedir(), "~");
  const suffix = opts.dryRun ? " (dry-run)" : result.backup ? ` (backup: ${result.backup})` : "";
  process.stdout.write(`Imported ${n} server(s) from ${host.label} → ${where}${suffix}\n`);
  if (opts.from === "claude-desktop") {
    process.stderr.write(
      "note: claude-desktop entries are $SHELL-wrapped; imported commands are the wrapper, not the original.\n",
    );
  }
}
