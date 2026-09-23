/**
 * Tests for the `add-mcp-app` command — the helpers
 * (assertInsideScaffoldedRepo, detectScope, writePerAppAgentFiles) and the
 * 08-app migration's collision guard under mode='add'.
 */

import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertInsideScaffoldedRepo,
  detectScope,
  staleCiFilterWarning,
  writePerAppAgentFiles,
} from "../src/commands/add-mcp-app.js";
import { Config } from "../src/core/config.js";
import { makeFs } from "../src/core/fs.js";
import { makeGit } from "../src/core/git.js";
import { makeLogger } from "../src/core/logger.js";
import type { MigrationContext } from "../src/core/migration.js";
import { makeShell } from "../src/core/shell.js";
import { inspectTarget } from "../src/core/target-inspection.js";
import M1AppPort from "../src/phases/08-app/m1-app-port.js";

/**
 * An existing scaffolded repo with one app at apps/<appDir>/. The default
 * models every repo generated before names went verbatim (`foo-mcp`);
 * pass a suffix-less dir to model one generated since.
 */
async function makeScaffoldedRepoSkeleton(
  scope = "@acme",
  appDir = "foo-mcp",
  { marked = true }: { marked?: boolean } = {},
) {
  const cwd = await mkdtemp(join(tmpdir(), "scaffolder-add-test-"));
  await writeFile(join(cwd, "pnpm-workspace.yaml"), 'packages:\n  - "apps/*"\n');
  await mkdir(join(cwd, "apps", appDir), { recursive: true });
  await writeFile(
    join(cwd, "apps", appDir, "package.json"),
    JSON.stringify(
      {
        name: `${scope}/${appDir}`,
        version: "0.0.0",
        dependencies: {
          [`${scope}/robustness`]: "workspace:*",
          ...(marked ? { "@george43g/mcp-kit": "^2.0.0" } : {}),
        },
      },
      null,
      2,
    ),
  );
  return cwd;
}

async function makeAddCtx(cwd: string, name: string, scope: string) {
  const log = makeLogger({ verbose: false });
  const shell = makeShell({ cwd, dryRun: false });
  const fs = makeFs({ cwd, dryRun: false, force: true });
  const git = makeGit(shell);
  const config = new Config();
  config.global.repoName.set(name);
  config.global.scope.set(scope);
  config.global.mode.set("add");
  config.global.packageManager.set("pnpm");
  config.global.monorepo.set(true);
  const ctx: MigrationContext = {
    config,
    cwd,
    target: await inspectTarget({
      cwd,
      mode: "add",
      explicitName: name,
      explicitPackageManager: "pnpm",
    }),
    mode: "add",
    existingStrategy: "safe",
    explicitMigration: true,
    shell,
    fs,
    git,
    log,
    dryRun: false,
    force: true,
  };
  return { fs, log, ctx };
}

let trashCans: string[] = [];
beforeEach(() => {
  trashCans = [];
});
afterEach(async () => {
  for (const dir of trashCans) await rm(dir, { recursive: true, force: true });
});

describe("assertInsideScaffoldedRepo()", () => {
  it("passes when the dir looks like a scaffolded monorepo", async () => {
    const cwd = await makeScaffoldedRepoSkeleton();
    trashCans.push(cwd);
    expect(() => assertInsideScaffoldedRepo(cwd)).not.toThrow();
  });

  it("throws if pnpm-workspace.yaml is missing", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "scaffolder-add-test-"));
    trashCans.push(cwd);
    expect(() => assertInsideScaffoldedRepo(cwd)).toThrow(/Not a scaffolded repo/);
  });

  // A repo is recognised by what its apps ARE, not what they are called: a
  // repo whose only app lacks the -mcp suffix is still a scaffolded repo.
  it("passes when the only app has no -mcp suffix", async () => {
    const cwd = await makeScaffoldedRepoSkeleton("@acme", "tmux-control");
    trashCans.push(cwd);
    expect(() => assertInsideScaffoldedRepo(cwd)).not.toThrow();
  });

  it("passes on a scoped app that does not depend on mcp-kit", async () => {
    const cwd = await makeScaffoldedRepoSkeleton("@acme", "web", { marked: false });
    trashCans.push(cwd);
    expect(() => assertInsideScaffoldedRepo(cwd)).not.toThrow();
  });

  it("throws if apps/ has no app workspace", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "scaffolder-add-test-"));
    trashCans.push(cwd);
    await writeFile(join(cwd, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
    await mkdir(join(cwd, "apps", "stray-mcp"), { recursive: true });
    expect(() => assertInsideScaffoldedRepo(cwd)).toThrow(/no app workspace/);
  });

  it("throws if the only app workspace is unscoped and unmarked", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "scaffolder-add-test-"));
    trashCans.push(cwd);
    await writeFile(join(cwd, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
    await mkdir(join(cwd, "apps", "loose-mcp"), { recursive: true });
    await writeFile(join(cwd, "apps", "loose-mcp", "package.json"), '{"name":"loose-mcp"}');
    expect(() => assertInsideScaffoldedRepo(cwd)).toThrow(/no app workspace/);
  });
});

describe("detectScope()", () => {
  it("parses the scope from an app with no -mcp suffix", async () => {
    const cwd = await makeScaffoldedRepoSkeleton("@acme", "tmux-control");
    trashCans.push(cwd);
    expect(detectScope(cwd)).toBe("@acme");
  });

  it("prefers an MCP app's scope over another scoped app's", async () => {
    const cwd = await makeScaffoldedRepoSkeleton("@mcp-side", "zeta");
    trashCans.push(cwd);
    await mkdir(join(cwd, "apps", "alpha"), { recursive: true });
    await writeFile(join(cwd, "apps", "alpha", "package.json"), '{"name":"@other/alpha"}');
    expect(detectScope(cwd)).toBe("@mcp-side");
  });

  it("parses the npm scope out of the first apps/*-mcp/package.json", async () => {
    const cwd = await makeScaffoldedRepoSkeleton("@acme", "foo-mcp");
    trashCans.push(cwd);
    expect(detectScope(cwd)).toBe("@acme");
  });

  it("throws if no app exposes a scoped name", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "scaffolder-add-test-"));
    trashCans.push(cwd);
    await writeFile(join(cwd, "pnpm-workspace.yaml"), "");
    await mkdir(join(cwd, "apps", "unscoped-mcp"), { recursive: true });
    await writeFile(
      join(cwd, "apps", "unscoped-mcp", "package.json"),
      JSON.stringify({ name: "unscoped-mcp" }),
    );
    expect(() => detectScope(cwd)).toThrow(/Couldn't detect npm scope/);
  });
});

describe("08-app/m1-app-port collision guard in add mode", () => {
  it("writes apps/<name>/ verbatim — no suffix appended", async () => {
    const cwd = await makeScaffoldedRepoSkeleton("@acme", "foo-mcp");
    trashCans.push(cwd);
    const { ctx } = await makeAddCtx(cwd, "bar", "@acme");
    const result = await new M1AppPort().apply(ctx);
    expect(result.status).toBe("applied");
    expect(existsSync(join(cwd, "apps", "bar-mcp"))).toBe(false);
    const pkg = JSON.parse(await readFile(join(cwd, "apps", "bar", "package.json"), "utf8"));
    expect(pkg.name).toBe("@acme/bar");
    expect(Object.keys(pkg.bin)).toEqual(["bar"]);
  });

  it("keeps a -mcp suffix the user typed", async () => {
    const cwd = await makeScaffoldedRepoSkeleton("@acme", "foo-mcp");
    trashCans.push(cwd);
    const { ctx } = await makeAddCtx(cwd, "bar-mcp", "@acme");
    const result = await new M1AppPort().apply(ctx);
    expect(result.status).toBe("applied");
    const pkg = JSON.parse(await readFile(join(cwd, "apps", "bar-mcp", "package.json"), "utf8"));
    expect(pkg.name).toBe("@acme/bar-mcp");
    expect(Object.keys(pkg.bin)).toEqual(["bar-mcp"]);
  });

  it("fails with a clear message when apps/<name>/ already exists", async () => {
    const cwd = await makeScaffoldedRepoSkeleton("@acme", "foo-mcp");
    trashCans.push(cwd);
    const { ctx } = await makeAddCtx(cwd, "foo-mcp", "@acme");
    const result = await new M1AppPort().apply(ctx);
    expect(result.status).toBe("failed");
    expect(result.error?.message).toMatch(/Refusing to overwrite/);
  });

  it("is skipped (not run) in apply/existing mode by shouldRun", async () => {
    const cwd = await makeScaffoldedRepoSkeleton("@acme", "foo-mcp");
    trashCans.push(cwd);
    const { ctx } = await makeAddCtx(cwd, "bar", "@acme");
    // Override mode to 'existing' to confirm shouldRun returns false.
    ctx.mode = "existing";
    const migration = new M1AppPort();
    expect(await migration.shouldRun?.(ctx)).toBe(false);
  });
});

describe("writePerAppAgentFiles()", () => {
  it("writes .cursor/rules/<name>.mdc with substituted content + appends to .mcp.json", async () => {
    const cwd = await makeScaffoldedRepoSkeleton("@acme", "foo-mcp");
    trashCans.push(cwd);
    // Seed a baseline .mcp.json with only the first app's dev entry.
    await writeFile(
      join(cwd, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          "foo-mcp-dev": { command: "pnpm" },
        },
      }),
    );
    const { fs, log } = await makeAddCtx(cwd, "bar", "@acme");
    const result = await writePerAppAgentFiles({ fs, cwd, name: "bar", scope: "@acme", log });
    expect(result.filesChanged).toContain(".cursor/rules/bar.mdc");
    expect(result.filesChanged).toContain(".mcp.json");
    expect(existsSync(join(cwd, ".cursor/rules/bar.mdc"))).toBe(true);
    const mdc = await readFile(join(cwd, ".cursor/rules/bar.mdc"), "utf8");
    // Substitution replaces "example-repo" → "bar". Sanity-check that the
    // descriptor mentions the new name.
    expect(mdc).toMatch(/bar project conventions/);
    const mcp = JSON.parse(await readFile(join(cwd, ".mcp.json"), "utf8"));
    // The dev-server key is `<app>-dev`, the app's name verbatim.
    expect(Object.keys(mcp.mcpServers).sort()).toEqual(["bar-dev", "foo-mcp-dev"]);
    expect(mcp.mcpServers["bar-dev"].args[1]).toBe("apps/bar/scripts/mcp-dev-proxy.ts");
    expect(mcp.mcpServers["bar-dev"].env.MCP_DEV_ENTRY).toBe("apps/bar/src/index.ts");
  });

  it("keys a -mcp app's dev server as <name>-dev, never doubling the suffix", async () => {
    const cwd = await makeScaffoldedRepoSkeleton("@acme", "foo-mcp");
    trashCans.push(cwd);
    await writeFile(join(cwd, ".mcp.json"), JSON.stringify({ mcpServers: {} }));
    const { fs, log } = await makeAddCtx(cwd, "bar-mcp", "@acme");
    await writePerAppAgentFiles({ fs, cwd, name: "bar-mcp", scope: "@acme", log });
    const mcp = JSON.parse(await readFile(join(cwd, ".mcp.json"), "utf8"));
    expect(Object.keys(mcp.mcpServers)).toEqual(["bar-mcp-dev"]);
    expect(mcp.mcpServers["bar-mcp-dev"].env.MCP_DEV_WATCH_DIR).toBe("apps/bar-mcp/src");
  });

  it("skips .mcp.json when the file is missing (with a note, no throw)", async () => {
    const cwd = await makeScaffoldedRepoSkeleton("@acme", "foo-mcp");
    trashCans.push(cwd);
    const { fs, log } = await makeAddCtx(cwd, "bar", "@acme");
    const result = await writePerAppAgentFiles({ fs, cwd, name: "bar", scope: "@acme", log });
    expect(result.filesChanged).toContain(".cursor/rules/bar.mdc");
    expect(result.filesChanged).not.toContain(".mcp.json");
    expect(result.notes.some((n) => n.includes(".mcp.json missing"))).toBe(true);
  });

  it("leaves an existing matching mcpServers entry untouched", async () => {
    const cwd = await makeScaffoldedRepoSkeleton("@acme", "foo-mcp");
    trashCans.push(cwd);
    await writeFile(
      join(cwd, ".mcp.json"),
      JSON.stringify({
        mcpServers: { "bar-dev": { command: "custom" } },
      }),
    );
    const { fs, log } = await makeAddCtx(cwd, "bar", "@acme");
    const result = await writePerAppAgentFiles({ fs, cwd, name: "bar", scope: "@acme", log });
    expect(result.filesChanged).not.toContain(".mcp.json");
    expect(result.notes.some((n) => n.includes("already has"))).toBe(true);
    const mcp = JSON.parse(await readFile(join(cwd, ".mcp.json"), "utf8"));
    expect(mcp.mcpServers["bar-dev"].command).toBe("custom");
  });
});

// A repo generated before the gates were derived from the mcp-kit marker still
// has a ci.yml that selects apps with `pnpm --filter "<scope>/*-mcp"`. An app
// added there without the suffix is silently ungated (green, unchecked).
describe("staleCiFilterWarning()", () => {
  const OLD_CI = [
    '      - run: pnpm --filter "@acme/*-mcp" check:usage',
    "      - run: pnpm --filter '@acme/*-mcp' stress",
    "",
  ].join("\n");

  async function repoWithCi(ci: string | undefined) {
    const cwd = await makeScaffoldedRepoSkeleton("@acme", "foo-mcp");
    trashCans.push(cwd);
    if (ci !== undefined) {
      await mkdir(join(cwd, ".github", "workflows"), { recursive: true });
      await writeFile(join(cwd, ".github", "workflows", "ci.yml"), ci);
    }
    return cwd;
  }

  it("warns, naming the file and the fix, for a suffix-less app under an old filter", async () => {
    const cwd = await repoWithCi(OLD_CI);
    const warning = staleCiFilterWarning(cwd, "bar", "@acme");
    expect(warning).toBeDefined();
    expect(warning).toContain(".github/workflows/ci.yml");
    expect(warning).toContain("@acme/bar");
    expect(warning).toMatch(/--filter @acme\/bar/);
  });

  it("is silent when the new app keeps the -mcp suffix — the old filter matches it", async () => {
    const cwd = await repoWithCi(OLD_CI);
    expect(staleCiFilterWarning(cwd, "bar-mcp", "@acme")).toBeUndefined();
  });

  it("is silent when ci.yml already selects apps by the mcp-kit marker", async () => {
    const cwd = await repoWithCi("      - run: node scripts/for-each-mcp-app.mjs stress\n");
    expect(staleCiFilterWarning(cwd, "bar", "@acme")).toBeUndefined();
  });

  it("is silent when there is no ci.yml", async () => {
    const cwd = await repoWithCi(undefined);
    expect(staleCiFilterWarning(cwd, "bar", "@acme")).toBeUndefined();
  });
});
