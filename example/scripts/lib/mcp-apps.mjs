/**
 * lib/mcp-apps.mjs — which workspaces are MCP apps.
 *
 * WHY THIS EXISTS: `pnpm --filter <pattern>` that matches nothing prints "No
 * projects matched the filters" and EXITS 0, so a CI step whose filter matches
 * nothing passes green. `--fail-if-no-match` is accepted and ignored on pnpm
 * 10.29.3 — an unknown flag that changes nothing looks exactly like a flag that
 * worked (measured, DEFERRED #52). Gates that selected apps by the name shape
 * `<scope>/*-mcp` were therefore vacuous for any app without that suffix, and
 * silent about it.
 *
 * The fix is not another checker that reads the workflow YAML back and confirms
 * coverage — that is a third list to keep in sync. It is to DERIVE the gated
 * set: `for-each-mcp-app.mjs` runs a script for exactly the apps reported here,
 * so an app cannot be added without being gated.
 *
 * SCOPE is keyed on an AFFIRMATIVE fact — the workspace's package.json declares
 * `@george43g/mcp-kit` in dependencies ∪ devDependencies ∪ peerDependencies,
 * which is what makes it an MCP app — never on a name shape and never on a
 * hand-list of directory names. Same marker, for the same reason, as
 * check-stdout-purity.mjs. CLI meta-tools (the scaffolder) are not MCP apps and
 * are named explicitly at their call sites.
 *
 * ZERO MCP APPS IS A LEGITIMATE ANSWER, NOT A FAILURE. These monorepos hold all
 * kinds of apps, and many hold no MCP server at all. Because selection is an
 * affirmative dependency fact rather than a name filter, an empty set can only
 * mean "no workspace depends on mcp-kit" — which is true of such a repo, so the
 * MCP gates skip with a one-line notice naming the marker (`selectMcpApps`).
 * The vacuous pass DEFERRED #52 guarded against came from a NAME filter that
 * could miss an app that existed; that filter no longer exists, so there is no
 * app an empty set could be hiding. What stays a failure is the one way a real
 * MCP app can still drop out: a marked workspace with no package name.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const MCP_MARKER = "@george43g/mcp-kit";

/** Repo root, from scripts/lib/. */
export const REPO_ROOT = resolve(import.meta.dirname, "../..");

/**
 * Every `apps/*` workspace whose manifest declares the marker.
 *
 * Returns `{ apps, unnamed }` — `apps` entries are `{ dir, name }`, where
 * `name` is what `pnpm --filter` addresses; `unnamed` holds marked workspaces
 * with no package name, which the caller must treat as a failure rather than
 * skip (see selectMcpApps).
 */
export function mcpApps(root = REPO_ROOT) {
  const apps = [];
  const unnamed = [];
  let kids = [];
  try {
    kids = readdirSync(join(root, "apps"), { withFileTypes: true });
  } catch {
    return { apps, unnamed };
  }
  for (const kid of kids) {
    if (!kid.isDirectory()) continue;
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(join(root, "apps", kid.name, "package.json"), "utf8"));
    } catch {
      // No manifest (or unparseable) — not an app workspace.
      continue;
    }
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    if (!(MCP_MARKER in deps)) continue;
    // A nameless workspace cannot be addressed by `pnpm --filter`, so it would
    // drop out of every gate — the exact failure mode this module prevents.
    if (typeof pkg.name !== "string" || pkg.name.length === 0) {
      unnamed.push(`apps/${kid.name}`);
      continue;
    }
    apps.push({ dir: `apps/${kid.name}`, name: pkg.name });
  }
  apps.sort((a, b) => a.name.localeCompare(b.name));
  return { apps, unnamed };
}

/** One-line notice for the empty set; names the marker so a reader can check it. */
export function noMcpAppsNotice(who) {
  return `${who}: no apps/* workspace declares ${MCP_MARKER} — nothing to run, skipping.`;
}

/**
 * The marked apps (possibly none), or a hard failure — naming `who` asked — if a
 * marked workspace has no package name. The caller decides what an empty list
 * means for it; for every current caller that is "skip, with noMcpAppsNotice".
 */
export function selectMcpApps(who, root = REPO_ROOT) {
  const { apps, unnamed } = mcpApps(root);
  if (unnamed.length > 0) {
    console.error(`${who}: FAILED — MCP app workspace(s) with no package name:`);
    for (const dir of unnamed) console.error(`  • ${dir}`);
    console.error("  `pnpm --filter` addresses a package by name, so an unnamed workspace");
    console.error("  silently drops out of every gate. Give it a scoped `name`.");
    process.exit(1);
  }
  return apps;
}
