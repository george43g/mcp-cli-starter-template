import { shared, withCoverageFloor } from "@george43g/vitest-config/vitest.shared";

/**
 * Floor, not target — see `withCoverageFloor`.
 *
 * Raised 25 → 76 when repl.ts gained tests. The earlier note here said those
 * tests were deliberately skipped because DEFERRED #16a replaces the readline
 * loop wholesale; that reasoning was overtaken by a downstream consumer being
 * blocked on the REPL's actual behaviour. The tests are written against the
 * contract rather than the loop, so a replacement still has to satisfy them.
 *
 * The remaining gap is `output.ts` and `program.ts` at 0% — both are thin
 * wrappers over commander and the console, and both are exercised end-to-end
 * by the generated app rather than by unit tests here.
 */
export default withCoverageFloor(shared, {
  statements: 76,
  branches: 82,
  functions: 77,
  lines: 76,
});
