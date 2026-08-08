import { shared, withCoverageFloor } from "@george43g/vitest-config/vitest.shared";

/**
 * Floor, not target — see `withCoverageFloor`. The preset's 80/70/70/70 is
 * the goal; these are what cli-kit measured on 2026-08-09, the first time the
 * gate ever ran.
 *
 * The gap is concentrated in `repl.ts` (~85 lines, a hand-rolled tokenizer,
 * zero tests). It is deliberately NOT being tested now: DEFERRED #16a replaces
 * that loop wholesale with EQStack's queue-based one, so tests written today
 * would be deleted with the code they cover. Raise this floor when the
 * replacement lands, not before.
 */
export default withCoverageFloor(shared, {
  statements: 25,
  branches: 82,
  functions: 64,
  lines: 25,
});
