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
  "packages/secret-store",
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

/**
 * An `exports` map with only an `import` condition is unreachable from CJS.
 *
 * `exports` fully replaces `main`, so a CJS consumer calling `require()` gets
 * ERR_PACKAGE_PATH_NOT_EXPORTED — not the friendlier ERR_REQUIRE_ESM, and not
 * a fallback to `main`. Node 24 can `require()` an ES module, but it resolves
 * the specifier under the `require` condition first, which an import-only map
 * does not answer. Reported by secret-store's first real consumer (2026-08-09),
 * who had to convert their project to ESM to use the package at all.
 *
 * The fix needs no CJS build: `"default": "./dist/index.js"` last in the
 * condition list points require() at the same ESM file, which Node 24 loads
 * natively. Applies to every workspace package, not just published ones —
 * mcp-kit and shared-types ship as SOURCE into generated repos, so a defect
 * here is inherited by every scaffolded tool.
 */
function checkExportsResolvable(dir, pkg) {
  // `./package.json` must stay reachable: `exports` replaces `main`, so an map
  // that omits it makes `require.resolve("<pkg>/package.json")` throw
  // ERR_PACKAGE_PATH_NOT_EXPORTED — the standard way to locate an installed
  // package's root, used by build tooling, version probes and test harnesses.
  // Reported against tui-kit (2026-08-09) by a consumer whose regression test
  // reads the published `src/`. This is the second exports-map defect in two
  // days, hence a check rather than six one-line edits.
  if (pkg.exports && !("./package.json" in pkg.exports)) {
    failures.push(
      `${dir}: exports has no "./package.json" entry\n` +
        `    Fix: add "./package.json": "./package.json". Without it ` +
        `require.resolve("${pkg.name}/package.json") throws ` +
        `ERR_PACKAGE_PATH_NOT_EXPORTED, because exports replaces main entirely.`,
    );
  }

  for (const [subpath, conditions] of Object.entries(pkg.exports ?? {})) {
    if (typeof conditions !== "object" || conditions === null) continue;
    const keys = Object.keys(conditions);
    if (!keys.includes("import")) continue;
    if (!keys.includes("default") && !keys.includes("require")) {
      failures.push(
        `${dir}: exports["${subpath}"] has "import" but no "default" or "require"\n` +
          `    Fix: add "default": ${JSON.stringify(conditions.import)} as the LAST condition. ` +
          `Without it require() fails with ERR_PACKAGE_PATH_NOT_EXPORTED, because exports ` +
          `replaces main entirely. No CJS build is needed — Node 24 requires ESM natively.`,
      );
      continue;
    }
    // Conditions match in order; anything after "default" is dead.
    const defaultIndex = keys.indexOf("default");
    if (defaultIndex !== -1 && defaultIndex !== keys.length - 1) {
      failures.push(
        `${dir}: exports["${subpath}"] lists "default" before ${JSON.stringify(
          keys[defaultIndex + 1],
        )}\n    Fix: move "default" last — it matches everything, so later conditions never apply.`,
      );
    }
  }
}

/**
 * Every workspace dependency on a package WE publish must admit that package's
 * current version. A caret on a 0.x release pins the MINOR (`^0.1.1` means
 * `>=0.1.1 <0.2.0`), so bumping a sibling to 0.2.0 silently strands every
 * consumer still on `^0.1.x` — they ERESOLVE (field-note 34). This caught
 * apps/mcpsync, which the first round of that fix missed.
 */
function checkSiblingRanges(dir, pkg, versions) {
  for (const field of ["dependencies", "peerDependencies"]) {
    for (const [name, range] of Object.entries(pkg[field] ?? {})) {
      const current = versions.get(name);
      if (!current || typeof range !== "string") continue;
      if (range.startsWith("workspace:")) continue; // reported separately
      if (!satisfiesLoose(range, current)) {
        failures.push(
          `${dir}: ${field}.${name} is "${range}" but that package is now at ${current}\n` +
            `    Fix: widen to admit it (e.g. "${range} || ^${current}"). A caret on a 0.x ` +
            `pins the minor, so a sibling bump strands this consumer with ERESOLVE.`,
        );
      }
    }
  }
}

/** Minimal range check: does any `^X.Y`/`~X.Y`/exact clause cover `version`? */
function satisfiesLoose(range, version) {
  const [vMajor, vMinor] = version.split(".");
  return range.split("||").some((clause) => {
    const c = clause.trim();
    const m = c.match(/^([\^~]?)(\d+)\.(\d+)/);
    if (!m) return true; // ranges we don't model (*, >=, x) — don't guess
    const [, op, major, minor] = m;
    if (op === "^") {
      // ^0.x pins the minor; ^X.y (X>0) pins the major.
      return major === "0" ? major === vMajor && minor === vMinor : major === vMajor;
    }
    if (op === "~") return major === vMajor && minor === vMinor;
    return c === version;
  });
}

const seen = new Set();

// Current version of every package we publish, for the sibling-range check.
const publishedVersions = new Map();
for (const { dir, manifestAbs } of await collectManifests()) {
  if (!PUBLISHABLE.has(dir)) continue;
  const pkg = JSON.parse(await readFile(manifestAbs, "utf8"));
  if (pkg.name && pkg.version) publishedVersions.set(pkg.name, pkg.version);
}

for (const { dir, manifestAbs } of await collectManifests()) {
  const pkg = JSON.parse(await readFile(manifestAbs, "utf8"));

  // Applies to EVERY workspace package, published or not: anyone depending on a
  // package we publish must track its version.
  checkSiblingRanges(dir, pkg, publishedVersions);
  checkExportsResolvable(dir, pkg);

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
