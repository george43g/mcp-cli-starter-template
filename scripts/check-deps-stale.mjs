#!/usr/bin/env node
/**
 * check-deps-stale.mjs — ask the REGISTRY whether first-party deps are current.
 *
 * DELIBERATELY NOT PART OF `verify`. It needs the network, and `verify` must
 * stay offline, fast and deterministic. Run it when you want the answer:
 *
 *     pnpm check:deps-stale        # or: mise run deps:stale
 *
 * WHY IT EXISTS SEPARATELY FROM check-dep-ranges.mjs
 *
 * That check is offline, so it can only see the tree disagreeing with itself:
 * a caret pinning a 0.x minor, two consumers on different versions, a
 * resolution below a declared floor. **It cannot see a workspace that is
 * uniformly stale** — every consumer agreeing on a version ten minors old
 * passes all three of its assertions.
 *
 * That is not hypothetical, and this repo was itself an instance. On
 * 2026-08-24 `packages/mcp-kit` declared `">=0.11.0 <1"`, the published latest
 * was 0.12.0, and the lockfile retained 0.11.0 — the repo that had spent a week
 * auditing four consumer sessions for exactly this. `pnpm verify` is
 * network-free by design and could not see it. A comparator range takes the
 * newest version only on FIRST resolution; an existing entry that still
 * satisfies it is retained indefinitely and a plain `pnpm install` reports
 * nothing.
 *
 * PORTED from life-stack's `scripts/check-deps-stale.mjs` rather than rewritten,
 * deliberately — a second implementation of a check this subtle is a second set
 * of bugs. Two adaptations were needed here, both recorded below: private
 * packages, and the `--recursive` flag.
 *
 * So the two failure modes are locked together: `pnpm update` is the only thing
 * that escapes a stale entry, and `pnpm update` is exactly what rewrites the
 * comparator range back into a caret. Neither check alone closes the loop; this
 * one is the half that needs the registry.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SCOPE = "@george43g/";

function readLock() {
  const text = readFileSync(join(ROOT, "pnpm-lock.yaml"), "utf8");
  const registry = [];
  const links = [];
  let importer = null;
  let pkgName = null;
  for (const line of text.split("\n")) {
    const imp = line.match(/^ {2}([^\s:][^:]*):\s*$/);
    if (imp) {
      importer = imp[1];
      pkgName = null;
      continue;
    }
    const dep = line.match(/^ {6}'?(@george43g\/[^']+)'?:\s*$/);
    if (dep) {
      pkgName = dep[1];
      continue;
    }
    if (!pkgName) continue;
    const ver = line.match(/^ {8}version:\s*'?([^'\n]+?)'?\s*$/);
    if (ver) {
      // `link:` edges track the workspace copy directly and cannot be stale,
      // so they are excluded from the npm-view loop — but they are COUNTED,
      // because "no registry entries" has two readings and only the link tally
      // can tell them apart (see the outcome split below).
      if (ver[1].startsWith("link:")) links.push({ importer, name: pkgName });
      else registry.push({ importer, name: pkgName, version: ver[1] });
      pkgName = null;
    }
  }
  return { registry, links };
}

// pnpm appends a peer-dep suffix to some lockfile versions —
// "2.0.1(commander@14.0.3)". Left in place, Number() on the second segment
// yields NaN, every comparison returns NaN, `NaN < 0` is false, and the package
// can NEVER be reported stale. A silent always-pass, which is the exact defect
// this file exists to catch, in this file.
const bare = (v) => String(v).replace(/\(.*$/, "").trim();
const cmp = (a, b) => {
  const pa = bare(a).split(".").map(Number);
  const pb = bare(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
};

/**
 * Packages in THIS workspace marked `private: true`.
 *
 * ADAPTATION FOR THIS REPO — and an HONEST note on its status: this guard is
 * currently DEAD CODE here, kept deliberately.
 *
 * `@george43g/shared-types` is private and absent from PUBLISHABLE in
 * check-publishable-manifests.mjs, and `npm view` on it returns E404 correctly
 * and permanently. I first recorded that as a live hazard for this port — "it
 * would exit 2 forever". **That was wrong, and the reason is worth keeping**:
 * a private workspace package is depended on as `workspace:*`, which resolves
 * to a `link:` entry, and readLock() already drops every `link:`. So a private
 * package never reaches the npm-view loop and cannot trigger the exit-2 path.
 *
 * Kept anyway, because the failure mode is real the moment the shape changes —
 * a private package depended on by version rather than by link, or a name that
 * is published later. The cost is ten lines and one skipped row.
 *
 * Deliberately keyed on an AFFIRMATIVE fact — the manifest says `private: true`
 * — and not on "npm 404'd", which is also what a typo, an unpublished new
 * package, or an outage looks like.
 *
 */
function privateWorkspaceNames() {
  const names = new Set();
  for (const dir of ["packages", "apps"]) {
    let kids = [];
    try {
      kids = readdirSync(join(ROOT, dir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const kid of kids) {
      if (!kid.isDirectory()) continue;
      try {
        const pkg = JSON.parse(readFileSync(join(ROOT, dir, kid.name, "package.json"), "utf8"));
        if (pkg.private === true && typeof pkg.name === "string") names.add(pkg.name);
      } catch {
        // No manifest, or unreadable — not private by assertion, so not skipped.
      }
    }
  }
  return names;
}

const PRIVATE = privateWorkspaceNames();
const { registry: entries, links } = readLock();

// ZERO REGISTRY ENTRIES has two readings, and only the link tally separates
// them. The mcp-kit peer-dependency change (#109) removed the last
// registry-resolved first-party entry from this repo's lockfile — every
// first-party edge became a `link:` — and the original zero-entries positive
// control read that LEGITIMATE state as a broken parser, failing the weekly
// job on its first scheduled run. So:
//   (a) registry entries found            → check them against npm (below);
//   (b) none, but first-party links exist → PASS, affirmatively: the parser
//       demonstrably works (it counted the links), and a link tracks the
//       workspace copy directly, so nothing CAN be stale;
//   (c) neither                           → the parser broke, or nothing
//       depends on first-party packages at all. Still a loud FAIL — "clean"
//       is the reassuring reading, which is why it must not be the default.
if (entries.length === 0) {
  if (links.length > 0) {
    const linkNames = [...new Set(links.map((l) => l.name))].sort();
    console.log(
      `check-deps-stale: PASS — no registry-resolved ${SCOPE}* entries; the workspace is link-only.`,
    );
    console.log(
      `  ${links.length} first-party edge(s) across ${linkNames.length} package(s) resolve as workspace links:`,
    );
    for (const n of linkNames) console.log(`    - ${n}`);
    console.log("  A link tracks the workspace copy directly, so there is nothing to be stale.");
    process.exit(0);
  }
  console.error(
    `check-deps-stale: FAILED — found no ${SCOPE}* deps in pnpm-lock.yaml at all, registry or link.`,
  );
  console.error("  Either nothing depends on them, or the parser broke. Both need a human.");
  process.exit(1);
}

const names = [...new Set(entries.map((e) => e.name))].sort();
const rows = [];
let stale = 0;
let unreachable = 0;

for (const name of names) {
  if (PRIVATE.has(name)) {
    rows.push(`  -  ${name.padEnd(28)} private: true — never published, not checked`);
    continue;
  }
  let latest = null;
  try {
    latest = execFileSync("npm", ["view", name, "version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 20000,
    }).trim();
  } catch {
    latest = null;
  }
  const used = [...new Set(entries.filter((e) => e.name === name).map((e) => bare(e.version)))];
  if (!latest) {
    unreachable++;
    rows.push(`  ?  ${name.padEnd(28)} using ${used.join(", ").padEnd(10)} registry unreachable`);
    continue;
  }
  const behind = used.filter((v) => cmp(v, latest) < 0);
  if (behind.length > 0) {
    stale++;
    rows.push(
      `  !  ${name.padEnd(28)} using ${used.join(", ").padEnd(10)} latest ${latest}  STALE`,
    );
  } else {
    rows.push(`  ok ${name.padEnd(28)} using ${used.join(", ").padEnd(10)} latest ${latest}`);
  }
}

console.log(`check-deps-stale: ${names.length} first-party package(s) against the registry\n`);
for (const r of rows) console.log(r);
console.log("");

if (unreachable > 0) {
  // Not a pass. An unanswered question is not a clean answer — that conflation
  // is the failure this whole family of checks exists to prevent.
  console.error(`${unreachable} package(s) could not be checked. Result is INCOMPLETE, not clean.`);
  process.exit(2);
}
if (stale > 0) {
  console.error(`${stale} package(s) behind. To adopt:\n`);
  console.error("    pnpm update '@george43g/*' --recursive");
  console.error("    # --recursive is NOT optional. Measured 2026-08-24: plain");
  console.error("    #   `pnpm update <pkg>` from the root is a SILENT NO-OP when the");
  console.error("    #   dependency lives in a workspace package — it prints");
  console.error("    #   'Already up to date' and changes nothing.");
  console.error("    # then RESTORE any comparator range pnpm rewrote into a caret —");
  console.error("    #   `pnpm -r update` rewrote '>=0.11.0 <1' to '^0.12.0' here, and a");
  console.error("    #   caret on a 0.x pins the MINOR, so it can never be updated again.");
  console.error("    # then `pnpm install` and confirm with `pnpm install --frozen-lockfile`.\n");
  process.exit(1);
}
console.log("All first-party dependencies are at the latest published version.");
