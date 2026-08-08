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

/**
 * The scaffolder ships its own copy of base.json as an inline string literal
 * in m1-tsconfig-pkg.ts, because the template carries `{{scope}}` placeholders
 * and so cannot be a byte-identical `lib/` mirror the way vitest-config's
 * presets can. That makes it a hand-synced duplicate — and hand-synced
 * duplicates drift. Adding `stripInternal` to the canonical file and not the
 * template is exactly how it drifted once already.
 *
 * This compares the two after normalising the placeholder, so the golden rule
 * is enforced for this file mechanically rather than by memory.
 */
describe("packages/tsconfig/base.json — the scaffolder's inline copy must match", () => {
  it("emits the same compilerOptions a fresh scaffold would get", async () => {
    const canonical = JSON.parse(readFileSync(BASE_TSCONFIG, "utf8")) as {
      compilerOptions: Record<string, unknown>;
    };

    const source = readFileSync(
      join(REPO_ROOT, "apps/scaffolder/src/phases/03-configs/m1-tsconfig-pkg.ts"),
      "utf8",
    );
    const match = source.match(/const BASE_JSON = `([\s\S]*?)`;/);
    expect(match, "BASE_JSON literal not found — did the migration get restructured?").toBeTruthy();

    const templated = JSON.parse((match?.[1] ?? "").replace(/\{\{scope\}\}/g, "@george43g")) as {
      compilerOptions: Record<string, unknown>;
    };

    expect(templated.compilerOptions).toEqual(canonical.compilerOptions);
  });
});
