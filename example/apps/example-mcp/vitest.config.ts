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
 *
 * Ratcheted 29/79/92/29 → 34/77/93/34 by the build stamp. Statements, lines and
 * functions all rose; BRANCHES FELL BY 2, deliberately, and not because
 * anything went untested.
 *
 * `meta.ts`'s `__BUILD_STAMP__` branch is structurally uncoverable by vitest:
 * the identifier only exists after Vite's compile-time `define` substitution,
 * and vitest does not run a Vite build. Making it reachable from a test would
 * mean turning the define into a runtime read, which is the exact design this
 * feature rejects — a runtime read describes the checkout the process is
 * sitting in, not the build that produced the artifact.
 *
 * It is verified instead against the built output: the stamp appears as a
 * string literal in `dist/`, is stable across re-runs, and `dist/` contains no
 * `execFileSync`. Every other branch of the stamp — no git, shallow clone,
 * clean tree, dirty tree — is covered by `tests/meta-degraded.test.ts`.
 */
export default withCoverageFloor(app, {
  statements: 34,
  branches: 77,
  functions: 93,
  lines: 34,
});
