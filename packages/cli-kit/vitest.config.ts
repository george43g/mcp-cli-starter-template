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
 * Ratcheted 76/82/77/76 → 86/84/80/86 when `output.ts` gained tests alongside
 * the `human`/`FORCE_HUMAN` opt-in (DEFERRED #21.7). That file is now
 * 100/100/100/100. Note the shape of the win: covering the *mode resolution*
 * alone would have LOWERED the package's function percentage, because v8
 * scores a never-loaded file as 100% functions and loading `output.ts` exposed
 * its three uncovered printers. Testing the printers too is what turned a
 * ratchet-down into a ratchet-up.
 *
 * Ratcheted 86/84/80/86 → 91/87/83/91 by the REPL work: the serial line queue
 * (piped multi-command input) plus the four observability features, each with
 * tests. `repl.ts` is now 97/86/100/97.
 *
 * The remaining gap is `program.ts` at 0% — a thin wrapper over commander,
 * exercised end-to-end by the generated app rather than by unit tests here.
 */
/**
 * Ratcheted 91/87/83/91 → 91/88/85/91 by the 0.4.0 ContentBlock renderer. Its
 * helpers (base64 size, unit scaling, the unmodelled-block fallback) are all
 * branch-heavy, so they were covered to their edges rather than allowed to pull
 * the branch floor down — every size unit, both padding lengths, an empty
 * payload, and a block whose `type` is not a string.
 */
export default withCoverageFloor(shared, {
  statements: 91,
  branches: 88,
  functions: 85,
  lines: 91,
});
