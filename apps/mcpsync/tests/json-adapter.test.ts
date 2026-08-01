import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalize } from "../src/core/canonical.js";
import {
  jsonMcpServersAdapter,
  toClaudeDesktopServer,
  toDirectNative,
} from "../src/core/hosts/json-adapter.js";
import type { HostAdapter } from "../src/core/hosts/types.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mcpsync-adapter-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const readDoc = (p: string) => JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
const serversOf = (p: string) => readDoc(p).mcpServers as Record<string, unknown>;

function desktopAdapter(configPath: string): HostAdapter {
  return jsonMcpServersAdapter({
    id: "claude-desktop",
    label: "Claude Desktop",
    configPath,
    restart: "restart",
    transform: toClaudeDesktopServer,
    marker: "_mcpManagedByDotfiles",
    capabilities: { mechanism: "file", http: true, env: true, project: false },
  });
}

function cursorAdapter(configPath: string): HostAdapter {
  return jsonMcpServersAdapter({
    id: "cursor",
    label: "Cursor",
    configPath,
    restart: "restart",
    transform: toDirectNative,
    capabilities: { mechanism: "file", http: true, env: true, project: true },
  });
}

describe("direct (cursor/warp) adapter", () => {
  it("merges into mcpServers, preserving siblings and non-mcp keys", () => {
    const p = join(dir, "mcp.json");
    writeFileSync(
      p,
      JSON.stringify({ theme: "dark", mcpServers: { existing: { command: "keep" } } }),
    );
    const r = cursorAdapter(p).write([normalize({ command: "node", args: ["x"] }, "srv")]);
    expect(r.changed).toBe(true);
    const doc = readDoc(p);
    expect(doc.theme).toBe("dark");
    expect(serversOf(p).existing).toEqual({ command: "keep" });
    expect(serversOf(p).srv).toEqual({ command: "node", args: ["x"] });
  });

  it("backs up before overwriting and skips write on a dry run", () => {
    const p = join(dir, "mcp.json");
    writeFileSync(p, JSON.stringify({ mcpServers: {} }));
    const dry = cursorAdapter(p).write([normalize({ command: "node" }, "srv")], { dryRun: true });
    expect(dry.backup).toBeNull();
    expect(serversOf(p)).toEqual({});
    const wet = cursorAdapter(p).write([normalize({ command: "node" }, "srv")]);
    expect(wet.backup).toBeTruthy();
    expect(existsSync(wet.backup as string)).toBe(true);
  });

  it("reports no change when re-applying identical content", () => {
    const p = join(dir, "mcp.json");
    const srv = normalize({ command: "node" }, "srv");
    cursorAdapter(p).write([srv]);
    const again = cursorAdapter(p).write([srv]);
    expect(again.changed).toBe(false);
    expect(again.backup).toBeNull();
  });

  it("surfaces the resolved target when the config path is a symlink", () => {
    const real = join(dir, "real.json");
    const link = join(dir, "link.json");
    writeFileSync(real, JSON.stringify({ mcpServers: {} }));
    symlinkSync(real, link);
    const r = cursorAdapter(link).write([normalize({ command: "node" }, "srv")]);
    expect(r.linkTarget).toBe(realpathSync(real));
    expect(serversOf(real).srv).toBeTruthy(); // write followed the link
  });
});

describe("marker (claude-desktop) adapter — prune safety lever", () => {
  it("merge (prune:false) unions the marker and never deletes managed siblings", () => {
    const p = join(dir, "cd.json");
    desktopAdapter(p).write([normalize({ command: "a" }, "a")], { prune: true }); // seed manage {a}
    desktopAdapter(p).write([normalize({ command: "b" }, "b")], { prune: false }); // add b, keep a
    expect(Object.keys(serversOf(p)).sort()).toEqual(["a", "b"]);
    expect((readDoc(p)._mcpManagedByDotfiles as string[]).sort()).toEqual(["a", "b"]);
  });

  it("full sync (prune:true) deletes previously-managed servers now absent", () => {
    const p = join(dir, "cd.json");
    desktopAdapter(p).write([normalize({ command: "a" }, "a"), normalize({ command: "b" }, "b")], {
      prune: true,
    });
    desktopAdapter(p).write([normalize({ command: "a" }, "a")], { prune: true }); // b dropped
    expect(Object.keys(serversOf(p))).toEqual(["a"]);
    expect(readDoc(p)._mcpManagedByDotfiles).toEqual(["a"]);
  });

  it("preserves UNMANAGED siblings even under a full sync", () => {
    const p = join(dir, "cd.json");
    writeFileSync(p, JSON.stringify({ mcpServers: { "imsg-mcp": { command: "manual" } } }));
    desktopAdapter(p).write([normalize({ command: "a" }, "a")], { prune: true });
    expect(serversOf(p)["imsg-mcp"]).toEqual({ command: "manual" }); // untouched
    expect(readDoc(p)._mcpManagedByDotfiles).toEqual(["a"]);
  });

  it("remove drops the server and its marker entry", () => {
    const p = join(dir, "cd.json");
    desktopAdapter(p).write([normalize({ command: "a" }, "a")], { prune: true });
    const r = desktopAdapter(p).remove("a");
    expect(r.changed).toBe(true);
    expect(serversOf(p).a).toBeUndefined();
    expect(readDoc(p)._mcpManagedByDotfiles).toEqual([]);
  });
});

describe("corrupt existing config", () => {
  it("write refuses (throws) instead of silently rebuilding from {} — file untouched", () => {
    const p = join(dir, "cd.json");
    writeFileSync(p, '{ "globalShortcut": "x", CORRUPT');
    expect(() => desktopAdapter(p).write([normalize({ command: "a" }, "a")])).toThrow(
      /refusing to overwrite/,
    );
    expect(readFileSync(p, "utf8")).toBe('{ "globalShortcut": "x", CORRUPT');
  });

  it("readRaw stays lenient for the drift grid (corrupt → empty, no crash)", () => {
    const p = join(dir, "cd.json");
    writeFileSync(p, "{ CORRUPT");
    expect(desktopAdapter(p).readRaw()).toEqual({});
  });
});
