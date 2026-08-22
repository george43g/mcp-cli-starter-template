#!/usr/bin/env node

/**
 * build-templates.mjs — scan src/phases/<NN-name>/lib/** and emit
 * src/generated/templates.ts as { [relPath]: string }.
 *
 * Runs BEFORE vite build so the generated module is part of the import
 * graph. The output is gitignored — it's pure derived data.
 *
 * Why this exists: phase migrations need to write large source files into
 * the target repo (e.g. the entire robustness package). Inlining 3000 LOC
 * of string literals into a single migration .ts file would be unreadable.
 * Instead, the canonical source lives under `lib/` and this script bundles
 * it into a flat map at build time.
 *
 * The lib/*.ts files are NOT part of the TypeScript graph (tsconfig
 * excludes them) — they're raw template source. Read at codegen time, then
 * dropped into TEMPLATES as strings.
 */

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..");
const PHASES_DIR = resolve(APP_ROOT, "src/phases");
const OUT_FILE = resolve(APP_ROOT, "src/generated/templates.ts");
const REPO_ROOT = resolve(APP_ROOT, "../..");
const PACKAGES_DIR = resolve(REPO_ROOT, "packages");
const VERSIONS_OUT_FILE = resolve(APP_ROOT, "src/generated/published-versions.ts");

/**
 * Scan packages/&#42;/package.json and collect the ones actually published to npm.
 *
 * The test is `publishConfig.access === "public"`, which IS the definition of
 * publishable — scripts/check-publishable-manifests.mjs fails the build if any
 * package declares it without being registered there, so the two cannot drift.
 *
 * Generated repos depend on these by version range instead of vendoring their
 * source, so the range has to track the real published version. Deriving it
 * here rather than hand-writing it in runtime-source.ts is deliberate: the
 * hand-written `^0.1.0` sat there while robustness shipped 0.2.1, and a caret
 * on a 0.x pins the MINOR — so registry mode would have installed 0.1.x and
 * silently missed every fix in 0.2.x.
 */

/**
 * Publish-shaped, but NOT YET ON NPM — so generated repos must keep vendoring
 * the source instead of depending on a version that would 404 at install.
 *
 * This exists because the two facts arrive in the wrong order. A package needs
 * `publishConfig` in its manifest BEFORE the one-time manual bootstrap publish
 * can happen, and this file keys on `publishConfig` alone. Without the gate,
 * adding it flips `applyPublishedRanges()` into rewriting
 * `"<scope>/<pkg>": "workspace:*"` to a registry range in every generated
 * repo, while its phase still copies the source in — a repo that both vendors
 * the package AND declares a dependency on a version that does not exist. The
 * E2E smoke installs from the real registry, so it would fail on the 404.
 *
 * EMPTY IS THE STEADY STATE. `@george43g/mcp-kit` sat here between its manifest
 * gaining `publishConfig` and its bootstrap publish landing on npm (0.1.0,
 * 2026-08-22); it left in the same change that deleted phase 06 and stopped the
 * scaffolder vendoring it. The gate stays because `shared-types` is the next
 * candidate and the ordering trap recurs verbatim.
 *
 * ADD A NAME the moment a manifest gains `publishConfig`; REMOVE it the moment
 * that package's first version is on npm, in the same change that stops the
 * scaffolder vendoring it. The second half is a separate, deliberate decision
 * (a vendored copy is customisable by the generated repo; a dependency is not),
 * which is exactly why it is not bundled into the manifest change.
 */
const PENDING_BOOTSTRAP = new Set();

async function collectPublishedPackages() {
  let dirs;
  try {
    dirs = (await readdir(PACKAGES_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
  const out = [];
  for (const dir of dirs) {
    const manifestPath = join(PACKAGES_DIR, dir, "package.json");
    if (!existsSync(manifestPath)) continue;
    let pkg;
    try {
      pkg = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch {
      continue;
    }
    if (pkg?.publishConfig?.access !== "public") continue;
    if (typeof pkg.name !== "string" || typeof pkg.version !== "string") continue;
    if (PENDING_BOOTSTRAP.has(pkg.name)) continue;
    out.push({ dir, name: pkg.name, version: pkg.version });
  }
  return out;
}

async function walk(dir, files = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, files);
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function escapeBackticks(s) {
  return s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

async function main() {
  let phaseDirs;
  try {
    phaseDirs = (await readdir(PHASES_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && /^\d{2}-/.test(d.name))
      .map((d) => d.name)
      .sort();
  } catch {
    phaseDirs = [];
  }

  const entries = [];
  for (const phase of phaseDirs) {
    const libDir = join(PHASES_DIR, phase, "lib");
    if (!existsSync(libDir)) continue;
    const files = await walk(libDir);
    for (const f of files) {
      const rel = relative(PHASES_DIR, f); // e.g. "04-robustness/lib/env.ts"
      const content = await readFile(f, "utf8");
      entries.push({ key: rel, content });
    }
  }

  await mkdir(dirname(OUT_FILE), { recursive: true });

  const header = `/**
 * AUTO-GENERATED — do not edit by hand.
 *
 * Source: src/phases/<NN-name>/lib/**
 * Generator: apps/scaffolder/scripts/build-templates.mjs
 *
 * Re-run automatically as part of \`pnpm build\` (and \`pnpm dev\`).
 */

export const TEMPLATES: Record<string, string> = {
`;
  const body = entries
    .map((e) => `  ${JSON.stringify(e.key)}: \`${escapeBackticks(e.content)}\`,`)
    .join("\n");
  const footer = `
};

export function loadTemplate(key: string): string {
  const t = TEMPLATES[key];
  if (t === undefined) {
    throw new Error(\`Template "\${key}" not found. Did you forget to re-run build-templates.mjs?\`);
  }
  return t;
}
`;

  await writeFile(OUT_FILE, header + body + footer);
  process.stdout.write(
    `build-templates: wrote ${entries.length} entries → ${relative(APP_ROOT, OUT_FILE)}\n`,
  );

  const published = await collectPublishedPackages();
  const versionsHeader = `/**
 * AUTO-GENERATED — do not edit by hand.
 *
 * Source: packages/*&#47;package.json with \`publishConfig.access === "public"\`
 * Generator: apps/scaffolder/scripts/build-templates.mjs
 *
 * Generated repos depend on these from the registry rather than vendoring
 * their source, so these ranges must track the real published versions.
 */

export interface PublishedPackage {
  /** Directory under packages/, e.g. "robustness". */
  dir: string;
  /** Public npm name, e.g. "@george43g/robustness". */
  name: string;
  /** Version at build time, e.g. "0.2.1". */
  version: string;
  /** Caret range paired with that version, e.g. "^0.2.1". */
  range: string;
}

export const PUBLISHED_PACKAGES: readonly PublishedPackage[] = [
`;
  const versionsBody = published
    .map(
      (p) =>
        `  { dir: ${JSON.stringify(p.dir)}, name: ${JSON.stringify(p.name)}, ` +
        `version: ${JSON.stringify(p.version)}, range: ${JSON.stringify(`^${p.version}`)} },`,
    )
    .join("\n");
  const versionsFooter = `
];
`;
  await writeFile(VERSIONS_OUT_FILE, versionsHeader + versionsBody + versionsFooter);
  process.stdout.write(
    `build-templates: wrote ${published.length} published packages → ${relative(APP_ROOT, VERSIONS_OUT_FILE)}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`build-templates failed: ${err?.message ?? err}\n`);
  process.exit(1);
});
