import { describe, expect, it } from "vitest";
import { normalize } from "../src/core/canonical.js";
import { diffHost, statusOf } from "../src/core/diff.js";
import type { HostAdapter } from "../src/core/hosts/types.js";
import type { McpServer } from "../src/core/schema.js";

/** Minimal host stub: drift is a command-only compare; `skip` names are skipped. */
function stub(raw: Record<string, unknown>, skip: string[] = []): HostAdapter {
  return {
    id: "h",
    label: "H",
    configPath: "/x",
    restart: "",
    capabilities: { mechanism: "file", http: true, env: true, project: false },
    detect: () => true,
    readRaw: () => raw,
    read: () => [],
    toNative: (s: McpServer) => s,
    matches: (canon: McpServer, r: unknown) =>
      JSON.stringify({ command: canon.command }) === JSON.stringify(r),
    willSkip: (n: string) => skip.includes(n),
    write: () => ({ changed: false }),
    remove: () => ({ changed: false }),
  };
}

const canonical: Record<string, McpServer> = {
  ok: normalize({ command: "a" }, "ok"),
  drift: normalize({ command: "a" }, "drift"),
  add: normalize({ command: "a" }, "add"),
  off: normalize({ command: "a", enabled: false }, "off"),
  skip: normalize({ command: "a" }, "skip"),
};
const raw = { ok: { command: "a" }, drift: { command: "b" }, extra: { command: "c" } };

describe("statusOf", () => {
  const host = stub(raw, ["skip"]);
  it.each([
    ["ok", "ok"],
    ["drift", "drift"],
    ["add", "add"],
    ["off", "off"],
    ["skip", "skip"],
    ["extra", "extra"],
  ] as const)("%s → %s", (name, expected) => {
    expect(statusOf(host, name, canonical, raw)).toBe(expected);
  });
});

describe("diffHost", () => {
  it("covers the union of canonical and host servers, sorted", () => {
    const diff = diffHost(stub(raw, ["skip"]), canonical);
    expect(diff.entries.map((e) => e.name)).toEqual(["add", "drift", "extra", "off", "ok", "skip"]);
    expect(Object.fromEntries(diff.entries.map((e) => [e.name, e.status]))).toMatchObject({
      add: "add",
      drift: "drift",
      extra: "extra",
      off: "off",
      ok: "ok",
      skip: "skip",
    });
  });
});
