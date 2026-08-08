#!/usr/bin/env node

/**
 * Publish-shape check: every non-private workspace package must be safe to
 * ship to npm from CI without hand-inspection.
 *
 * 1. `repository.url` is case-exact and `repository.directory` matches reality.
 *    npm validates provenance by comparing repository.url against the signing
 *    certificate, case-sensitively (field-note 23). Provenance is off today —
 *    this repo is private — but a wrong URL is silent until the day it isn't.
 * 2. The npm-page basics exist: publishConfig.access, license, engines.node,
 *    description, and README.md + LICENSE both listed in `files` AND on disk.
 * 3. No `workspace:` specifier in `dependencies` / `peerDependencies`.
 *    @semantic-release/npm shells out to plain `npm publish`, which does NOT
 *    rewrite the workspace protocol the way `pnpm publish` does — such a
 *    tarball installs as EUNSUPPORTEDPROTOCOL (field-note 24).
 *    devDependencies are exempt: consumers never install them.
 *
 * See docs/RELEASE.md "Adding a package to the pipeline" for the full sequence.
 */

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const REPO_URL = "git+https://github.com/george43g/mcp-cli-starter-template.git";

/** Workspace globs from pnpm-workspace.yaml, resolved manually (no yaml dep). */
const WORKSPACE_DIRS = ["apps", "packages"];

/**
 * The packages this repo actually publishes. Each has a release job in
 * .github/workflows/release-packages.yml and a Trusted Publisher on npmjs.com.
 *
 * `private: true` is NOT the discriminator: apps/scaffolder and
 * apps/example-repo-mcp are deliberately non-private (CI pack-checks their
 * tarball shape) but are never published, so they are not held to these rules.
 */
const PUBLISHABLE = new Set([
  "packages/robustness",
  "packages/cli-kit",
  "packages/tui-kit",
  "apps/mcpsync",
]);

const failures = [];

async function collectManifests() {
  const found = [];
  for (const parent of WORKSPACE_DIRS) {
    let entries;
    try {
      entries = await readdir(join(root, parent), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = `${parent}/${entry.name}`;
      const manifestAbs = join(root, dir, "package.json");
      if (!existsSync(manifestAbs)) continue;
      found.push({ dir, manifestAbs });
    }
  }
  return found;
}

function checkWorkspaceProtocol(dir, pkg) {
  for (const field of ["dependencies", "peerDependencies"]) {
    for (const [name, range] of Object.entries(pkg[field] ?? {})) {
      if (typeof range === "string" && range.startsWith("workspace:")) {
        failures.push(
          `${dir}: ${field}.${name} is "${range}"\n` +
            `    Fix: publish that package and use a real semver range, or move the ` +
            `dependency to peerDependencies + a devDependency. \`npm publish\` does not ` +
            `rewrite the workspace protocol, so consumers would get EUNSUPPORTEDPROTOCOL.`,
        );
      }
    }
  }
}

function checkFilesEntry(dir, pkg, name) {
  if (!(pkg.files ?? []).includes(name)) {
    failures.push(`${dir}: "${name}" missing from the \`files\` array\n    Fix: add it.`);
  }
  if (!existsSync(join(root, dir, name))) {
    failures.push(
      `${dir}: ${name} does not exist\n    Fix: create it (LICENSE is a copy of the root MIT text).`,
    );
  }
}

const seen = new Set();

for (const { dir, manifestAbs } of await collectManifests()) {
  const pkg = JSON.parse(await readFile(manifestAbs, "utf8"));

  if (!PUBLISHABLE.has(dir)) {
    // Catch a package made publish-shaped without being registered here (and
    // therefore without a release job or a Trusted Publisher).
    if (pkg.publishConfig?.access === "public" && pkg.private !== true) {
      failures.push(
        `${dir}: declares publishConfig.access "public" but is not in PUBLISHABLE\n` +
          `    Fix: add it to PUBLISHABLE in this script, give it a release job in ` +
          `.github/workflows/release-packages.yml, and configure its Trusted Publisher — ` +
          `or drop publishConfig.`,
      );
    }
    continue;
  }
  seen.add(dir);

  if (pkg.repository?.url !== REPO_URL) {
    failures.push(
      `${dir}: repository.url is ${JSON.stringify(pkg.repository?.url)}\n` +
        `    Fix: set it to exactly "${REPO_URL}" (npm compares this case-sensitively).`,
    );
  }
  if (pkg.repository?.directory !== dir) {
    failures.push(
      `${dir}: repository.directory is ${JSON.stringify(pkg.repository?.directory)}\n` +
        `    Fix: set it to "${dir}".`,
    );
  }
  if (pkg.publishConfig?.access !== "public") {
    failures.push(
      `${dir}: publishConfig.access is not "public"\n` +
        `    Fix: scoped packages default to restricted; add { "publishConfig": { "access": "public" } }.`,
    );
  }
  for (const field of ["license", "description"]) {
    if (!pkg[field]) failures.push(`${dir}: missing "${field}"\n    Fix: add it.`);
  }
  if (!pkg.engines?.node) {
    failures.push(`${dir}: missing engines.node\n    Fix: add { "engines": { "node": ">=24" } }.`);
  }
  checkFilesEntry(dir, pkg, "README.md");
  checkFilesEntry(dir, pkg, "LICENSE");
  checkWorkspaceProtocol(dir, pkg);
}

for (const dir of PUBLISHABLE) {
  if (!seen.has(dir)) {
    failures.push(
      `${dir}: listed in PUBLISHABLE but no package.json was found there\n` +
        `    Fix: update PUBLISHABLE in this script if the package moved or was removed.`,
    );
  }
}

if (failures.length > 0) {
  console.error(`publishable manifest check failed (${failures.length} problem(s)):\n`);
  for (const failure of failures) console.error(`  • ${failure}\n`);
  process.exit(1);
}
console.log(`publishable manifest check passed (${seen.size} publishable packages).`);
