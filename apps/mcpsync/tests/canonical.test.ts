import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  normalize,
  readCanonical,
  readRawJson,
  readRawJsonStrict,
  toCanonicalEntry,
  writeCanonical,
} from "../src/core/canonical.js";
import { McpServerSchema } from "../src/core/schema.js";

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mcpsync-canon-"));
  path = join(dir, ".mcp.json");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("normalize", () => {
  it("defaults a bare stdio server", () => {
    const s = normalize({ command: "node", args: ["x.js"] }, "srv");
    expect(s).toMatchObject({
      name: "srv",
      transport: "stdio",
      command: "node",
      args: ["x.js"],
      enabled: true,
      scope: "user",
    });
  });

  it("infers http from a url and sse from type", () => {
    expect(normalize({ url: "https://a" }, "a").transport).toBe("http");
    expect(normalize({ type: "sse", url: "https://b" }, "b").transport).toBe("sse");
    expect(normalize({ transport: "http", url: "https://c" }, "c").transport).toBe("http");
  });

  it("falls back from `environment` to env", () => {
    expect(normalize({ command: "x", environment: { A: "1" } }, "e").env).toEqual({ A: "1" });
  });

  it("produces a value that re-parses under the schema", () => {
    expect(() => McpServerSchema.parse(normalize({ command: "x" }, "n"))).not.toThrow();
  });
});

describe("toCanonicalEntry", () => {
  it("strips defaults and empties so the on-disk entry stays terse", () => {
    const s = normalize({ command: "node", args: [], env: {} }, "srv");
    expect(toCanonicalEntry(s)).toEqual({ command: "node" });
  });

  it("keeps non-default transport, disabled flag, and project scope", () => {
    const s = normalize(
      { transport: "http", url: "https://a", enabled: false, scope: "project" },
      "a",
    );
    expect(toCanonicalEntry(s)).toEqual({
      transport: "http",
      url: "https://a",
      enabled: false,
      scope: "project",
    });
  });
});

describe("readCanonical / writeCanonical", () => {
  it("round-trips a manifest through disk", () => {
    writeFileSync(
      path,
      JSON.stringify({ mcpServers: { srv: { command: "node", args: ["x.js"] } } }),
    );
    const loaded = readCanonical(path);
    expect(loaded.srv?.command).toBe("node");
    const result = writeCanonical(loaded, path);
    expect(result.changed).toBe(false); // terse round-trip is stable
    expect(readCanonical(path).srv?.args).toEqual(["x.js"]);
  });

  it("preserves non-mcpServers top-level keys and backs up before overwrite", () => {
    writeFileSync(path, JSON.stringify({ other: 1, mcpServers: {} }));
    const result = writeCanonical({ srv: normalize({ command: "node" }, "srv") }, path);
    expect(result.changed).toBe(true);
    expect(result.backup).toBeTruthy();
    expect(existsSync(result.backup as string)).toBe(true);
    const doc = readRawJson(path);
    expect(doc.other).toBe(1);
    expect((doc.mcpServers as Record<string, unknown>).srv).toEqual({ command: "node" });
  });

  it("does not write on a dry run", () => {
    writeCanonical({ srv: normalize({ command: "node" }, "srv") }, path, { dryRun: true });
    expect(existsSync(path)).toBe(false);
  });
});

describe("readRawJsonStrict (write-path reads)", () => {
  it("returns {} for a missing or empty file (fresh start)", () => {
    expect(readRawJsonStrict(join(dir, "nope.json"))).toEqual({});
    writeFileSync(path, "  \n");
    expect(readRawJsonStrict(path)).toEqual({});
  });

  it("throws on corrupt JSON instead of silently returning {}", () => {
    writeFileSync(path, "{ not json");
    expect(() => readRawJsonStrict(path)).toThrow(/refusing to overwrite/);
    // …while the read-path helper stays lenient:
    expect(readRawJson(path)).toEqual({});
  });

  it("throws on a non-object document", () => {
    writeFileSync(path, "[1,2]");
    expect(() => readRawJsonStrict(path)).toThrow(/not a JSON object/);
  });

  it("writeCanonical refuses a corrupt file (no silent key discard, file untouched)", () => {
    writeFileSync(path, "{ corrupt");
    expect(() => writeCanonical({ srv: normalize({ command: "node" }, "srv") }, path)).toThrow(
      /refusing to overwrite/,
    );
    expect(readFileSync(path, "utf8")).toBe("{ corrupt"); // byte-untouched
  });
});
