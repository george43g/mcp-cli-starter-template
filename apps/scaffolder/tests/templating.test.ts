import { describe, expect, it } from "vitest";
import { nameUpperOf, substitute } from "../src/core/templating.js";

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

describe("substitute", () => {
  it("replaces {{name}} markers", () => {
    expect(substitute("hello {{name}}!", { name: "foo", nameUpper: "FOO" })).toBe("hello foo!");
  });

  it("replaces {{NAME_UPPER}} markers", () => {
    expect(
      substitute("export const X = {{NAME_UPPER}}_DEV;", { name: "foo", nameUpper: "FOO" }),
    ).toBe("export const X = FOO_DEV;");
  });

  it("replaces every occurrence (global)", () => {
    expect(substitute("{{name}}-{{name}}-{{name}}", { name: "x", nameUpper: "X" })).toBe("x-x-x");
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

  it("is a no-op when source has no markers", () => {
    expect(substitute("nothing to replace", { name: "x", nameUpper: "X" })).toBe(
      "nothing to replace",
    );
  });
});
