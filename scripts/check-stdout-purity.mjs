#!/usr/bin/env node
/**
 * check-stdout-purity.mjs — no `console.*` call in any MCP app's `src/`.
 *
 * THE INVARIANT THIS MAKES REAL: "never write to stdout after
 * `StdioServerTransport.connect()` — JSON-RPC owns stdout." The stamped agent
 * guide asserted "CI grep enforces this" for months while no such grep existed
 * anywhere — not here, not in any descendant repo. A 2026-09-02 fleet audit
 * found two descendants carrying the same false sentence, both with their #1
 * MCP invariant enforced by nothing. A claimed guard is worse than no guard:
 * it stops the next reader building the real one. This file is the real one.
 *
 * WHAT IT CHECKS, AND THE HONEST LIMIT: a static scan for `console.<method>(`
 * calls (comments stripped) in the `src/` of every MCP app. It cannot see a
 * dependency writing to stdout, or a bare `process.stdout.write` — the stress
 * harness exercises the live server over stdio for the runtime half. What it
 * DOES catch is the failure mode actually observed: an app-level debug
 * `console.log` landing in the JSON-RPC stream.
 *
 * SCOPE is keyed on an AFFIRMATIVE fact — the workspace's package.json
 * declares `@george43g/mcp-kit` as a dependency, which is what makes it an
 * MCP app — never on a hand-list of directory names. CLI meta-tools (the
 * scaffolder) print to stdout legitimately and are not selected.
 *
 * Remediation when it fires: diagnostics go through
 * `@george43g/robustness`'s logger (stderr + file, never stdout); CLI-facing
 * output goes through cli-kit's renderer, which only runs in CLI mode.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const MCP_MARKER = "@george43g/mcp-kit";
const CALL = /\bconsole\.[a-zA-Z]+\s*\(/;

/** Apps whose manifest declares mcp-kit — the affirmative "is an MCP app" fact. */
function mcpApps() {
  const apps = [];
  let kids = [];
  try {
    kids = readdirSync(join(ROOT, "apps"), { withFileTypes: true });
  } catch {
    return apps;
  }
  for (const kid of kids) {
    if (!kid.isDirectory()) continue;
    try {
      const pkg = JSON.parse(readFileSync(join(ROOT, "apps", kid.name, "package.json"), "utf8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
      if (MCP_MARKER in deps) apps.push(kid.name);
    } catch {
      // No manifest — not an app workspace.
    }
  }
  return apps;
}

function* walk(dir) {
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) yield full;
  }
}

/**
 * Blank out comments so prose ABOUT console.log (the invariant's own doc
 * comments say "never console.log") cannot trip the call matcher. Line-based
 * state machine, not a parser — string literals containing `//` could
 * over-strip, which for this matcher only risks a false PASS on the same line
 * as such a literal; accepted as far-fetched for a `console.` call site.
 */
function stripComments(text) {
  let out = "";
  let inBlock = false;
  for (const line of text.split("\n")) {
    let rest = line;
    let kept = "";
    while (rest.length > 0) {
      if (inBlock) {
        const end = rest.indexOf("*/");
        if (end === -1) {
          rest = "";
        } else {
          rest = rest.slice(end + 2);
          inBlock = false;
        }
        continue;
      }
      const lineC = rest.indexOf("//");
      const blockC = rest.indexOf("/*");
      if (blockC !== -1 && (lineC === -1 || blockC < lineC)) {
        kept += rest.slice(0, blockC);
        rest = rest.slice(blockC + 2);
        inBlock = true;
      } else if (lineC !== -1) {
        kept += rest.slice(0, lineC);
        rest = "";
      } else {
        kept += rest;
        rest = "";
      }
    }
    out += `${kept}\n`;
  }
  return out;
}

const apps = mcpApps();

// POSITIVE CONTROL. Zero MCP apps means the marker moved or the repo reshaped
// — not that everything is pure. "Nothing to check" must not read as a pass.
if (apps.length === 0) {
  console.error(`check-stdout-purity: FAILED — no apps/* workspace declares ${MCP_MARKER}.`);
  console.error("  Either the repo has no MCP app (then delete this check and the claim");
  console.error("  in AGENTS.md that cites it), or the marker/manifest shape changed —");
  console.error("  update MCP_MARKER in this script.");
  process.exit(1);
}

const violations = [];
let scanned = 0;

for (const app of apps) {
  let filesInApp = 0;
  for (const file of walk(join(ROOT, "apps", app, "src"))) {
    filesInApp++;
    scanned++;
    const clean = stripComments(readFileSync(file, "utf8"));
    const lines = clean.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (CALL.test(lines[i])) {
        violations.push(`${file.slice(ROOT.length)}:${i + 1}`);
      }
    }
  }
  // Per-app positive control: an MCP app with no source files is a broken
  // walk (or a hollow app), and either way not evidence of purity.
  if (filesInApp === 0) {
    violations.push(`apps/${app}/src: contains no source files — nothing was actually checked.`);
  }
}

if (violations.length > 0) {
  console.error("✗ stdout-purity check failed:\n");
  for (const v of violations) console.error(`  • ${v}`);
  console.error("");
  console.error("  A console.* call in an MCP app's src/ can write into the JSON-RPC");
  console.error("  stream once the stdio transport is connected. Diagnostics go through");
  console.error("  @george43g/robustness's logger (stderr + file); CLI-facing output goes");
  console.error("  through cli-kit's renderer, which only runs in CLI mode.");
  process.exit(1);
}

console.log(
  `stdout-purity check passed (${scanned} source files across ${apps.length} MCP app(s): ${apps.join(", ")}).`,
);
