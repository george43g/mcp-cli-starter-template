import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServerFromFlags, runAdd, splitOnce } from "../src/commands/add.js";
import { runRemove } from "../src/commands/remove.js";
import { readCanonical } from "../src/core/canonical.js";

describe("splitOnce", () => {
  it("splits on the first separator only", () => {
    expect(splitOnce("K=V=1", "=")).toEqual(["K", "V=1"]);
    expect(splitOnce("bare", "=")).toEqual(["bare", ""]);
  });
});

describe("buildServerFromFlags", () => {
  it("builds a stdio server with args and env", () => {
    const s = buildServerFromFlags({ name: "s", command: "node", args: ["x.js"], env: ["K=${K}"] });
    expect(s).toMatchObject({
      name: "s",
      transport: "stdio",
      command: "node",
      args: ["x.js"],
      env: { K: "${K}" },
    });
  });

  it("infers http from --url and parses a header", () => {
    const s = buildServerFromFlags({
      name: "s",
      url: "https://a",
      header: ["Authorization: Bearer ${T}"],
    });
    expect(s).toMatchObject({
      transport: "http",
      url: "https://a",
      headers: { Authorization: "Bearer ${T}" },
    });
  });
});

describe("runAdd / runRemove on the canonical manifest", () => {
  let dir: string;
  let path: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mcpsync-addrm-"));
    path = join(dir, ".mcp.json");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("adds then removes a server, keeping the entry terse on disk", () => {
    runAdd({ name: "srv", command: "node", args: ["x.js"], config: path });
    expect(readCanonical(path).srv?.command).toBe("node");
    // terse: default transport/enabled/scope are not persisted
    expect(readCanonical(path).srv?.args).toEqual(["x.js"]);
  });

  it("removes a server from canonical", async () => {
    runAdd({ name: "srv", command: "node", config: path });
    await runRemove({ name: "srv", config: path });
    expect(readCanonical(path).srv).toBeUndefined();
  });
});
