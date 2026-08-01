import { readCanonical } from "../core/canonical.js";
import type { McpServer } from "../core/schema.js";
import { ensureConfirmed, resolveTargets, writeToHosts } from "./write-hosts.js";

export interface ApplyOpts {
  to?: string | undefined;
  only?: string[] | undefined;
  config?: string | undefined;
  dryRun?: boolean | undefined;
  yes?: boolean | undefined;
}

/**
 * Select which canonical servers a run targets: an `--only` allowlist (when
 * given) intersected with the always-applied filter that drops disabled servers.
 * Pure — unit-tested directly.
 */
export function selectServers(
  canonical: Record<string, McpServer>,
  only?: string[] | undefined,
): McpServer[] {
  const allow = only?.length ? new Set(only) : null;
  return Object.values(canonical)
    .filter((s) => !allow || allow.has(s.name))
    .filter((s) => s.enabled !== false);
}

/**
 * Push canonical servers to one host or all detected hosts.
 *
 * A full apply (no `--only`) prunes: previously-managed servers now absent are
 * removed. An `--only` apply merges (never deletes). Non-dry-run without a TTY
 * refuses unless `--yes` is passed.
 */
export async function runApply(opts: ApplyOpts): Promise<void> {
  const canonical = readCanonical(opts.config);
  const servers = selectServers(canonical, opts.only);
  if (!servers.length) {
    process.stderr.write("✗ no matching servers in canonical config\n");
    process.exitCode = 1;
    return;
  }
  const targets = resolveTargets(opts.to);
  if (!targets.length) {
    process.stderr.write(`✗ no such host: ${opts.to}\n`);
    process.exitCode = 1;
    return;
  }

  const dryRun = opts.dryRun ?? false;
  const prune = !opts.only?.length;
  const proceed = await ensureConfirmed({
    dryRun,
    yes: opts.yes ?? false,
    summary: `Apply ${servers.length} server(s) to ${targets.map((t) => t.label).join(", ")}?`,
  });
  if (!proceed) return;

  writeToHosts(targets, servers, { dryRun, prune });
}
