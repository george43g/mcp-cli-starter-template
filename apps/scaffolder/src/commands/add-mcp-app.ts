/**
 * add-mcp-app command — append a second MCP app to an already-scaffolded
 * monorepo. Reuses the 08-app phase migration via codegen-mode + writes the
 * per-app agent files (.cursor/rules/<name>.mdc, .mcp.json entry) that the
 * 11-agent-files phase would have emitted for the first app.
 *
 * Root-level files that hard-code the first app's name (root mise.toml's
 * pinned `screenshots` task, README sections) are intentionally NOT touched;
 * the user updates those by hand if their scripts need to cover multiple apps.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { FsHelper } from "../core/fs.js";
import { nameUpperOf, substitute } from "../core/templating.js";
import { TEMPLATES } from "../generated/templates.js";

/** The dependency that makes a workspace an MCP app — same marker as scripts/lib/mcp-apps.mjs. */
const MCP_MARKER = "@george43g/mcp-kit";

interface AppWorkspace {
  dir: string;
  name: string;
  marked: boolean;
}

/**
 * Every apps/* workspace with a package name, sorted MCP apps first then by
 * directory. A repo is recognised by what its apps ARE — they depend on
 * mcp-kit, or they carry a scoped package name the new app can share — never
 * by the shape of their names: app names are verbatim now, so `-mcp` is a
 * choice, not a signal.
 */
function appWorkspaces(cwd: string): AppWorkspace[] {
  let kids: import("node:fs").Dirent[];
  try {
    kids = readdirSync(resolve(cwd, "apps"), { withFileTypes: true });
  } catch {
    return [];
  }
  const found: AppWorkspace[] = [];
  for (const kid of kids) {
    if (!kid.isDirectory()) continue;
    let pkg: {
      name?: unknown;
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
      peerDependencies?: Record<string, unknown>;
    };
    try {
      pkg = JSON.parse(readFileSync(resolve(cwd, "apps", kid.name, "package.json"), "utf8"));
    } catch {
      continue; // no manifest, or unparseable — not an app workspace
    }
    if (typeof pkg.name !== "string" || pkg.name.length === 0) continue;
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    found.push({ dir: kid.name, name: pkg.name, marked: MCP_MARKER in deps });
  }
  return found.sort((a, b) =>
    a.marked === b.marked ? a.dir.localeCompare(b.dir) : a.marked ? -1 : 1,
  );
}

/**
 * Throw with an actionable message if `cwd` isn't an existing scaffolded
 * monorepo. The signals we look for: `pnpm-workspace.yaml`, an `apps/`
 * directory, and at least one apps/* workspace that depends on mcp-kit or has
 * a scoped package name.
 */
export function assertInsideScaffoldedRepo(cwd: string): void {
  const checks: Array<[string, string]> = [
    ["pnpm-workspace.yaml", "missing pnpm-workspace.yaml at repo root"],
    ["apps", "no apps/ directory at repo root"],
  ];
  for (const [rel, msg] of checks) {
    try {
      readdirSync(resolve(cwd, rel));
    } catch {
      // readdirSync on a file is OK (returns []); failure means missing.
      try {
        readFileSync(resolve(cwd, rel));
      } catch {
        throw new Error(`Not a scaffolded repo: ${msg} (cwd=${cwd}).`);
      }
    }
  }
  const apps = appWorkspaces(cwd).filter((a) => a.marked || a.name.startsWith("@"));
  if (apps.length === 0) {
    throw new Error(
      `Not a scaffolded repo: apps/ has no app workspace — none depends on ${MCP_MARKER} ` +
        `or has a scoped package name (cwd=${cwd}). Did you mean \`mcp-scaffold init\` instead?`,
    );
  }
}

/**
 * Parse the npm scope out of an existing app's package name (e.g.
 * `@acme/foo` → `@acme`), preferring MCP apps. Throws if no app has a
 * scoped name.
 */
export function detectScope(cwd: string): string {
  for (const app of appWorkspaces(cwd)) {
    const m = app.name.match(/^(@[^/]+)\//);
    if (m) return m[1] as string;
  }
  throw new Error(
    `Couldn't detect npm scope from any apps/*/package.json under ${cwd}. ` +
      `Pass --scope @your-scope explicitly.`,
  );
}

/** Matches the name-shaped app filter older generated ci.yml files used. */
const OLD_SUFFIX_FILTER = /--filter[= ]+["']?[^"'\s]*\*-mcp\b["']?/;

/**
 * Warning text when a suffix-less app is being added to a repo whose CI still
 * selects apps by `--filter "<scope>/*-mcp"` — the shape every repo generated
 * before the mcp-kit-marker gates carried. That filter does not match the new
 * app, and pnpm exits 0 on a filter that matches nothing, so its usage, pack
 * and stress steps would go green without ever running for it. Undefined when
 * there is nothing to warn about.
 */
export function staleCiFilterWarning(cwd: string, name: string, scope: string): string | undefined {
  if (name.endsWith("-mcp")) return undefined; // the old filter still selects it
  const rel = ".github/workflows/ci.yml";
  let ci: string;
  try {
    ci = readFileSync(resolve(cwd, rel), "utf8");
  } catch {
    return undefined;
  }
  if (!OLD_SUFFIX_FILTER.test(ci)) return undefined;
  const pkg = `${scope}/${name}`;
  return (
    `${rel} selects apps with a \`*-mcp\` name filter, which does not match ${pkg}: ` +
    `its CI steps will pass without running for the new app. Fix: add \`--filter ${pkg}\` ` +
    `next to each \`--filter "…/*-mcp"\` in ${rel} (pnpm unions repeated filters), or ` +
    `rename the app to end in -mcp.`
  );
}

/**
 * Write the per-app files the 11-agent-files phase would have written for
 * the first app:
 *   1. .cursor/rules/<name>.mdc — Cursor rules pointer (substituted)
 *   2. .mcp.json — append a new <name>-dev entry under mcpServers (the app's
 *      name verbatim, so `foo` → `foo-dev` and `foo-mcp` → `foo-mcp-dev`).
 *      Skip with a notice if .mcp.json is missing or malformed.
 *
 * Routes everything through the ctx FsHelper so writeIfChanged + dry-run +
 * force semantics behave the same way the rest of the scaffolder does.
 */
export async function writePerAppAgentFiles(args: {
  fs: FsHelper;
  cwd: string;
  name: string;
  scope: string;
  log: { info?: (m: string) => void; warn: (m: string) => void };
}): Promise<{ filesChanged: string[]; notes: string[] }> {
  const { fs, cwd, name, scope, log } = args;
  const filesChanged: string[] = [];
  const notes: string[] = [];
  const vars = { name, nameUpper: nameUpperOf(name), scope };

  // 1. .cursor/rules/<name>.mdc — lift the 11-agent-files lib template and
  //    substitute. The lib filename has "example-repo" in it; we land it at
  //    the new app's name.
  const ruleTemplateKey = "11-agent-files/lib/.cursor/rules/example-repo.mdc";
  const ruleTemplate = TEMPLATES[ruleTemplateKey];
  if (ruleTemplate === undefined) {
    log.warn(
      `Internal: no template found at ${ruleTemplateKey}; skipping .cursor/rules/${name}.mdc write.`,
    );
  } else {
    const ruleOut = `.cursor/rules/${name}.mdc`;
    const outcome = await fs.writeIfChanged(ruleOut, substitute(ruleTemplate, vars));
    if (outcome !== "unchanged") {
      filesChanged.push(ruleOut);
      notes.push(`wrote ${ruleOut}`);
    }
  }

  // 2. .mcp.json — append a new <name>-dev entry under mcpServers.
  const mcpJsonPath = resolve(cwd, ".mcp.json");
  let raw: string;
  try {
    raw = readFileSync(mcpJsonPath, "utf8");
  } catch {
    notes.push(".mcp.json missing — skipped dev-MCP entry. Add one by hand if you want one.");
    return { filesChanged, notes };
  }
  let parsed: { mcpServers?: Record<string, unknown> } & Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    log.warn(".mcp.json is not valid JSON; skipping dev-MCP entry append.");
    return { filesChanged, notes };
  }
  const serverKey = `${name}-dev`;
  const servers: Record<string, unknown> = parsed.mcpServers ?? {};
  if (serverKey in servers) {
    notes.push(`.mcp.json already has a "${serverKey}" entry — left alone.`);
  } else {
    servers[serverKey] = {
      command: "pnpm",
      args: ["tsx", `apps/${name}/scripts/mcp-dev-proxy.ts`],
      env: {
        MCP_DEV: "1",
        MCP_DEV_ENTRY: `apps/${name}/src/index.ts`,
        MCP_DEV_WATCH_DIR: `apps/${name}/src`,
      },
    };
    parsed.mcpServers = servers;
    const out = `${JSON.stringify(parsed, null, 2)}\n`;
    const outcome = await fs.writeIfChanged(".mcp.json", out);
    if (outcome !== "unchanged") {
      filesChanged.push(".mcp.json");
      notes.push(`added "${serverKey}" to .mcp.json mcpServers`);
    }
  }

  // Suppress unused-import warning when scope is not consumed by the rule
  // template (it's already substituted via SCOPE_RE in templating.ts).
  void scope;
  void join;

  return { filesChanged, notes };
}
