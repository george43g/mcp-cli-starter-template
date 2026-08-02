import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { printAuto } from "@george43g/cli-kit";
import {
  defaultExtRoot,
  executeDeploy,
  findManifest,
  installedExtensions,
  matchTarget,
  planDeploy,
  resolveSource,
} from "../core/deploy.js";
import { ensureConfirmed } from "./write-hosts.js";

export interface DeployOpts {
  /** Positional source: a built extension dir or a `.mcpb`/`.dxt` archive. */
  source?: string | undefined;
  /** Alternative to the positional for passing an archive. */
  from?: string | undefined;
  /** Match the installed extension by dir id instead of by manifest name. */
  extId?: string | undefined;
  /** Also sync node_modules (slow; usually unnecessary). */
  full?: boolean | undefined;
  /** List installed extensions and exit (read-only). */
  list?: boolean | undefined;
  dryRun?: boolean | undefined;
  yes?: boolean | undefined;
  json?: boolean | undefined;
  /** Extensions root override (tests inject a tmp dir; defaults to macOS path). */
  extRoot?: string | undefined;
}

/**
 * Deploy/redeploy a built MCP extension into Claude Desktop. `--list` is
 * read-only; a deploy is an rm+cp file replace, gated behind a preview +
 * confirmation (or `--yes`) with `--dry-run` for a no-write preview.
 */
export async function runDeploy(opts: DeployOpts = {}): Promise<void> {
  const home = homedir();
  const short = (p: string) => p.replace(home, "~");
  const extRoot = opts.extRoot ?? defaultExtRoot();

  if (!existsSync(extRoot)) {
    process.stderr.write(
      `✗ Claude Extensions dir not found: ${short(extRoot)}\n  Is Claude Desktop installed?\n`,
    );
    process.exitCode = 1;
    return;
  }

  const installed = installedExtensions(extRoot);

  if (opts.list) {
    printAuto(
      installed.map((e) => ({
        id: e.id,
        name: e.manifest.name,
        display: e.manifest.display_name ?? "-",
        version: e.manifest.version ?? "-",
      })),
      {
        head: ["Ext id", "Name", "Display", "Version"],
        rows: (r) => [r.id, r.name, r.display, r.version],
      },
      { json: opts.json ?? false },
    );
    return;
  }

  const raw = opts.source ?? opts.from;
  if (!raw) {
    process.stderr.write(
      "✗ provide a source (a built extension dir or a .mcpb/.dxt archive), or use --list.\n",
    );
    process.exitCode = 1;
    return;
  }

  let cleanup: (() => void) | null = null;
  try {
    const resolved = resolveSource(raw);
    cleanup = resolved.cleanup;

    const found = findManifest(resolved.dir);
    if (!found) {
      process.stderr.write(
        `✗ no manifest.json in source (${short(resolved.dir)}). Build first (pnpm build) or pass a .mcpb/.dxt.\n`,
      );
      process.exitCode = 1;
      return;
    }
    if (!existsSync(join(found.dir, "dist"))) {
      process.stderr.write(`✗ no dist/ in source (${short(found.dir)}). Run the build first.\n`);
      process.exitCode = 1;
      return;
    }

    const target = matchTarget(installed, { extId: opts.extId, name: found.manifest.name });
    if (!target) {
      const how = opts.extId ? `ext id "${opts.extId}"` : `manifest name "${found.manifest.name}"`;
      const list = installed.length
        ? installed.map((e) => `    ${e.id} (name=${e.manifest.name})`).join("\n")
        : "    (none installed)";
      process.stderr.write(
        `✗ no installed extension matches ${how}.\n` +
          `  Install it once via the GUI so the target dir exists, or pass --ext-id. Installed:\n${list}\n`,
      );
      process.exitCode = 1;
      return;
    }

    const plan = planDeploy(found.dir, target.dir, { full: opts.full });
    if (!plan.length) {
      process.stderr.write(`✗ nothing to sync from source (${short(found.dir)}).\n`);
      process.exitCode = 1;
      return;
    }

    const dryRun = opts.dryRun ?? false;
    const label = target.manifest.display_name ?? found.manifest.name;
    process.stdout.write(
      `→ source : ${short(found.dir)}  (name=${found.manifest.name}` +
        `${found.manifest.version ? ` v${found.manifest.version}` : ""})\n`,
    );
    process.stdout.write(`→ target : ${short(target.dir)}${dryRun ? "  (dry-run)" : ""}\n`);
    for (const p of plan) {
      process.stdout.write(`  ${dryRun ? "would replace" : "replace"} ${p.item}\n`);
    }

    const ok = await ensureConfirmed({
      dryRun,
      yes: opts.yes ?? false,
      summary: `Deploy "${label}" (${plan.length} item(s)) into ${target.id}?`,
      refusal:
        "✗ refusing to overwrite an installed extension without a TTY. Pass --yes to confirm or --dry-run to preview.",
    });
    if (!ok) return;

    if (dryRun) {
      process.stdout.write("\n(dry-run — no files changed)\n");
      return;
    }

    executeDeploy(plan);
    for (const p of plan) process.stdout.write(`  ✓ ${p.item}\n`);
    process.stdout.write(
      `\n✔ Deployed. Reload in Claude Desktop: Settings ▸ Extensions, toggle "${label}" ` +
        "off then on (or fully Quit + reopen).\n",
    );
  } finally {
    cleanup?.();
  }
}
