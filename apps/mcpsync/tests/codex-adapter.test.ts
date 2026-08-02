import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalize } from "../src/core/canonical.js";
import { codexAdapter, toCodexTable } from "../src/core/hosts/codex-adapter.js";
import { BLOCK_BEGIN, BLOCK_END, parseManagedTables } from "../src/core/toml.js";

let dir: string;
let path: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mcpsync-codex-"));
  path = join(dir, "config.toml");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("toCodexTable", () => {
  it("keeps only ${K}-passthrough env as env_vars, notes the rest", () => {
    const { table, notes } = toCodexTable(
      normalize(
        {
          command: "npx",
          args: ["firecrawl-mcp"],
          env: { FIRECRAWL_API_KEY: "${FIRECRAWL_API_KEY}", LIT: "x" },
        },
        "firecrawl",
      ),
    );
    expect(table).toEqual({
      command: "npx",
      args: ["firecrawl-mcp"],
      env_vars: ["FIRECRAWL_API_KEY"],
    });
    expect(notes.join()).toContain("LIT");
  });

  it("maps a Bearer ${VAR} header to bearer_token_env_var", () => {
    const { table } = toCodexTable(
      normalize({ url: "https://a", headers: { Authorization: "Bearer ${GH}" } }, "github"),
    );
    expect(table).toEqual({ url: "https://a", bearer_token_env_var: "GH" });
  });

  it("notes a non-Bearer header instead of emitting it", () => {
    const { table, notes } = toCodexTable(
      normalize({ url: "https://a", headers: { "X-Key": "${K}" } }, "svc"),
    );
    expect(table).toEqual({ url: "https://a" });
    expect(notes.join()).toContain("non-Bearer");
  });
});

describe("codexAdapter", () => {
  const seed = () =>
    writeFileSync(
      path,
      `[profile]\nx = 1\n\n${BLOCK_BEGIN}\n[mcp_servers.memory]\ncommand = "npx"\n${BLOCK_END}\n\n[mcp_servers.context7]\nurl = "https://ctx"\n`,
    );

  it("skips servers defined outside the managed block", () => {
    seed();
    const r = codexAdapter(path).write(
      [normalize({ command: "npx" }, "memory"), normalize({ url: "https://ctx" }, "context7")],
      { prune: true },
    );
    expect(r.skipped).toEqual(["context7"]);
    const text = readFileSync(path, "utf8");
    expect(text).toContain("[mcp_servers.memory]");
    // context7 stays defined out-of-block, untouched, not duplicated in the block
    expect(text.match(/\[mcp_servers\.context7\]/g)?.length).toBe(1);
  });

  it("merge (prune:false) keeps existing managed servers; full sync drops them", () => {
    seed();
    codexAdapter(path).write([normalize({ command: "uvx", args: ["s"] }, "extra")], {
      prune: false,
    });
    expect(Object.keys(parseManagedTables(readFileSync(path, "utf8"))).sort()).toEqual([
      "extra",
      "memory",
    ]);
    codexAdapter(path).write([normalize({ command: "uvx", args: ["s"] }, "extra")], {
      prune: true,
    });
    expect(Object.keys(parseManagedTables(readFileSync(path, "utf8")))).toEqual(["extra"]);
  });

  it("round-trips env_vars and bearer through write→read", () => {
    codexAdapter(path).write(
      [
        normalize({ command: "npx", env: { K: "${K}" } }, "e"),
        normalize({ url: "https://a", headers: { Authorization: "Bearer ${T}" } }, "r"),
      ],
      { prune: true },
    );
    const read = Object.fromEntries(
      codexAdapter(path)
        .read()
        .map((s) => [s.name, s]),
    );
    expect(read.e?.env).toEqual({ K: "${K}" });
    expect(read.r?.transport).toBe("http");
    expect(read.r?.headers).toEqual({ Authorization: "Bearer ${T}" });
  });

  it("willSkip reflects out-of-block definitions; preserves other TOML", () => {
    seed();
    const a = codexAdapter(path);
    expect(a.willSkip?.("context7")).toBe(true);
    expect(a.willSkip?.("memory")).toBe(false);
    a.write([normalize({ command: "npx" }, "memory")], { prune: true });
    expect(readFileSync(path, "utf8")).toContain("[profile]");
  });
});
