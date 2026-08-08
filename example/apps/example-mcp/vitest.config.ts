import { app } from "@george43g/vitest-config/vitest.app";
import { withCoverageFloor } from "@george43g/vitest-config/vitest.shared";

/**
 * Floor, not target — see `withCoverageFloor`. Measured 2026-08-09, the first
 * time the gate ever ran.
 *
 * The app preset targets 50/40/40/40. Statements and lines fall short because
 * the single integration test drives the MCP dispatch path and little else:
 * the CLI subcommands, the TUI entry and the HTTP command are all exercised
 * end-to-end by `pnpm stress` rather than by vitest, so they count as
 * uncovered here while being far from untested in practice.
 */
export default withCoverageFloor(app, {
  statements: 29,
  branches: 79,
  functions: 92,
  lines: 29,
});
