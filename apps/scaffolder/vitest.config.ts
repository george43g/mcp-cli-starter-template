import { app } from "@george43g/vitest-config/vitest.app.ts";
import { withCoverageFloor } from "@george43g/vitest-config/vitest.shared.ts";
import { defineConfig, mergeConfig } from "vitest/config";

/**
 * `src/phases/**\/lib/**` is the template payload — byte copies of the
 * canonical golden-output sources that the scaffolder ships into target
 * repos. The scaffolder never executes them; it reads them as strings.
 *
 * They are excluded twice, for two different reasons:
 *
 *  - `test.exclude` — so their `*.test.ts` files (the golden output's own
 *    tests) are not collected and run as if they were scaffolder tests.
 *  - `coverage.exclude` — because they were landing in the coverage
 *    DENOMINATOR at 0%. Thousands of lines of template payload were being
 *    scored as untested scaffolder code, which is why this app appeared to
 *    sit at ~50% against a 50% gate: the number was mostly measuring the
 *    golden output, not the scaffolder. Those files are covered by the
 *    canonical packages' own suites and by golden.test.ts.
 */
const LIB_GLOB = "src/phases/**/lib/**";

/**
 * Floor, not target — see `withCoverageFloor`. Measured once the template
 * payload stopped polluting the denominator.
 *
 * This is the one workspace where the honest number went UP rather than down:
 * it reported ~50% against a 50% app gate and was in fact at 86%. It now
 * clears even the stricter packages/* target of 80/70/70/70, so the floor is
 * pinned here rather than left at the app preset it has long outgrown.
 */
export default withCoverageFloor(
  mergeConfig(
    app,
    defineConfig({
      test: {
        exclude: ["**/node_modules/**", "**/dist/**", "**/.turbo/**", LIB_GLOB],
        coverage: {
          exclude: [
            "src/**/*.test.{ts,tsx}",
            "src/**/*.d.ts",
            LIB_GLOB,
            // Generated: rebuilt by `pnpm build:templates` on every run.
            "src/generated/**",
          ],
        },
      },
    }),
  ),
  { statements: 86, branches: 80, functions: 85, lines: 86 },
);
