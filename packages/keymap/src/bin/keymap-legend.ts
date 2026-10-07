#!/usr/bin/env node
import { runLegendCli } from "../legend-cli.js";

process.exitCode = await runLegendCli(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  cwd: process.cwd(),
});
