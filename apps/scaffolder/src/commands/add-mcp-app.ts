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

/**
 * Throw with an actionable message if `cwd` isn't an existing scaffolded
 * monorepo. The signals we look for: `pnpm-workspace.yaml`, an `apps/`
 * directory, and at least one `apps/*-mcp/` subdirectory.
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
  const apps = readdirSync(resolve(cwd, "apps"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.endsWith("-mcp"))
    .map((d) => d.name);
  if (apps.length === 0) {
    throw new Error(
      `Not a scaffolded repo: apps/ has no *-mcp/ subdirectory (cwd=${cwd}). ` +
        `Did you mean \`mcp-scaffold init\` instead?`,
    );
  }
}

/**
 * Read the first `apps/*-mcp/package.json` and parse the npm scope out of
 * its `name` field (e.g. `@acme/foo-mcp` → `@acme`). Throws if no existing
 * app exposes a parseable scoped name.
 */
export function detectScope(cwd: string): string {
  const apps = readdirSync(resolve(cwd, "apps"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.endsWith("-mcp"))
    .map((d) => d.name)
    .sort();
  for (const app of apps) {
    let raw: string;
    try {
      raw = readFileSync(resolve(cwd, "apps", app, "package.json"), "utf8");
    } catch {
      continue;
    }
    try {
      const pkg = JSON.parse(raw) as { name?: unknown };
      if (typeof pkg.name === "string") {
        const m = pkg.name.match(/^(@[^/]+)\//);
        if (m) return m[1] as string;
      }
    } catch {
      // ignore unparseable JSON; try the next app
    }
  }
  throw new Error(
    `Couldn't detect npm scope from any apps/*-mcp/package.json under ${cwd}. ` +
      `Pass --scope @your-scope explicitly.`,
  );
}

/**
 * Write the per-app files the 11-agent-files phase would have written for
 * the first app:
 *   1. .cursor/rules/<name>.mdc — Cursor rules pointer (substituted)
 *   2. .mcp.json — append a new <name>-mcp-dev entry under mcpServers.
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

  // 2. .mcp.json — append a new <name>-mcp-dev entry under mcpServers.
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
  const serverKey = `${name}-mcp-dev`;
  const servers: Record<string, unknown> = parsed.mcpServers ?? {};
  if (serverKey in servers) {
    notes.push(`.mcp.json already has a "${serverKey}" entry — left alone.`);
  } else {
    servers[serverKey] = {
      command: "pnpm",
      args: ["tsx", `apps/${name}-mcp/scripts/mcp-dev-proxy.ts`],
      env: {
        MCP_DEV: "1",
        MCP_DEV_CMD: `pnpm tsx apps/${name}-mcp/src/index.ts`,
        MCP_DEV_WATCH_DIR: `apps/${name}-mcp/src`,
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
