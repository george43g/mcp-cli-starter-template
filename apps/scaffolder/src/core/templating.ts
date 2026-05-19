/**
 * Templating — placeholder substitution + package.json edits.
 *
 * Convention from plan §4 step 2:
 *   Templates ship in each migration's `lib/` subfolder. Placeholders use
 *   `{{name}}` and `{{NAME_UPPER}}` markers — same convention as the legacy
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

const NAME_RE = /\{\{name\}\}/g;
const UPPER_RE = /\{\{NAME_UPPER\}\}/g;
const SCOPE_RE = /@george43g/g;

export function nameUpperOf(name: string): string {
  return name.toUpperCase().replace(/-/g, "_");
}

export function substitute(content: string, vars: TemplateVars): string {
  let out = content.replace(NAME_RE, vars.name);
  out = out.replace(UPPER_RE, vars.nameUpper);
  if (vars.scope && vars.scope !== "@george43g") {
    out = out.replace(SCOPE_RE, vars.scope);
  }
  return out;
}
