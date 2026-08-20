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
 * Raised 19 → 31 → 32 → 33 as MemoryCache, palette, and viewport gained
 * tests, then 33 → 42 when useDevStats gained the package's first `.test.tsx`
 * suite (ink-testing-library + a mocked robustness barrel — proof the tsx
 * globs work end-to-end).
 *
 * FUNCTIONS MOVED DOWN, 81 → 77, and that is not a regression. The v8 provider
 * reports a file it never loaded as 0% statements but **100% functions** —
 * `useMouse.ts`, `useVimKeys.ts` and `glyphs.ts` all show exactly that pattern
 * in the per-file table. So an untested package carries an inflated function
 * score, and the number FALLS toward the truth as files get tested: covering
 * `palette.ts` replaced its optimistic 100% with its real 33%.
 *
 * Consequence worth knowing before trusting these: on a package with large
 * untouched regions, the statements and lines figures are honest, while
 * branches and functions are inflated and will drop before they rise. Recorded
 * in DEFERRED #15. `useTerminalSize.ts` is the newest instance: it ships
 * untested by design (ink-testing-library cannot drive it) and therefore
 * reports 0% statements but 100% branches and functions.
 *
 * Raised 42 → 47 (statements/lines) by the `visual-width` + `font-detect` lift.
 * Branches and functions are deliberately LEFT ALONE despite measuring 90.51
 * and 82, because `font-detect` coverage is environment-dependent: whichever of
 * the fc-list-present / fc-list-absent branches the runner does not take stays
 * uncovered, and macOS and Linux take different ones. Ratcheting a floor onto a
 * number that moves with the runner is how a green local suite fails in CI —
 * which happened once already this session, on a real-clock test.
 */
/**
 * Ratcheted 47/89/80/47 → 64/89/84/64 by the list primitives (line-window,
 * nav-reduce, nav-chunk, scrollbar, width-alloc). Measured 67.17/91.83/86.15,
 * floors set just below.
 *
 * BRANCHES DELIBERATELY LEFT AT 89 despite measuring 91.83, for the reason the
 * note above gives: the branch figure moves with the runner because font-detect
 * takes a different path on macOS than on Linux. The new files are pure and
 * platform-independent, so they raise the floor safely on the other three axes
 * while diluting — not removing — that wobble on this one.
 */
export default withCoverageFloor(shared, {
  statements: 64,
  branches: 89,
  functions: 84,
  lines: 64,
});
