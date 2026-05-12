import { defineConfig, mergeConfig } from "vitest/config";
import shared from "@george43g/vitest-config/vitest.shared";

export default mergeConfig(
  shared,
  defineConfig({
    test: {
      include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    },
  }),
);
