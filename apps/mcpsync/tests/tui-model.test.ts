import { describe, expect, it } from "vitest";
import { normalize } from "../src/core/canonical.js";
import type { ServerStatus } from "../src/core/diff.js";
import type { HostAdapter } from "../src/core/hosts/types.js";
import type { McpServer } from "../src/core/schema.js";
import { buildMatrix, cellText, clampIndex, statusTone } from "../src/tui/model.js";

/** Minimal host stub (same shape as diff.test.ts): drift is a command compare. */
function stub(id: string, label: string, raw: Record<string, unknown>): HostAdapter {
  return {
    id,
    label,
    configPath: "/x",
    restart: "",
    capabilities: { mechanism: "file", http: true, env: true, project: false },
    detect: () => true,
    readRaw: () => raw,
    read: () => [],
    toNative: (s: McpServer) => s,
    matches: (canon: McpServer, r: unknown) =>
      JSON.stringify({ command: canon.command }) === JSON.stringify(r),
    write: () => ({ changed: false }),
    remove: () => ({ changed: false }),
  };
}

const canonical: Record<string, McpServer> = {
  a: normalize({ command: "a" }, "a"),
  b: normalize({ command: "a" }, "b"),
  off: normalize({ command: "a", enabled: false }, "off"),
};

// h1 has a (ok), b (drift), and a host-only extra x1.
// h2 has a (ok), no b (→ add), and a different host-only extra x2.
const h1 = stub("h1", "Host One", {
  a: { command: "a" },
  b: { command: "z" },
  x1: { command: "e" },
});
const h2 = stub("h2", "Host Two", { a: { command: "a" }, x2: { command: "e" } });

describe("buildMatrix", () => {
  const m = buildMatrix(canonical, [h1, h2]);

  it("lists the sorted union of servers across all hosts (incl. host-only extras)", () => {
    expect(m.servers).toEqual(["a", "b", "off", "x1", "x2"]);
  });

  it("carries host id + label as columns, in order", () => {
    expect(m.hosts).toEqual([
      { id: "h1", label: "Host One" },
      { id: "h2", label: "Host Two" },
    ]);
  });

  it("resolves each cell's status per (server, host)", () => {
    expect(m.statusAt("a", "h1")).toBe("ok");
    expect(m.statusAt("a", "h2")).toBe("ok");
    expect(m.statusAt("b", "h1")).toBe("drift");
    expect(m.statusAt("b", "h2")).toBe("add"); // canonical, absent on h2
    expect(m.statusAt("off", "h1")).toBe("off");
    expect(m.statusAt("x1", "h1")).toBe("extra");
    expect(m.statusAt("x2", "h2")).toBe("extra");
  });

  it("returns undefined for an absent cell (host-only server on the other host)", () => {
    expect(m.statusAt("x1", "h2")).toBeUndefined();
    expect(m.statusAt("x2", "h1")).toBeUndefined();
    expect(m.statusAt("nope", "h1")).toBeUndefined();
  });

  it("handles zero hosts", () => {
    const empty = buildMatrix(canonical, []);
    expect(empty.hosts).toEqual([]);
    expect(empty.servers).toEqual([]);
  });
});

describe("statusTone", () => {
  it.each([
    ["ok", "ok"],
    ["drift", "warn"],
    ["extra", "danger"],
    ["add", "faint"],
    ["off", "muted"],
    ["skip", "muted"],
  ] as const)("%s → %s", (status, tone) => {
    expect(statusTone(status as ServerStatus)).toBe(tone);
  });
});

describe("cellText", () => {
  it("renders the status glyph, or · for an absent cell", () => {
    expect(cellText("ok")).toBe("✓");
    expect(cellText("drift")).toBe("drift");
    expect(cellText(undefined)).toBe("·");
  });
});

describe("clampIndex", () => {
  it("clamps into [0, len-1] and returns 0 for an empty list", () => {
    expect(clampIndex(-3, 5)).toBe(0);
    expect(clampIndex(9, 5)).toBe(4);
    expect(clampIndex(2, 5)).toBe(2);
    expect(clampIndex(3, 0)).toBe(0);
  });
});
