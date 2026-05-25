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

export interface TemplateVars {
  /** kebab-case name (e.g. "wm-stack-mcp"). */
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
const NAME_RE = /example-repo/g;
const UPPER_RE = /EXAMPLE_REPO/g;
const SCOPE_RE = /@george43g/g;

export function nameUpperOf(name: string): string {
  return name.toUpperCase().replace(/-/g, "_");
}

export function substitute(content: string, vars: TemplateVars): string {
  // Order matters: UPPER_RE must run before NAME_RE would never match (the
  // two patterns are case-sensitive and have no overlap — `EXAMPLE_REPO`
  // never contains `example-repo`), but explicit ordering keeps the
  // intent obvious to future readers.
  let out = content.replace(UPPER_RE, vars.nameUpper);
  out = out.replace(NAME_RE, vars.name);
  if (vars.scope && vars.scope !== "@george43g") {
    out = out.replace(SCOPE_RE, vars.scope);
  }
  return out;
}
