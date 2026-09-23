#!/usr/bin/env node
// Render every VHS tape in scripts/screenshots/, each from its own folder,
// stopping at the first failure. The tapes resolve output paths against the
// process cwd, so `vhs` must run with cwd = the tapes' folder (see the header
// of overview.tape).
//
// A node script rather than a `for f in …; do (cd …) || exit 1; done` loop,
// which cmd.exe, pnpm's script shell on Windows, cannot run.
//
// Usage: node scripts/run-screenshots.mjs

import { spawnSync } from "node:child_process";
import { globSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TAPES_DIR = join(dirname(fileURLToPath(import.meta.url)), "screenshots");

for (const tape of globSync("*.tape", { cwd: TAPES_DIR }).sort()) {
  const r = spawnSync("vhs", [tape], {
    cwd: TAPES_DIR,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    console.error(`vhs ${tape} failed${r.error ? `: ${r.error.message}` : ""}`);
    process.exit(1);
  }
}
