import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { isInteractive } from "@george43g/cli-kit";
import { readCanonical } from "../core/canonical.js";
import { detectedHosts, HOSTS } from "../core/hosts/index.js";
import type { HostAdapter } from "../core/hosts/types.js";
import type { McpServer } from "../core/schema.js";

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

function resolveTargets(to: string | undefined): HostAdapter[] {
  if (!to || to === "all") return detectedHosts();
  const host = HOSTS[to];
  return host ? [host] : [];
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

/**
 * Push canonical servers to one host or all detected hosts.
 *
 * A full apply (no `--only`) prunes: for a marker host, servers previously
 * managed but now absent are removed. An `--only` apply merges (never deletes).
 * Non-dry-run without a TTY refuses unless `--yes` is passed.
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
  const home = homedir();

  if (!dryRun && !opts.yes) {
    if (!isInteractive()) {
      process.stderr.write(
        "✗ refusing to mutate host configs without a TTY. Pass --yes to confirm or --dry-run to preview.\n",
      );
      process.exitCode = 1;
      return;
    }
    const ok = await confirm(
      `Apply ${servers.length} server(s) to ${targets.map((t) => t.label).join(", ")}?`,
    );
    if (!ok) {
      process.stdout.write("Aborted.\n");
      return;
    }
  }

  const restarts = new Set<string>();
  for (const host of targets) {
    process.stdout.write(`\n▸ ${host.label}${dryRun ? " (dry-run)" : ""}\n`);
    const result = host.write(servers, { dryRun, prune });
    const verb = dryRun ? "would write" : result.changed ? "wrote" : "unchanged";
    const link = result.linkTarget
      ? `  (via symlink → ${result.linkTarget.replace(home, "~")})`
      : "";
    const bak = result.backup ? `  (backup: ${result.backup.replace(home, "~")})` : "";
    process.stdout.write(
      `  ${verb} ${servers.length} server(s) → ${host.configPath.replace(home, "~")}${link}${bak}\n`,
    );
    if (host.restart && !host.restart.startsWith("Applies")) {
      restarts.add(`${host.label}: ${host.restart}`);
    }
  }
  if (restarts.size && !dryRun) {
    process.stdout.write(`\nTo take effect:\n${[...restarts].map((r) => `  • ${r}`).join("\n")}\n`);
  }
}
