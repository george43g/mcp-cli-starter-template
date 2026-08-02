import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { isInteractive } from "@george43g/cli-kit";
import { detectedHosts, HOSTS, projectHosts } from "../core/hosts/index.js";
import type { HostAdapter } from "../core/hosts/types.js";
import type { McpServer, Scope } from "../core/schema.js";

/**
 * Resolve a `--to` value to target hosts. User scope: a host id, or "all"/unset
 * → all detected hosts. Project scope: the per-repo host set (cursor/warp) bound
 * to `cwd`, filtered by `--to`; a non-project host id resolves to none (the
 * command reports the scope-aware reason).
 */
export function resolveTargets(
  to: string | undefined,
  scope: Scope = "user",
  cwd?: string,
): HostAdapter[] {
  if (scope === "project") {
    const pool = projectHosts(cwd);
    return !to || to === "all" ? pool : pool.filter((h) => h.id === to);
  }
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
 * Gate a mutating operation. Returns true to proceed. Dry-run and `--yes`
 * proceed silently; an interactive TTY prompts y/N; a non-TTY without `--yes`
 * refuses (prints the reason, sets exit code 1) and returns false. `refusal`
 * overrides the default (host-config) wording for other mutating commands.
 */
export async function ensureConfirmed(opts: {
  dryRun: boolean;
  yes: boolean;
  summary: string;
  refusal?: string;
}): Promise<boolean> {
  if (opts.dryRun || opts.yes) return true;
  if (!isInteractive()) {
    process.stderr.write(
      `${opts.refusal ?? "✗ refusing to mutate host configs without a TTY. Pass --yes to confirm or --dry-run to preview."}\n`,
    );
    process.exitCode = 1;
    return false;
  }
  if (await confirm(opts.summary)) return true;
  process.stdout.write("Aborted.\n");
  return false;
}

/** Write `servers` to each target host and print a per-host result summary. */
export function writeToHosts(
  targets: HostAdapter[],
  servers: McpServer[],
  opts: { dryRun: boolean; prune: boolean },
): void {
  const home = homedir();
  const restarts = new Set<string>();
  for (const host of targets) {
    process.stdout.write(`\n▸ ${host.label}${opts.dryRun ? " (dry-run)" : ""}\n`);
    const result = host.write(servers, { dryRun: opts.dryRun, prune: opts.prune });

    if (result.commands) {
      if (result.commands.length) {
        for (const cmd of result.commands) {
          process.stdout.write(`  ${opts.dryRun ? "would run" : "ran"}: ${cmd}\n`);
        }
      } else {
        process.stdout.write("  already in sync\n");
      }
    } else {
      const verb = opts.dryRun ? "would write" : result.changed ? "wrote" : "unchanged";
      const link = result.linkTarget
        ? `  (via symlink → ${result.linkTarget.replace(home, "~")})`
        : "";
      const bak = result.backup ? `  (backup: ${result.backup.replace(home, "~")})` : "";
      process.stdout.write(
        `  ${verb} ${servers.length} server(s) → ${host.configPath.replace(home, "~")}${link}${bak}\n`,
      );
    }
    if (result.skipped?.length) {
      process.stdout.write(
        `  skipped (defined outside managed block): ${result.skipped.join(", ")}\n`,
      );
    }
    if (host.restart && !host.restart.startsWith("Applies")) {
      restarts.add(`${host.label}: ${host.restart}`);
    }
  }
  if (restarts.size && !opts.dryRun) {
    process.stdout.write(`\nTo take effect:\n${[...restarts].map((r) => `  • ${r}`).join("\n")}\n`);
  }
}
