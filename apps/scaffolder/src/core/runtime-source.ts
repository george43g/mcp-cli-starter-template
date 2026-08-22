/**
 * runtime-source — which shared packages a generated repo consumes from npm.
 *
 * Generated repos do NOT vendor the published packages. They depend on them by
 * version range, and the ranges come from `published-versions.ts`, which is
 * generated at build time from the real `packages/&#42;/package.json` manifests.
 *
 * There is deliberately no "generate the source instead" mode. Maintaining a
 * byte-identical copy of every published package inside the scaffolder was the
 * single largest source of golden-drift CI failures, and it bought nothing once
 * the packages were actually on npm.
 *
 * Not everything is de-vendored. `tsconfig`, `vitest-config` and `biome-config`
 * are per-monorepo shared config that is deliberately never published, so a
 * generated repo needs its own copies rather than a dependency. `shared-types`
 * is still shipped as source because it is unpublished, and because it is meant
 * to be edited alongside the consuming repo's Rust structs — so it may never be
 * a sensible dependency.
 */

import { PUBLISHED_PACKAGES } from "../generated/published-versions.js";

/**
 * Public npm name → caret range, for every package a generated repo takes from
 * the registry.
 *
 * Hand-written ranges are how this went wrong before: `^0.1.0` sat here while
 * robustness shipped 0.2.1, and a caret on a 0.x pins the MINOR — so a repo
 * scaffolded in registry mode would have installed 0.1.x and silently missed
 * every fix in 0.2.x, including the shutdown/watchdog singleton bugs.
 */
export const PUBLISHED_RANGES: ReadonlyMap<string, string> = new Map(
  PUBLISHED_PACKAGES.map((p) => [p.name, p.range]),
);

/** Public npm names of the packages generated repos consume from the registry. */
export const PUBLISHED_NAMES: readonly string[] = PUBLISHED_PACKAGES.map((p) => p.name);

/** The scope the packages are actually published under, regardless of the target's own scope. */
export const PUBLIC_SCOPE = "@george43g";

/**
 * Rewrite `"<published>": "workspace:*"` to the real registry range.
 *
 * Runs after placeholder substitution, which is why `substitute()` shields the
 * published names from scope rewriting: a repo scaffolded under `@acme` still
 * depends on `@george43g/robustness`, because that is the package that exists.
 */
/**
 * Caret range for one published package, for migrations that build a
 * package.json string directly rather than porting a template.
 */
export function rangeFor(name: string): string {
  const range = PUBLISHED_RANGES.get(name);
  if (range === undefined) {
    throw new Error(
      `rangeFor("${name}"): not a published package. Known: ${PUBLISHED_NAMES.join(", ")}. ` +
        "Published packages are derived from packages/*/package.json at build time — " +
        "re-run `pnpm build:templates` if one was just added.",
    );
  }
  return range;
}

export function applyPublishedRanges(content: string): string {
  let out = content;
  for (const [name, range] of PUBLISHED_RANGES) {
    out = out.replaceAll(`"${name}": "workspace:*"`, `"${name}": "${range}"`);
  }
  return out;
}
