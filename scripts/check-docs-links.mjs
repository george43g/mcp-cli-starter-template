#!/usr/bin/env node

/**
 * Docs integrity check: agent-facing markdown must stay navigable.
 *
 * 1. Relative links in repo-facing markdown resolve to real files.
 * 2. CLAUDE.md / .cursorrules stay symlinks pointing at AGENTS.md.
 * 3. Every top-level docs/*.md has a row in the docs index (docs/README.md).
 *
 * Template surfaces (example/, apps/scaffolder/src/phases/[star]/lib/) are
 * excluded: their links are written for the generated repo's layout.
 */

import { existsSync, lstatSync, readlinkSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

/** Directories whose markdown is never checked (generated or template-owned). */
const EXCLUDED_DIR_PARTS = ["node_modules", "example", "lib", "dist", "man", ".turbo"];

/** Markdown roots that must stay link-clean. */
const SCAN_ROOTS = [
  "AGENTS.md",
  "DEFERRED.md",
  "HANDOFF.md",
  "README.md",
  "llms-install.md",
  "skills.md",
  "apps/scaffolder/AGENTS.md",
  "apps/scaffolder/README.md",
  "docs",
  "skills",
];

/** Symlink → required target, both relative to repo root. */
const REQUIRED_SYMLINKS = [
  ["CLAUDE.md", "AGENTS.md"],
  [".cursorrules", "AGENTS.md"],
  ["apps/scaffolder/CLAUDE.md", "AGENTS.md"],
];

const failures = [];

function isExcluded(absPath) {
  const parts = relative(root, absPath).split("/");
  return parts.some((part) => EXCLUDED_DIR_PARTS.includes(part));
}

async function collectMarkdown(entry, acc) {
  const abs = join(root, entry);
  if (!existsSync(abs)) {
    failures.push(
      `missing scan root: ${entry}\n    Fix: restore the file or drop it from SCAN_ROOTS in scripts/check-docs-links.mjs.`,
    );
    return acc;
  }
  if (lstatSync(abs).isFile()) {
    acc.push(abs);
    return acc;
  }
  for (const dirent of await readdir(abs, { withFileTypes: true, recursive: true })) {
    const full = join(dirent.parentPath, dirent.name);
    if (dirent.isFile() && dirent.name.endsWith(".md") && !isExcluded(full)) acc.push(full);
  }
  return acc;
}

const LINK_RE = /\[[^\]]*\]\(([^()\s]+(?:\([^()]*\)[^()\s]*)?)(?:\s+"[^"]*")?\)/g;

/** Code is not navigation: drop fenced blocks and inline spans before scanning. */
function stripCode(content) {
  return content.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
}

function checkLinks(fileAbs, content) {
  for (const match of stripCode(content).matchAll(LINK_RE)) {
    const target = match[1];
    if (/^(?:https?:|mailto:|#)/.test(target)) continue;
    const pathPart = target.split("#")[0];
    if (pathPart === "") continue;
    // VHS-generated media (docs/screenshots/*.gif) is produced by CI, so a
    // hero-image link into it is legitimately absent in a fresh checkout.
    if (pathPart.includes("screenshots/")) continue;
    // usage(1)-generated CLI docs emit site-absolute links (/init.md) that
    // mean "sibling page"; no repo-root-absolute links exist in this repo.
    const resolved = pathPart.startsWith("/")
      ? resolve(dirname(fileAbs), pathPart.slice(1))
      : resolve(dirname(fileAbs), pathPart);
    if (!existsSync(resolved)) {
      failures.push(
        `broken link in ${relative(root, fileAbs)}: (${target})\n    Fix: correct the path or create ${relative(root, resolved)}.`,
      );
    }
  }
}

function checkSymlinks() {
  for (const [linkRel, expectedTarget] of REQUIRED_SYMLINKS) {
    const abs = join(root, linkRel);
    let actual;
    try {
      actual = readlinkSync(abs);
    } catch {
      failures.push(
        `${linkRel} is not a symlink\n    Fix: ln -sf ${expectedTarget} ${linkRel} — agent files are edited via AGENTS.md only.`,
      );
      continue;
    }
    if (actual !== expectedTarget) {
      failures.push(
        `${linkRel} points at ${actual}, expected ${expectedTarget}\n    Fix: ln -sf ${expectedTarget} ${linkRel}.`,
      );
    }
  }
}

async function checkIndexCoverage() {
  const indexAbs = join(root, "docs/README.md");
  const index = await readFile(indexAbs, "utf8");
  for (const dirent of await readdir(join(root, "docs"), { withFileTypes: true })) {
    if (!dirent.isFile() || !dirent.name.endsWith(".md") || dirent.name === "README.md") continue;
    if (!index.includes(dirent.name)) {
      failures.push(
        `docs/${dirent.name} is not listed in docs/README.md\n    Fix: add a row with a one-line "read when" hook to the index.`,
      );
    }
  }
}

const markdownFiles = [];
for (const entry of SCAN_ROOTS) await collectMarkdown(entry, markdownFiles);
for (const fileAbs of [...new Set(markdownFiles)]) {
  checkLinks(fileAbs, await readFile(fileAbs, "utf8"));
}
checkSymlinks();
await checkIndexCoverage();

if (failures.length > 0) {
  console.error(`docs integrity check failed (${failures.length} problem(s)):\n`);
  for (const failure of failures) console.error(`  • ${failure}\n`);
  process.exit(1);
}
console.log(`docs integrity check passed (${markdownFiles.length} markdown files scanned).`);
