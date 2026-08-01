import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalize } from "../src/core/canonical.js";
import { opencodeAdapter, toOpencode } from "../src/core/hosts/opencode-adapter.js";

let dir: string;
let path: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mcpsync-oc-"));
  path = join(dir, "opencode.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("toOpencode", () => {
  it("emits a local server with a command array, environment, and {env:VAR}", () => {
    expect(
      toOpencode(normalize({ command: "npx", args: ["-y", "srv"], env: { K: "${K}" } }, "s")),
    ).toEqual({
      type: "local",
      command: ["npx", "-y", "srv"],
      enabled: true,
      environment: { K: "{env:K}" },
    });
  });

  it("emits a remote server with type/url/enabled and mapped headers", () => {
    expect(
      toOpencode(normalize({ url: "https://a", headers: { Authorization: "Bearer ${T}" } }, "s")),
    ).toEqual({
      type: "remote",
      url: "https://a",
      enabled: true,
      headers: { Authorization: "Bearer {env:T}" },
    });
  });
});

describe("opencodeAdapter", () => {
  it("round-trips local + remote through write→read ({env:VAR}↔${VAR})", () => {
    opencodeAdapter(path).write(
      [
        normalize({ command: "npx", args: ["srv"], env: { K: "${K}" } }, "l"),
        normalize({ url: "https://a", headers: { Authorization: "Bearer ${T}" } }, "r"),
      ],
      { prune: true },
    );
    const read = Object.fromEntries(
      opencodeAdapter(path)
        .read()
        .map((s) => [s.name, s]),
    );
    expect(read.l?.env).toEqual({ K: "${K}" });
    expect(read.r?.transport).toBe("http");
    expect(read.r?.headers).toEqual({ Authorization: "Bearer ${T}" });
  });

  it("preserves $schema and other top-level keys; merge keeps siblings, prune replaces", () => {
    writeFileSync(
      path,
      JSON.stringify({
        $schema: "https://opencode.ai/config.json",
        theme: "x",
        mcp: { keep: { type: "local", command: ["a"], enabled: true } },
      }),
    );
    opencodeAdapter(path).write([normalize({ command: "b" }, "add")], { prune: false });
    let doc = JSON.parse(readFileSync(path, "utf8"));
    expect(doc.theme).toBe("x");
    expect(doc.$schema).toBe("https://opencode.ai/config.json");
    expect(Object.keys(doc.mcp).sort()).toEqual(["add", "keep"]);
    opencodeAdapter(path).write([normalize({ command: "b" }, "add")], { prune: true });
    doc = JSON.parse(readFileSync(path, "utf8"));
    expect(Object.keys(doc.mcp)).toEqual(["add"]);
    expect(doc.theme).toBe("x"); // untouched even on prune
  });
});
