import { join } from "node:path";
import { readCanonical } from "../core/canonical.js";
import { PROJECT_HOST_IDS } from "../core/hosts/index.js";
import type { McpServer, Scope } from "../core/schema.js";
import { ensureConfirmed, resolveTargets, writeToHosts } from "./write-hosts.js";

export interface ApplyOpts {
  to?: string | undefined;
  only?: string[] | undefined;
  config?: string | undefined;
  dryRun?: boolean | undefined;
  yes?: boolean | undefined;
  scope?: Scope | undefined;
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
  const scope: Scope = opts.scope ?? "user";
  const cwd = process.cwd();
  // Project scope reads the repo-local manifest (unless -c overrides it).
  const canonicalPath = opts.config ?? (scope === "project" ? join(cwd, ".mcp.json") : undefined);
  const canonical = readCanonical(canonicalPath);
  const servers = selectServers(canonical, opts.only);
  if (!servers.length) {
    const where = scope === "project" ? `${canonicalPath}` : "canonical config";
    process.stderr.write(`✗ no matching servers in ${where}\n`);
    process.exitCode = 1;
    return;
  }
  const targets = resolveTargets(opts.to, scope, cwd);
  if (!targets.length) {
    const hint =
      scope === "project"
        ? `project scope supports ${PROJECT_HOST_IDS.join(", ")} — Claude Code/Desktop/codex have no per-project MCP config`
        : `no such host: ${opts.to}`;
    process.stderr.write(`✗ ${hint}\n`);
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
