import { app } from "@george43g/vitest-config/vitest.app.ts";
import { defineConfig, mergeConfig } from "vitest/config";

// Exclude src/phases/**/lib/** — those are raw template files (canonical
// source copies the scaffolder ships into target repos), not scaffolder tests.
export default mergeConfig(
  app,
  defineConfig({
    test: {
      exclude: ["**/node_modules/**", "**/dist/**", "**/.turbo/**", "src/phases/**/lib/**"],
    },
  }),
);
