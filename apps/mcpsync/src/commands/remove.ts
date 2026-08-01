import { homedir } from "node:os";
import { CANONICAL_DEFAULT, readCanonical, writeCanonical } from "../core/canonical.js";
import { ensureConfirmed, resolveTargets } from "./write-hosts.js";

export interface RemoveOpts {
  name: string;
  to?: string | undefined;
  config?: string | undefined;
  dryRun?: boolean | undefined;
  yes?: boolean | undefined;
}

/**
 * Remove a server. Default target is the canonical manifest; `--to <host>|all`
 * removes it from the host config(s) instead (leaving canonical untouched).
 */
export async function runRemove(opts: RemoveOpts): Promise<void> {
  const dryRun = opts.dryRun ?? false;

  if (opts.to) {
    const targets = resolveTargets(opts.to);
    if (!targets.length) {
      process.stderr.write(`✗ no such host: ${opts.to}\n`);
      process.exitCode = 1;
      return;
    }
    const proceed = await ensureConfirmed({
      dryRun,
      yes: opts.yes ?? false,
      summary: `Remove "${opts.name}" from ${targets.map((t) => t.label).join(", ")}?`,
    });
    if (!proceed) return;
    const home = homedir();
    for (const host of targets) {
      const r = host.remove(opts.name, { dryRun });
      const verb = dryRun ? "would remove" : r.changed ? "removed" : "not present";
      const bak = r.backup ? `  (backup: ${r.backup.replace(home, "~")})` : "";
      process.stdout.write(`▸ ${host.label}: ${verb} "${opts.name}"${bak}\n`);
    }
    return;
  }

  const canonical = readCanonical(opts.config);
  if (!(opts.name in canonical)) {
    process.stderr.write(`✗ "${opts.name}" not found in canonical config\n`);
    process.exitCode = 1;
    return;
  }
  delete canonical[opts.name];
  writeCanonical(canonical, opts.config, { dryRun });
  const where = (opts.config ?? CANONICAL_DEFAULT).replace(homedir(), "~");
  process.stdout.write(`Removed "${opts.name}" from ${where}${dryRun ? " (dry-run)" : ""}.\n`);
}
