import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveTargets } from "../src/commands/write-hosts.js";
import { normalize } from "../src/core/canonical.js";
import { PROJECT_HOST_IDS, projectHosts } from "../src/core/hosts/index.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mcpsync-scope-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("projectHosts", () => {
  it("returns cursor + warp + opencode bound to <cwd>-relative paths", () => {
    const hosts = projectHosts(dir);
    expect(hosts.map((h) => h.id)).toEqual([...PROJECT_HOST_IDS]);
    expect(hosts[0]?.configPath).toBe(join(dir, ".cursor", "mcp.json"));
    expect(hosts[1]?.configPath).toBe(join(dir, ".warp", ".mcp.json"));
    expect(hosts[2]?.configPath).toBe(join(dir, "opencode.json"));
    // Never a home path.
    for (const h of hosts) expect(h.configPath.startsWith(homedir())).toBe(false);
  });
});

describe("resolveTargets (scope)", () => {
  it("project + all → the project host set", () => {
    expect(resolveTargets("all", "project", dir).map((h) => h.id)).toEqual([...PROJECT_HOST_IDS]);
  });

  it("project + a project host → just that host", () => {
    expect(resolveTargets("cursor", "project", dir).map((h) => h.id)).toEqual(["cursor"]);
  });

  it("project + a non-project host → none (command reports the reason)", () => {
    expect(resolveTargets("codex", "project", dir)).toEqual([]);
    expect(resolveTargets("claude-desktop", "project", dir)).toEqual([]);
  });
});

describe("project apply write path", () => {
  it("writes repo-local files, never ~, with ${VAR} preserved verbatim", () => {
    const server = normalize({ command: "node", env: { TOK: "${GITHUB_TOKEN}" } }, "gh");
    const [cursor, warp] = projectHosts(dir);

    cursor?.write([server], { dryRun: false, prune: false });
    warp?.write([server], { dryRun: false, prune: false });

    const cursorPath = join(dir, ".cursor", "mcp.json");
    const warpPath = join(dir, ".warp", ".mcp.json");
    expect(existsSync(cursorPath)).toBe(true);
    expect(existsSync(warpPath)).toBe(true);

    const text = readFileSync(cursorPath, "utf8");
    // The placeholder passes through untouched — never resolved into the file.
    expect(text).toContain("${GITHUB_TOKEN}");
    expect(JSON.parse(text).mcpServers.gh.env.TOK).toBe("${GITHUB_TOKEN}");
  });

  it("opencode project host writes <cwd>/opencode.json in the opencode shape", () => {
    const server = normalize({ command: "node", env: { TOK: "${GITHUB_TOKEN}" } }, "gh");
    const opencode = projectHosts(dir)[2];

    opencode?.write([server], { dryRun: false, prune: false });

    const path = join(dir, "opencode.json");
    expect(existsSync(path)).toBe(true);
    const doc = JSON.parse(readFileSync(path, "utf8"));
    // opencode's outlier shape: mcp key, command[], environment, {env:VAR}.
    expect(doc.mcp.gh.command).toEqual(["node"]);
    expect(doc.mcp.gh.environment.TOK).toBe("{env:GITHUB_TOKEN}");
    expect(doc.$schema).toBe("https://opencode.ai/config.json");
  });

  it("opencode project write preserves sibling top-level keys (render.js parity)", () => {
    const path = join(dir, "opencode.json");
    const opencode = projectHosts(dir)[2];
    const first = normalize({ command: "node" }, "a");
    opencode?.write([first], { dryRun: false, prune: false });
    const withExtras = JSON.parse(readFileSync(path, "utf8"));
    withExtras.theme = "custom";
    writeFileSync(path, `${JSON.stringify(withExtras, null, 2)}\n`);

    opencode?.write([normalize({ command: "deno" }, "b")], { dryRun: false, prune: false });
    const doc = JSON.parse(readFileSync(path, "utf8"));
    expect(doc.theme).toBe("custom");
    expect(Object.keys(doc.mcp).sort()).toEqual(["a", "b"]);
  });
});
