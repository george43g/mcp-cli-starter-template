#!/usr/bin/env node
// Build the optional Rust accelerator; on failure warn and exit 0 so the TS
// fallback still ships.
//
// A node script rather than `(pnpm … 2>/dev/null) || (echo … && exit 0)`:
// cmd.exe, pnpm's script shell on Windows, cannot redirect to /dev/null, so
// that left side failed on every Windows machine and the native build was
// always skipped there. The build's stderr is also left visible now —
// discarding it hid the real reason whenever the skip fired.
//
// Usage: node scripts/build-native-optional.mjs

import { spawnSync } from "node:child_process";

const args = ["--filter", "@george43g/rust-accel", "build"];

// Under `pnpm run`, npm_execpath is pnpm's own JS entry, which node can run on
// every platform without a shell. Fall back to `pnpm` on PATH otherwise; on
// Windows that is a .cmd shim, which spawn only resolves through a shell.
const execPath = process.env.npm_execpath;
const result =
  execPath && /\.[cm]?js$/.test(execPath)
    ? spawnSync(process.execPath, [execPath, ...args], { stdio: "inherit" })
    : spawnSync("pnpm", args, { stdio: "inherit", shell: process.platform === "win32" });

if (result.status !== 0) {
  const why = result.error ? ` (${result.error.message})` : "";
  console.warn(
    `⚠️  Rust native build skipped${why} (rustc not installed or rust-accel missing). ` +
      "TS fallback will be used.",
  );
}
process.exit(0);
