import { shared } from "@george43g/vitest-config/vitest.shared";

/**
 * The preset as-is, so the package TARGET (80/70/70/70) is the gate from the
 * first commit. No `withCoverageFloor()`: this is new code with no coverage
 * debt, and the preset's own rule is that a floor equal to the target is
 * deleted in favour of inheriting it.
 *
 * `src/bin/keymap-legend.ts` is a five-line wrapper exercised by spawning the
 * built bin, which v8 cannot see; `runLegendCli` behind it is tested in-process.
 */
export default shared;
