import { shared, withCoverageFloor } from "@george43g/vitest-config/vitest.shared";

/**
 * Floor, not target — see `withCoverageFloor`. Measured 2026-08-09, the first
 * time the gate ever ran.
 *
 * tui-kit is the worst of the nine, and the reason is structural: the preset's
 * test include was `.ts`-only, so a `*.test.tsx` file could not be discovered
 * at all. Every Ink component was therefore untestable-by-configuration, not
 * merely untested. That is fixed; the components remain uncovered.
 *
 * `useVimKeys` is excluded from the catch-up work on purpose — DEFERRED #16a
 * changes its double-dispatch behaviour, so tests written against today's
 * semantics would encode the bug.
 *
 * Raised 19 → 31 when MemoryCache gained tests (12 of them, taking that file
 * to 93%). This is what moving a floor is supposed to look like.
 */
export default withCoverageFloor(shared, {
  statements: 31,
  branches: 86,
  functions: 81,
  lines: 31,
});
