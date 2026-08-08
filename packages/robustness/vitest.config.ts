import { shared, withCoverageFloor } from "@george43g/vitest-config/vitest.shared";

/**
 * Floor, not target — see `withCoverageFloor`. Measured 2026-08-09.
 *
 * The only miss is statements, by 1.7 points; branches and functions already
 * clear the preset. Unlike cli-kit and tui-kit this gap is closable now — the
 * uncovered region is the rest of the process-wide singleton surface, which
 * nothing in DEFERRED #16 replaces. That makes it the highest-value coverage
 * work in the repo, and it is exactly where the #14 singleton bug lived.
 */
export default withCoverageFloor(shared, {
  statements: 78,
  branches: 81,
  functions: 79,
  lines: 78,
});
