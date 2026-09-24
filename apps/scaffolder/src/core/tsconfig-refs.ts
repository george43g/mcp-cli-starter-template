/**
 * tsconfig-refs — TypeScript project references in what the scaffolder writes.
 *
 * The canonical repo is one `tsc -b` solution: the root tsconfig.json lists
 * every package, every package's tsconfig.test.json and every app, and each
 * app references the workspace packages it imports. That is what lets "find
 * references" cross from a package into the apps and tests, and what makes
 * `pnpm typecheck` compile test files at all.
 *
 * A generated repo gets the same shape with two differences, handled here:
 *
 *   - The canonical app references all six workspace packages, but a generated
 *     repo takes the published ones from npm, so those directories do not
 *     exist there. `withoutPublishedReferences()` drops them at write time —
 *     the same moment `applyPublishedRanges()` swaps their `workspace:*`
 *     ranges, and for the same reason.
 *   - The root solution starts empty and each porting migration registers its
 *     own projects (`addRootReferences()`), so `add` appends a second app to
 *     the solution instead of leaving it outside `tsc -b`.
 *
 * Both rewrite the `"references"` array textually rather than re-serialising
 * the whole file, so every other byte keeps the template's formatting, and
 * render it the way Biome formats it (one line when it fits in 100 columns,
 * else one reference per line) so the generated repo's own lint stays green.
 */

import { PUBLISHED_PACKAGES } from "../generated/published-versions.js";

interface Reference {
  path: string;
}

const REFERENCES = /^([ \t]*)"references":\s*\[([^\]]*)\]/m;
const LINE_WIDTH = 100;

function parseReferences(inner: string): Reference[] | undefined {
  try {
    const parsed: unknown = JSON.parse(`[${inner}]`);
    if (!Array.isArray(parsed)) return undefined;
    const refs: Reference[] = [];
    for (const item of parsed) {
      if (typeof item !== "object" || item === null) return undefined;
      const path = (item as { path?: unknown }).path;
      if (typeof path !== "string") return undefined;
      refs.push({ path });
    }
    return refs;
  } catch {
    return undefined;
  }
}

function renderReferences(indent: string, refs: readonly Reference[]): string {
  const items = refs.map((r) => `{ "path": ${JSON.stringify(r.path)} }`);
  const oneLine = `${indent}"references": [${items.join(", ")}]`;
  if (refs.length === 0 || oneLine.length <= LINE_WIDTH) return oneLine;
  const inner = items.map((item) => `${indent}  ${item}`).join(",\n");
  return `${indent}"references": [\n${inner}\n${indent}]`;
}

function rewriteReferences(
  content: string,
  edit: (refs: Reference[]) => Reference[],
): string | undefined {
  const match = REFERENCES.exec(content);
  if (!match) return undefined;
  const [whole, indent = "", inner = ""] = match;
  const refs = parseReferences(inner);
  if (!refs) return undefined;
  const next = edit(refs);
  const rendered = renderReferences(indent, next);
  return content.slice(0, match.index) + rendered + content.slice(match.index + whole.length);
}

/** True when a reference points into `packages/<dir>` for a package taken from npm. */
function isPublishedPackageRef(refPath: string): boolean {
  return PUBLISHED_PACKAGES.some((p) =>
    new RegExp(`(^|/)packages/${p.dir}(/|$)`).test(refPath.replace(/\\/g, "/")),
  );
}

/**
 * Drop references to packages a generated repo installs from the registry.
 * Content without a parseable `"references"` array is returned unchanged.
 */
export function withoutPublishedReferences(content: string): string {
  return (
    rewriteReferences(content, (refs) => refs.filter((r) => !isPublishedPackageRef(r.path))) ??
    content
  );
}

/** A file the port writes is a tsconfig when its basename is `tsconfig*.json`. */
export function isTsconfigPath(relPath: string): boolean {
  return /(^|\/)tsconfig[^/]*\.json$/.test(relPath);
}

/**
 * Append `paths` to a root solution tsconfig's references, skipping any
 * already present. Returns `undefined` when the file is not solution-shaped
 * (`"files": []` plus a `"references"` array) — a retrofit target's root
 * tsconfig may be a real project, and turning it into a solution is not this
 * helper's call.
 */
export function addRootReferences(content: string, paths: readonly string[]): string | undefined {
  if (!/"files":\s*\[\s*\]/.test(content)) return undefined;
  const norm = (p: string) => p.replace(/^\.\//, "").replace(/\/tsconfig\.json$/, "");
  return rewriteReferences(content, (refs) => {
    const have = new Set(refs.map((r) => norm(r.path)));
    const added = paths.filter((p) => !have.has(norm(p))).map((path) => ({ path }));
    return [...refs, ...added];
  });
}
