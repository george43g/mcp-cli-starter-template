import { shared, withCoverageFloor } from "@george43g/vitest-config/vitest.shared";

/**
 * Floor, not target — see `withCoverageFloor`. Measured 2026-08-09.
 *
 * Ratcheted 78/82/80/78 → 81/84/83/81 when 16a landed redaction, the logger
 * knobs, and the shutdown default-sink/unhandledRejection tests. Statements
 * now clear the preset too; the remaining gap to a higher floor is the
 * untested tail of the watchdog and health surfaces.
 *
 * Ratcheted again 81/84/83/81 → 84/85/86/84 by the logger env-prefix + level
 * gate + `getFileLogLines` PID preference, and by the sleep-skew test taken
 * from a downstream consumer — that guard had shipped with no test at all.
 */
export default withCoverageFloor(shared, {
  statements: 84,
  branches: 85,
  functions: 86,
  lines: 84,
});
