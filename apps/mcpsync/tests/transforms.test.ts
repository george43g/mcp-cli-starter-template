import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalize } from "../src/core/canonical.js";
import { toClaudeDesktopServer, toDirectNative } from "../src/core/hosts/json-adapter.js";
import { shdq } from "../src/core/shell-quote.js";

describe("shdq", () => {
  it("escapes backslash, double-quote and backtick but leaves $ active", () => {
    expect(shdq("a")).toBe('"a"');
    expect(shdq('a"b')).toBe('"a\\"b"');
    expect(shdq("a\\b")).toBe('"a\\\\b"');
    expect(shdq("a`b")).toBe('"a\\`b"');
    // $ stays active so ${VAR} expands in the login shell at launch
    expect(shdq("${TOKEN}")).toBe('"${TOKEN}"');
  });
});

describe("toClaudeDesktopServer", () => {
  const prevShell = process.env.SHELL;
  beforeEach(() => {
    process.env.SHELL = "/bin/zsh";
  });
  afterEach(() => {
    if (prevShell === undefined) delete process.env.SHELL;
    else process.env.SHELL = prevShell;
  });

  it("wraps a stdio server in `$SHELL -lc` with env assignments and exec", () => {
    const native = toClaudeDesktopServer(
      normalize({ command: "node", args: ["srv.js"], env: { TOKEN: "${TOKEN}" } }, "srv"),
    );
    expect(native).toEqual({
      command: "/bin/zsh",
      args: ["-lc", 'TOKEN="${TOKEN}" "exec" "node" "srv.js"'],
    });
  });

  it("bridges a remote server through mcp-remote", () => {
    const native = toClaudeDesktopServer(
      normalize({ url: "https://api/mcp", headers: { Authorization: "Bearer ${T}" } }, "r"),
    );
    expect(native).toEqual({
      command: "/bin/zsh",
      args: [
        "-lc",
        '"exec" "npx" "-y" "mcp-remote" "https://api/mcp" "--header" "Authorization: Bearer ${T}"',
      ],
    });
  });

  it("reads $SHELL at call time", () => {
    process.env.SHELL = "/bin/bash";
    expect(toClaudeDesktopServer(normalize({ command: "x" }, "x")).command).toBe("/bin/bash");
  });
});

describe("toDirectNative", () => {
  it("emits a plain stdio shape with ${VAR} verbatim", () => {
    expect(
      toDirectNative(normalize({ command: "node", args: ["x"], env: { A: "${A}" } }, "s")),
    ).toEqual({ command: "node", args: ["x"], env: { A: "${A}" } });
  });

  it("omits empty args and env", () => {
    expect(toDirectNative(normalize({ command: "node" }, "s"))).toEqual({ command: "node" });
  });

  it("emits a remote shape with type + url", () => {
    expect(toDirectNative(normalize({ transport: "http", url: "https://a" }, "s"))).toEqual({
      type: "http",
      url: "https://a",
    });
  });
});
