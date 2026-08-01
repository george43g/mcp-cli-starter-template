import { describe, expect, it } from "vitest";
import { selectServers } from "../src/commands/apply.js";
import { normalize } from "../src/core/canonical.js";
import { applyServer } from "../src/core/hosts/index.js";
import type { McpServer } from "../src/core/schema.js";

const canonical: Record<string, McpServer> = {
  a: normalize({ command: "a" }, "a"),
  b: normalize({ command: "b" }, "b"),
  off: normalize({ command: "c", enabled: false }, "off"),
};

describe("selectServers", () => {
  it("drops disabled servers by default", () => {
    expect(
      selectServers(canonical)
        .map((s) => s.name)
        .sort(),
    ).toEqual(["a", "b"]);
  });

  it("intersects an --only allowlist with the enabled filter", () => {
    expect(selectServers(canonical, ["a", "off"]).map((s) => s.name)).toEqual(["a"]);
  });

  it("returns nothing when the allowlist matches only disabled servers", () => {
    expect(selectServers(canonical, ["off"])).toEqual([]);
  });
});

describe("applyServer", () => {
  it("throws on an unknown host id", () => {
    expect(() => applyServer("nope", normalize({ command: "x" }, "x"))).toThrow(/unknown host/);
  });
});
