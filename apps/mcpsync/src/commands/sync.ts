import { readCanonical } from "../core/canonical.js";
import { diffHost, STATUS_GLYPH } from "../core/diff.js";
import { selectServers } from "./apply.js";
import { ensureConfirmed, resolveTargets, writeToHosts } from "./write-hosts.js";

export interface SyncOpts {
  to?: string | undefined;
  config?: string | undefined;
  dryRun?: boolean | undefined;
  yes?: boolean | undefined;
}

/**
 * Reconcile canonical → hosts: print a per-host drift plan, then full-sync
 * (prune) each detected host (or one `--to`). This is the batch counterpart to
 * `apply` — it always covers the whole enabled canonical set and shows what will
 * change before writing.
 */
export async function runSync(opts: SyncOpts): Promise<void> {
  const canonical = readCanonical(opts.config);
  const servers = selectServers(canonical);
  if (!servers.length) {
    process.stderr.write("✗ no enabled servers in canonical config\n");
    process.exitCode = 1;
    return;
  }
  const targets = resolveTargets(opts.to);
  if (!targets.length) {
    process.stderr.write(`✗ no such host: ${opts.to}\n`);
    process.exitCode = 1;
    return;
  }

  // Drift plan.
  process.stdout.write("Plan (canonical → hosts):\n");
  let anyChange = false;
  for (const host of targets) {
    const diff = diffHost(host, canonical);
    const notable = diff.entries.filter((e) => e.status !== "ok" && e.status !== "off");
    if (notable.some((e) => e.status !== "extra")) anyChange = true;
    const summary = notable.length
      ? notable.map((e) => `${e.name}:${STATUS_GLYPH[e.status]}`).join("  ")
      : "in sync";
    process.stdout.write(`  ${host.label.padEnd(16)} ${summary}\n`);
  }
  if (!anyChange) {
    process.stdout.write("\nAll detected hosts already in sync.\n");
    if (!opts.dryRun) return;
  }

  const dryRun = opts.dryRun ?? false;
  const proceed = await ensureConfirmed({
    dryRun,
    yes: opts.yes ?? false,
    summary: `Sync ${servers.length} server(s) to ${targets.map((t) => t.label).join(", ")}?`,
  });
  if (!proceed) return;

  writeToHosts(targets, servers, { dryRun, prune: true });
}
