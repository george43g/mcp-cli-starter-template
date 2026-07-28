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
  detectRuntimeSource,
  detectScope,
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

async function makeScaffoldedRepoSkeleton(scope = "@acme", firstApp = "foo") {
  // Minimum signals assertInsideScaffoldedRepo looks for: pnpm-workspace.yaml,
  // apps/, at least one apps/*-mcp/ subdir with a parseable package.json.
  const cwd = await mkdtemp(join(tmpdir(), "scaffolder-add-test-"));
  await writeFile(join(cwd, "pnpm-workspace.yaml"), 'packages:\n  - "apps/*"\n');
  await mkdir(join(cwd, "apps", `${firstApp}-mcp`), { recursive: true });
  await writeFile(
    join(cwd, "apps", `${firstApp}-mcp`, "package.json"),
    JSON.stringify(
      {
        name: `${scope}/${firstApp}-mcp`,
        version: "0.0.0",
        dependencies: { [`${scope}/robustness`]: "workspace:*" },
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
  config.global.runtimeSource.set("source");
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

  it("throws if apps/ has no *-mcp/ subdirectory", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "scaffolder-add-test-"));
    trashCans.push(cwd);
    await writeFile(join(cwd, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
    await mkdir(join(cwd, "apps"));
    expect(() => assertInsideScaffoldedRepo(cwd)).toThrow(/no \*-mcp\/ subdirectory/);
  });
});

describe("detectScope()", () => {
  it("parses the npm scope out of the first apps/*-mcp/package.json", async () => {
    const cwd = await makeScaffoldedRepoSkeleton("@acme", "foo");
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

describe("detectRuntimeSource()", () => {
  it("detects source and registry dependencies", async () => {
    const sourceCwd = await makeScaffoldedRepoSkeleton("@acme", "source");
    trashCans.push(sourceCwd);
    expect(detectRuntimeSource(sourceCwd)).toBe("source");

    const registryCwd = await makeScaffoldedRepoSkeleton("@acme", "registry");
    trashCans.push(registryCwd);
    const pkgPath = join(registryCwd, "apps", "registry-mcp", "package.json");
    const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
    pkg.dependencies = { "@george43g/robustness": "^0.1.0" };
    await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    expect(detectRuntimeSource(registryCwd)).toBe("registry");
  });

  it("rejects repositories without a runtime declaration", async () => {
    const cwd = await makeScaffoldedRepoSkeleton("@acme", "unknown");
    trashCans.push(cwd);
    const pkgPath = join(cwd, "apps", "unknown-mcp", "package.json");
    await writeFile(pkgPath, JSON.stringify({ name: "@acme/unknown-mcp" }));
    expect(() => detectRuntimeSource(cwd)).toThrow(/Couldn't detect one runtime source/);
  });
});

describe("08-app/m1-app-port collision guard in add mode", () => {
  it("succeeds when apps/<name>-mcp/ does NOT already exist", async () => {
    const cwd = await makeScaffoldedRepoSkeleton("@acme", "foo");
    trashCans.push(cwd);
    const { ctx } = await makeAddCtx(cwd, "bar", "@acme");
    const result = await new M1AppPort().apply(ctx);
    expect(result.status).toBe("applied");
    expect(existsSync(join(cwd, "apps", "bar-mcp", "package.json"))).toBe(true);
  });

  it("fails with a clear message when apps/<name>-mcp/ already exists", async () => {
    const cwd = await makeScaffoldedRepoSkeleton("@acme", "foo");
    trashCans.push(cwd);
    // Pre-create apps/foo-mcp/ — the would-be target if user passes --name foo.
    const { ctx } = await makeAddCtx(cwd, "foo", "@acme");
    const result = await new M1AppPort().apply(ctx);
    expect(result.status).toBe("failed");
    expect(result.error?.message).toMatch(/Refusing to overwrite/);
  });

  it("is skipped (not run) in apply/existing mode by shouldRun", async () => {
    const cwd = await makeScaffoldedRepoSkeleton("@acme", "foo");
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
    const cwd = await makeScaffoldedRepoSkeleton("@acme", "foo");
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
    expect(Object.keys(mcp.mcpServers).sort()).toEqual(["bar-mcp-dev", "foo-mcp-dev"]);
    expect(mcp.mcpServers["bar-mcp-dev"].args[1]).toBe("apps/bar-mcp/scripts/mcp-dev-proxy.ts");
  });

  it("skips .mcp.json when the file is missing (with a note, no throw)", async () => {
    const cwd = await makeScaffoldedRepoSkeleton("@acme", "foo");
    trashCans.push(cwd);
    const { fs, log } = await makeAddCtx(cwd, "bar", "@acme");
    const result = await writePerAppAgentFiles({ fs, cwd, name: "bar", scope: "@acme", log });
    expect(result.filesChanged).toContain(".cursor/rules/bar.mdc");
    expect(result.filesChanged).not.toContain(".mcp.json");
    expect(result.notes.some((n) => n.includes(".mcp.json missing"))).toBe(true);
  });

  it("leaves an existing matching mcpServers entry untouched", async () => {
    const cwd = await makeScaffoldedRepoSkeleton("@acme", "foo");
    trashCans.push(cwd);
    await writeFile(
      join(cwd, ".mcp.json"),
      JSON.stringify({
        mcpServers: { "bar-mcp-dev": { command: "custom" } },
      }),
    );
    const { fs, log } = await makeAddCtx(cwd, "bar", "@acme");
    const result = await writePerAppAgentFiles({ fs, cwd, name: "bar", scope: "@acme", log });
    expect(result.filesChanged).not.toContain(".mcp.json");
    expect(result.notes.some((n) => n.includes("already has"))).toBe(true);
    const mcp = JSON.parse(await readFile(join(cwd, ".mcp.json"), "utf8"));
    expect(mcp.mcpServers["bar-mcp-dev"].command).toBe("custom");
  });
});
