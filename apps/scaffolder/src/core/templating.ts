/**
 * Templating — placeholder substitution + package.json edits.
 *
 * Convention from plan §4 step 2:
 *   Templates ship in each migration's `lib/` subfolder. Placeholders use
 *   `example-repo` and `EXAMPLE_REPO` markers — same convention as the legacy
 *   `scripts/init-template.mjs` sed-based renamer (still shipped as a
 *   no-build clone-and-run alternative).
 *
 * For structured edits (package.json, tsconfig.json), prefer the canonical
 * CLI (`pnpm pkg set ...`) over JSON-stringify round-trips that lose
 * comments and formatting.
 */

import { PUBLIC_SCOPE, PUBLISHED_NAMES } from "./runtime-source.js";

export interface TemplateVars {
  /**
   * kebab-case app name, taken verbatim (e.g. "wm-stack" or "wm-stack-mcp").
   * Both placeholders below land as exactly this string.
   */
  name: string;
  /** ENV_VAR_STYLE_NAME (e.g. "WM_STACK_MCP"). */
  nameUpper: string;
  /** Npm scope with leading @, or empty string for unscoped. */
  scope?: string;
}

// Placeholder syntax: filesystem-safe literal strings instead of curly-
// brace handlebars markers. The old `{{name}}` form collided with shell
// brace-expansion, tera template engines (mise), and usage(1) identifier
// generation (which stripped `{` to produce broken `_name()` functions).
//
// APP_NAME_RE is the app's full name. The canonical app is called
// `example-repo-mcp`, and before this placeholder existed the `-mcp` after
// `example-repo` was literal template text, so every generated app was forced
// to `<name>-mcp` and a name already ending in `-mcp` had to be banned. It runs
// BEFORE NAME_RE, which would otherwise eat its prefix and leave the suffix.
// `-mcp` NOT preceded by the placeholder (stress-mcp.ts, mcp-dev-proxy.ts,
// mcp-kit) is about MCP itself and stays literal.
const APP_NAME_RE = /example-repo-mcp/g;
const NAME_RE = /example-repo/g;
const NAME_SNAKE_RE = /example_repo/g;
const NAME_UPPER_KEBAB_RE = /EXAMPLE-REPO/g;
const NAME_ROFF_RE = /example\\-repo/g;
const UPPER_RE = /EXAMPLE_REPO/g;
const SCOPE_RE = /@george43g/g;

export function nameUpperOf(name: string): string {
  return name.toUpperCase().replace(/-/g, "_");
}

export function nameSnakeOf(name: string): string {
  return name.replace(/-/g, "_");
}

export function nameRoffOf(name: string): string {
  return name.replace(/-/g, "\\-");
}

export function substitute(content: string, vars: TemplateVars): string {
  // Order matters: UPPER_RE must run before NAME_RE would never match (the
  // two patterns are case-sensitive and have no overlap — `EXAMPLE_REPO`
  // never contains `example-repo`), but explicit ordering keeps the
  // intent obvious to future readers.
  //
  // Published package names are shielded from scope rewriting by a sentinel
  // pass. A repo scaffolded under `@acme` still depends on
  // `@george43g/robustness`, because that is the package that exists on npm —
  // rewriting the scope would produce `@acme/robustness`, which resolves to
  // nothing. Every published name needs this, not just the runtime: the same
  // bug would hit cli-kit, tui-kit and secret-store.
  const sentinelFor = (index: number) => `__MCP_SCAFFOLD_PUBLISHED_${index}__`;
  let out = content;
  PUBLISHED_NAMES.forEach((name, i) => {
    out = out.replaceAll(name, sentinelFor(i));
  });
  out = out.replace(UPPER_RE, vars.nameUpper);
  out = out.replace(NAME_UPPER_KEBAB_RE, vars.name.toUpperCase());
  out = out.replace(NAME_SNAKE_RE, nameSnakeOf(vars.name));
  out = out.replace(NAME_ROFF_RE, nameRoffOf(vars.name));
  out = out.replace(APP_NAME_RE, vars.name);
  out = out.replace(NAME_RE, vars.name);
  if (vars.scope && vars.scope !== PUBLIC_SCOPE) {
    out = out.replace(SCOPE_RE, vars.scope);
  }
  PUBLISHED_NAMES.forEach((name, i) => {
    out = out.replaceAll(sentinelFor(i), name);
  });
  return out;
}

/**
 * Conditional blocks for templates that describe the generated tree, so a doc
 * can say only what was actually generated:
 *
 *     <!-- if:rust-accel -->
 *     ...kept when flags["rust-accel"] is true...
 *     <!-- endif:rust-accel -->
 *
 * `if:!flag` inverts. Marker lines are always removed. Only the cloned-tool
 * templates exempt from the golden byte-equality check carry markers, since a
 * canonical file cannot. An unknown flag throws: a typo would otherwise drop
 * the block silently in every generated repo.
 */
const BLOCK_RE = /^[ \t]*<!-- (if|endif):(!?)([a-z][a-z0-9-]*) -->[ \t]*$/;

export function renderFeatureBlocks(
  content: string,
  flags: Readonly<Record<string, boolean>>,
): string {
  if (!content.includes("<!-- if:")) return content;
  const out: string[] = [];
  const stack: Array<{ flag: string; keep: boolean }> = [];
  for (const line of content.split("\n")) {
    const m = line.match(BLOCK_RE);
    if (!m) {
      if (stack.every((s) => s.keep)) out.push(line);
      continue;
    }
    const [, kind, negate, flag = ""] = m;
    if (!(flag in flags)) {
      throw new Error(`Unknown template flag "${flag}"; known: ${Object.keys(flags).join(", ")}`);
    }
    if (kind === "if") {
      stack.push({ flag: `${negate}${flag}`, keep: negate ? !flags[flag] : flags[flag] === true });
    } else if (stack.pop()?.flag !== `${negate}${flag}`) {
      throw new Error(`Unbalanced template block: endif:${negate}${flag}`);
    }
  }
  if (stack.length > 0) throw new Error(`Unclosed template block: if:${stack.at(-1)?.flag}`);
  return out.join("\n");
}
