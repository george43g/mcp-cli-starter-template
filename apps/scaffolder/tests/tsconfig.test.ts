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
import {
  addRootReferences,
  isTsconfigPath,
  withoutPublishedReferences,
} from "../src/core/tsconfig-refs.js";
import { TSCONFIG, TSCONFIG_TEST } from "../src/phases/07-shared-types/m1-shared-types.js";

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

/**
 * shared-types' tsconfig.json and tsconfig.test.json are inline templates in
 * m1-shared-types.ts for the same reason base.json is: they carry the scope.
 * Unlike base.json, the whole file is the contract (composite, where the build
 * info lives, what the test project includes), so compare bytes, not options.
 */
describe("packages/shared-types tsconfigs — the scaffolder's inline copies must match", () => {
  for (const [file, render] of [
    ["tsconfig.json", TSCONFIG],
    ["tsconfig.test.json", TSCONFIG_TEST],
  ] as const) {
    it(file, () => {
      const canonical = readFileSync(join(REPO_ROOT, "packages/shared-types", file), "utf8");
      expect(render("@george43g")).toBe(canonical);
    });
  }
});

describe("withoutPublishedReferences — a generated app references only what it vendors", () => {
  it("drops the published kits and keeps shared-types, as the canonical app's tsconfig renders", () => {
    const canonical = readFileSync(join(REPO_ROOT, "apps/example-repo-mcp/tsconfig.json"), "utf8");
    const rendered = withoutPublishedReferences(canonical);
    const refs = (JSON.parse(rendered) as { references: Array<{ path: string }> }).references;
    expect(refs).toEqual([{ path: "../../packages/shared-types" }]);
    // Every other byte is the template's own.
    expect(rendered.replace(/"references":[\s\S]*?\]/, "")).toBe(
      canonical.replace(/"references":[\s\S]*?\]/, ""),
    );
    expect(rendered).toContain('  "references": [{ "path": "../../packages/shared-types" }]\n');
  });

  it("leaves content without a references array alone", () => {
    const content = '{\n  "compilerOptions": {}\n}\n';
    expect(withoutPublishedReferences(content)).toBe(content);
  });

  it("only rewrites tsconfig files", () => {
    expect(isTsconfigPath("apps/foo/tsconfig.json")).toBe(true);
    expect(isTsconfigPath("packages/a/tsconfig.test.json")).toBe(true);
    expect(isTsconfigPath("apps/foo/package.json")).toBe(false);
  });
});

describe("addRootReferences — each port registers itself in the root solution", () => {
  const EMPTY =
    '{\n  "extends": "@acme/tsconfig/base.json",\n  "files": [],\n  "references": []\n}\n';

  it("appends, keeps one line while it fits, and is idempotent", () => {
    const once = addRootReferences(EMPTY, ["./apps/foo"]);
    expect(once).toBe(
      '{\n  "extends": "@acme/tsconfig/base.json",\n  "files": [],\n  "references": [{ "path": "./apps/foo" }]\n}\n',
    );
    expect(addRootReferences(once ?? "", ["./apps/foo", "apps/foo/tsconfig.json"])).toBe(once);
  });

  it("breaks one reference per line past 100 columns, the way Biome formats it", () => {
    const out = addRootReferences(EMPTY, [
      "./packages/shared-types",
      "./packages/shared-types/tsconfig.test.json",
      "./apps/foo",
    ]);
    expect(out).toContain(
      '  "references": [\n' +
        '    { "path": "./packages/shared-types" },\n' +
        '    { "path": "./packages/shared-types/tsconfig.test.json" },\n' +
        '    { "path": "./apps/foo" }\n' +
        "  ]\n",
    );
  });

  it("refuses a root tsconfig that is a real project rather than a solution", () => {
    const project = '{\n  "compilerOptions": {},\n  "include": ["src"],\n  "references": []\n}\n';
    expect(addRootReferences(project, ["./apps/foo"])).toBeUndefined();
  });
});
