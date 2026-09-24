/**
 * The one Biome version the scaffolder writes, and the schema URL that goes
 * with it.
 *
 * Biome warns "schema version does not match" on every run when biome.json's
 * `$schema` names a different version from the CLI that reads it. Generated
 * repos pinned the schema at 2.5.5 but depended on `^2.5.5`, so a fresh install
 * resolved a newer CLI and every lint printed two warnings. The fix is Biome's
 * own advice: pin the CLI exactly (`--save-exact`), and stamp the schema from
 * the same constant. `tests/biome-version.test.ts` holds this constant, this
 * repo's root devDependency and both of its biome.json files in step, so a
 * Biome bump that forgets one fails a test rather than a consumer's lint.
 *
 * To bump: change BIOME_VERSION, set the root devDependency to the same exact
 * version, `pnpm install`, then `pnpm exec biome migrate --write`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const BIOME_VERSION = "2.5.14";

export function biomeSchemaUrl(version: string): string {
  return `https://biomejs.dev/schemas/${version}/schema.json`;
}

/**
 * The Biome version biome.json should name for `cwd`: the CLI already
 * installed there when there is one (an existing repo keeps its own Biome),
 * else the version this scaffolder pins.
 */
export function biomeVersionFor(cwd: string): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(cwd, "node_modules", "@biomejs", "biome", "package.json"), "utf8"),
    );
    if (typeof pkg.version === "string" && /^\d+\.\d+\.\d+/.test(pkg.version)) return pkg.version;
  } catch {
    // not installed — fall through to the pin
  }
  return BIOME_VERSION;
}
