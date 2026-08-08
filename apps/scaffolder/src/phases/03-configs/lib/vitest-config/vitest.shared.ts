import { defineConfig, mergeConfig, type UserConfig } from "vitest/config";

/**
 * Shared Vitest preset for `packages/*` (library code).
 *
 * Higher coverage thresholds — library code is reusable, so it earns
 * stricter coverage gates than app code.
 *
 * Usage: extend with `mergeConfig(shared, { ... })` in each package's
 * `vitest.config.ts`, or import this directly if no overrides are needed.
 * A workspace that does not yet meet the target uses `withCoverageFloor()`
 * below rather than quietly running without a gate.
 */
export const shared = defineConfig({
  test: {
    globals: true,
    environment: "node",
    // `.tsx` is not optional here: tui-kit's components are .tsx, so a
    // `.ts`-only include meant a `*.test.tsx` file could not even be
    // DISCOVERED — you could add one and vitest would report "no tests".
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.turbo/**"],
    reporters: process.env.CI ? ["default", "junit"] : ["default"],
    outputFile: {
      junit: "./coverage/junit.xml",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      // Only test files and ambient declarations are excluded.
      //
      // This deliberately does NOT exclude `index.ts` / `types.ts`. That used
      // to be here on the assumption they are always barrels — and it silently
      // zeroed out `shared-types`, whose entire implementation (the Zod schemas
      // and MIRRORED_SCHEMAS) lives in `src/index.ts`. It reported 0% across
      // the board with no file rows and no threshold error, because the file
      // set was empty.
      //
      // The two mistakes are not symmetric. Including a real barrel costs
      // almost nothing — it is imported by every test, so it reports ~100% and
      // barely moves the average. Excluding a real implementation removes it
      // from the gate entirely. When guessing, guess toward measuring.
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.d.ts"],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 70,
        lines: 70,
      },
    },
  },
});

/** Measured coverage a workspace must not fall below. */
export interface CoverageFloor {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

/**
 * Pin a workspace's coverage gate to what it ACTUALLY achieves today.
 *
 * These numbers are a ratchet, not a target. Until 2026-08-09 the presets
 * above declared 80/70/70/70 and the docs advertised it, but
 * `@vitest/coverage-v8` was not installed anywhere and no script passed
 * `--coverage` — so the gate had never executed once. When it finally did,
 * four of nine workspaces were under it, two of them by more than fifty
 * points.
 *
 * Raising the number to the aspiration would have meant a red build; deleting
 * it would have meant no gate at all. A floor at the measured value is the
 * third option: it cannot be met by accident, it fails the moment coverage
 * regresses, and the distance between the floor and the target above is a
 * visible, honest measure of the debt. Move floors up as tests land; never
 * down. A floor that equals the target should be deleted in favour of
 * inheriting the preset.
 */
export function withCoverageFloor(base: UserConfig, floor: CoverageFloor): UserConfig {
  return mergeConfig(base, defineConfig({ test: { coverage: { thresholds: floor } } }));
}

export default shared;
