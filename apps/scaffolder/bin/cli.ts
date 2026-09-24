/**
 * mcp-scaffold bin — commander entry.
 *
 * Built to dist/cli.js with a shebang banner by vite (see vite.config.ts).
 */

import { fileURLToPath } from "node:url";
import { buildProgram } from "../src/core/program.js";
import { ALLOW_STALE_ENV, findStaleBuild, staleBuildMessage } from "../src/core/stale-build.js";

// Before anything else: a dist/ older than its own src/ would scaffold with
// code the checkout no longer contains. Only ever true in a source checkout.
if (process.env[ALLOW_STALE_ENV] !== "1") {
  const stale = findStaleBuild(fileURLToPath(import.meta.url));
  if (stale) {
    process.stderr.write(`${staleBuildMessage(stale)}\n`);
    process.exit(1);
  }
}

const program = buildProgram();

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
