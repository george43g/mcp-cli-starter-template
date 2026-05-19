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
}

main().catch((err) => {
  process.stderr.write(`build-templates failed: ${err?.message ?? err}\n`);
  process.exit(1);
});
