#!/usr/bin/env node

/**
 * Registry boundary: a generated-app call site may only use an ALREADY-PUBLISHED
 * kit API.
 *
 * `apps/example-repo-mcp/src/**` becomes the generated app's source, and
 * generated repos resolve `@george43g/*` from npm. So importing an API that
 * exists only in this workspace typechecks locally — pnpm links the workspace
 * copy — and then fails the scaffolder E2E smoke against the registry with
 * `TS2305: Module … has no exported member`.
 *
 * `pnpm verify` structurally cannot catch this: it resolves the same workspace
 * link. Until now the only signal was that smoke run, which installs from the
 * registry and takes minutes.
 *
 * HOW THIS ANSWERS THE QUESTION WITHOUT A NETWORK CALL
 *
 * semantic-release commits the version bump back and tags it `<pkg>-v<version>`,
 * so the tree at that tag IS the published source. Comparing against the tag
 * therefore asks exactly the right question — "does the released version export
 * this?" — with no registry round-trip and no dependency on what happens to be
 * in the local pnpm store (which holds workspace links, not tarballs).
 *
 * A package with no tag, or a checkout with no tags at all, is reported as
 * UNVERIFIED and fails. A boundary check that passes when it cannot see the
 * boundary is the failure mode this repo already fixed once, in the manifest
 * checker.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

/** Source trees that ship into generated repos. */
const GENERATED_APP_SRC = ["apps/example-repo-mcp/src"];

/** name → directory under packages/, for everything a generated repo installs. */
const REGISTRY_PACKAGES = new Map([
  ["@george43g/robustness", "robustness"],
  ["@george43g/cli-kit", "cli-kit"],
  ["@george43g/tui-kit", "tui-kit"],
  ["@george43g/secret-store", "secret-store"],
]);

const failures = [];

function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

/** Highest released tag for a package, by version sort. */
function latestTag(dir) {
  const out = git(["tag", "--list", `${dir}-v*`, "--sort=-v:refname"]);
  if (!out) return null;
  return (
    out
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)[0] ?? null
  );
}

/**
 * Concatenated text of a package's public surface at a tag, following
 * `export * from "./x.js"` re-exports.
 *
 * The barrel alone is not enough: tui-kit's index is mostly wildcards
 * (`export * from "./components/index.js"`), so a flat text match on it reports
 * every component as unpublished. Following one chain of wildcards is the
 * difference between a check and a noise generator.
 */
function releasedSurface(pkgDir, tag, rel = "index.ts", seen = new Set()) {
  if (seen.has(rel)) return "";
  seen.add(rel);
  const src = git(["show", `${tag}:packages/${pkgDir}/src/${rel}`]);
  if (src === null) return seen.size === 1 ? null : "";
  let text = src;
  for (const [, spec] of src.matchAll(/export\s+\*\s+from\s+["']\.\/([^"']+)["']/g)) {
    const base = spec.replace(/\.jsx?$/, "");
    for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
      const sub = releasedSurface(pkgDir, tag, candidate, seen);
      if (sub) text += sub;
    }
  }
  return text;
}

function walk(d) {
  const out = [];
  for (const entry of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

/** Every `import { a, b } from "@george43g/x"` under a directory. */
async function collectNamedImports(dir) {
  const found = new Map();
  if (!existsSync(dir)) return found;
  for (const file of walk(dir)) {
    const src = await readFile(file, "utf8");
    const re = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
    for (const [, names, spec] of src.matchAll(re)) {
      if (!REGISTRY_PACKAGES.has(spec)) continue;
      const bucket = found.get(spec) ?? new Map();
      for (const raw of names.split(",")) {
        const name = raw
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)[0]
          ?.trim();
        if (name) bucket.set(name, file.replace(`${root}/`, ""));
      }
      found.set(spec, bucket);
    }
  }
  return found;
}

for (const dir of GENERATED_APP_SRC) {
  const imports = await collectNamedImports(join(root, dir));
  for (const [pkg, names] of imports) {
    const pkgDir = REGISTRY_PACKAGES.get(pkg);
    const tag = latestTag(pkgDir);
    if (!tag) {
      failures.push(
        `${pkg}: no release tag matching "${pkgDir}-v*" — cannot verify what is published.\n` +
          `    Fetch tags (\`git fetch --tags\`) or, if the package has genuinely never\n` +
          `    been released, remove it from REGISTRY_PACKAGES in this script.`,
      );
      continue;
    }
    const barrel = releasedSurface(pkgDir, tag);
    if (barrel === null) {
      failures.push(`${pkg}: could not read packages/${pkgDir}/src/index.ts at ${tag}.`);
      continue;
    }
    for (const [name, file] of names) {
      if (!new RegExp(`\\b${name}\\b`).test(barrel)) {
        failures.push(
          `${file}: imports "${name}" from ${pkg}, which ${tag} does not export.\n` +
            `    This typechecks locally because pnpm links the WORKSPACE copy, but a\n` +
            `    generated repo installs ${pkg} from npm and would fail with TS2305.\n` +
            `    Fix: split the change. Publish the API first, then wire the call site in\n` +
            `    a follow-up PR — and park it in DEFERRED #28 meanwhile.`,
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`\nregistry boundary check failed (${failures.length} problem(s)):\n`);
  for (const f of failures) console.error(`  • ${f}\n`);
  process.exit(1);
}
console.log("registry boundary check passed (every kit import exists in the released surface).");
