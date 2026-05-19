/**
 * mcp-scaffold bin — commander entry.
 *
 * Built to dist/cli.js with a shebang banner by vite (see vite.config.ts).
 */

import { buildProgram } from "../src/core/program.js";

const program = buildProgram();

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
