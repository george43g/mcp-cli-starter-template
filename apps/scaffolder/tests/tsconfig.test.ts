/**
 * Regression coverage for packages/tsconfig/base.json.
 *
 * The strict opts below are load-bearing: every other package extends
 * base.json, so weakening any of these silently relaxes the entire
 * workspace's type safety. This test fails fast if a future edit drops
 * one of the flags. See plan A (post-v1 polish) for the audit that
 * established this set as required.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(import.meta.dirname, "../../..");
const BASE_TSCONFIG = join(REPO_ROOT, "packages/tsconfig/base.json");

const REQUIRED_TRUE_FLAGS = [
  "strict",
  "exactOptionalPropertyTypes",
  "noUncheckedIndexedAccess",
  "noImplicitOverride",
  "noFallthroughCasesInSwitch",
  "isolatedModules",
  "verbatimModuleSyntax",
  "forceConsistentCasingInFileNames",
] as const;

describe("packages/tsconfig/base.json — strict flags must stay enabled", () => {
  const config = JSON.parse(readFileSync(BASE_TSCONFIG, "utf8")) as {
    compilerOptions: Record<string, unknown>;
  };

  for (const flag of REQUIRED_TRUE_FLAGS) {
    it(`${flag} === true`, () => {
      expect(config.compilerOptions[flag]).toBe(true);
    });
  }
});
