import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalize } from "../src/core/canonical.js";
import { buildClaudeAdd, buildClaudeRemove, cliAdapter } from "../src/core/hosts/cli-adapter.js";

describe("buildClaudeAdd / buildClaudeRemove", () => {
  it("builds a stdio add with env and a -- separator", () => {
    expect(
      buildClaudeAdd(normalize({ command: "node", args: ["srv.js"], env: { K: "${K}" } }, "srv")),
    ).toEqual(["mcp", "add", "--scope", "user", "srv", "-e", "K=${K}", "--", "node", "srv.js"]);
  });

  it("builds an http add with --transport and headers", () => {
    expect(
      buildClaudeAdd(
        normalize({ url: "https://a/mcp", headers: { Authorization: "Bearer ${T}" } }, "svc"),
      ),
    ).toEqual([
      "mcp",
      "add",
      "--scope",
      "user",
      "--transport",
      "http",
      "svc",
      "https://a/mcp",
      "--header",
      "Authorization: Bearer ${T}",
    ]);
  });

  it("builds a user-scope remove", () => {
    expect(buildClaudeRemove("svc")).toEqual(["mcp", "remove", "-s", "user", "svc"]);
  });
});

describe("cliAdapter", () => {
  let dir: string;
  let readPath: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mcpsync-cli-"));
    readPath = join(dir, "claude.json");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const make = () =>
    cliAdapter({ id: "claude-code", label: "Claude Code", bin: "claude", readPath, restart: "" });

  it("reads user-scope mcpServers from the source file", () => {
    writeFileSync(
      readPath,
      JSON.stringify({ mcpServers: { a: { command: "x", args: [] } }, projects: {} }),
    );
    expect(
      make()
        .read()
        .map((s) => s.name),
    ).toEqual(["a"]);
  });

  it("matches leniently on type (stdio omits it; remote may be http/undefined)", () => {
    const a = make();
    expect(a.matches(normalize({ command: "x", args: [] }, "a"), { command: "x", args: [] })).toBe(
      true,
    );
    expect(a.matches(normalize({ command: "x" }, "a"), { command: "y" })).toBe(false);
    expect(a.matches(normalize({ url: "https://u" }, "a"), { url: "https://u" })).toBe(true); // type undefined ok
  });

  it("dry-run write plans remove-extraneous + skip-matched + re-add-drifted, executing nothing", () => {
    writeFileSync(
      readPath,
      JSON.stringify({
        mcpServers: {
          keep: { command: "x", args: [] },
          drift: { command: "old", args: [] },
          gone: { command: "z", args: [] },
        },
      }),
    );
    const r = make().write(
      [
        normalize({ command: "x", args: [] }, "keep"),
        normalize({ command: "new", args: [] }, "drift"),
      ],
      { dryRun: true, prune: true },
    );
    const cmds = (r.commands ?? []).join("\n");
    expect(cmds).toContain("claude mcp remove -s user gone"); // extraneous pruned
    expect(cmds).not.toContain("keep"); // already in sync → skipped
    expect(cmds).toContain("claude mcp remove -s user drift"); // drift re-added
    expect(cmds).toContain("claude mcp add --scope user drift -- new");
    expect(r.backup).toBeNull(); // CLI owns the file
  });
});
