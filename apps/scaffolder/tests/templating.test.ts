import { describe, expect, it } from "vitest";
import { nameRoffOf, nameSnakeOf, nameUpperOf, substitute } from "../src/core/templating.js";

describe("nameUpperOf", () => {
  it("uppercases and converts dashes to underscores", () => {
    expect(nameUpperOf("foo")).toBe("FOO");
    expect(nameUpperOf("wm-stack")).toBe("WM_STACK");
    expect(nameUpperOf("foo-bar-baz")).toBe("FOO_BAR_BAZ");
  });

  it("preserves digits", () => {
    expect(nameUpperOf("foo-v2")).toBe("FOO_V2");
  });
});

describe("nameSnakeOf", () => {
  it("converts kebab-case names for generated shell identifiers", () => {
    expect(nameSnakeOf("fresh-tool")).toBe("fresh_tool");
  });
});

describe("nameRoffOf", () => {
  it("escapes kebab-case names for generated manpages", () => {
    expect(nameRoffOf("fresh-tool")).toBe("fresh\\-tool");
  });
});

describe("substitute", () => {
  it("replaces example-repo markers", () => {
    expect(substitute("hello example-repo!", { name: "foo", nameUpper: "FOO" })).toBe("hello foo!");
  });

  it("replaces EXAMPLE_REPO markers", () => {
    expect(
      substitute("export const X = EXAMPLE_REPO_DEV;", { name: "foo", nameUpper: "FOO" }),
    ).toBe("export const X = FOO_DEV;");
  });

  it("replaces every occurrence (global)", () => {
    expect(
      substitute("example-repo-example-repo-example-repo", { name: "x", nameUpper: "X" }),
    ).toBe("x-x-x");
  });

  it("replaces usage-generated snake-case shell identifiers", () => {
    expect(
      substitute("_example_repo usage__usage_spec_example_repo.spec", {
        name: "wm-stack",
        nameUpper: "WM_STACK",
      }),
    ).toBe("_wm_stack usage__usage_spec_wm_stack.spec");
  });

  it("replaces usage-generated manpage name variants", () => {
    expect(
      substitute(".TH EXAMPLE-REPO 1\nexample\\-repo", {
        name: "wm-stack",
        nameUpper: "WM_STACK",
      }),
    ).toBe(".TH WM-STACK 1\nwm\\-stack");
  });

  it("leaves @george43g alone when scope is undefined", () => {
    expect(substitute('"name": "@george43g/foo"', { name: "foo", nameUpper: "FOO" })).toBe(
      '"name": "@george43g/foo"',
    );
  });

  it("leaves @george43g alone when scope matches the default", () => {
    expect(
      substitute('"name": "@george43g/foo"', {
        name: "foo",
        nameUpper: "FOO",
        scope: "@george43g",
      }),
    ).toBe('"name": "@george43g/foo"');
  });

  it("replaces @george43g when scope differs", () => {
    expect(
      substitute('"name": "@george43g/foo"', {
        name: "foo",
        nameUpper: "FOO",
        scope: "@myorg",
      }),
    ).toBe('"name": "@myorg/foo"');
  });

  it("protects every published package from project-scope substitution", () => {
    // robustness AND cli-kit are both published, so both keep the scope they
    // are published under. Only locally-generated packages (shared-types here)
    // take the target's scope — rewriting a published name yields
    // @myorg/cli-kit, which resolves to nothing on npm.
    //
    // shared-types is the last vendored package; mcp-kit held this role until
    // it published (0.1.0, 2026-08-22) and moved to the shielded side.
    expect(
      substitute(
        'import { installWatchdog } from "@george43g/robustness"; ' +
          'import x from "@george43g/cli-kit"; import y from "@george43g/shared-types";',
        {
          name: "foo",
          nameUpper: "FOO",
          scope: "@myorg",
        },
      ),
    ).toBe(
      'import { installWatchdog } from "@george43g/robustness"; ' +
        'import x from "@george43g/cli-kit"; import y from "@myorg/shared-types";',
    );
  });

  it("is a no-op when source has no markers", () => {
    expect(substitute("nothing to replace", { name: "x", nameUpper: "X" })).toBe(
      "nothing to replace",
    );
  });
});
