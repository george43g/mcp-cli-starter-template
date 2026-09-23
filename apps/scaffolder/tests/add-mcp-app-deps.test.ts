/**
 * add-mcp-app must leave a workspace that can install the app it wrote.
 *
 * The generated app depends on private workspace packages (build-config,
 * tsconfig, vitest-config, shared-types) that are never published. Before the
 * preflight, a repo scaffolded before build-config existed got an app naming a
 * package the workspace lacked, and pnpm refused to install anything
 * (ERR_PNPM_WORKSPACE_PKG_NOT_FOUND). A present-but-older package failed the
 * same way one step later (vitest-config without `withCoverageFloor`).
 *
 * These tests drive the real command and ask pnpm itself which packages the
 * workspace contains — the same question `pnpm install` answers.
 */

import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureAppWorkspaceDeps, pnpmWorkspaceLister } from "../src/commands/add-mcp-app-deps.js";
import { Config } from "../src/core/config.js";
import { makeFs } from "../src/core/fs.js";
import { makeGit } from "../src/core/git.js";
import { makeLogger } from "../src/core/logger.js";
import type { Migration, MigrationContext } from "../src/core/migration.js";
import { buildProgram } from "../src/core/program.js";
import { makeShell } from "../src/core/shell.js";
import { inspectTarget } from "../src/core/target-inspection.js";
import M1TsconfigPkg from "../src/phases/03-configs/m1-tsconfig-pkg.js";
import M3VitestPkg from "../src/phases/03-configs/m3-vitest-pkg.js";
import M5BuildConfigPkg from "../src/phases/03-configs/m5-build-config-pkg.js";
import M1SharedTypes from "../src/phases/07-shared-types/m1-shared-types.js";

const SCOPE = "@acme";
const cleanup: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const dir of cleanup.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function ctxFor(cwd: string, name: string): Promise<MigrationContext> {
  const shell = makeShell({ cwd, dryRun: false });
  const config = new Config();
  config.global.repoName.set(name);
  config.global.scope.set(SCOPE);
  config.global.mode.set("add");
  config.global.packageManager.set("pnpm");
  return {
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
    fs: makeFs({ cwd, dryRun: false, force: true }),
    git: makeGit(shell),
    log: makeLogger({ verbose: false }),
    dryRun: false,
    force: true,
  };
}

/**
 * A repo scaffolded under @acme with one app and current copies of the given
 * private packages — built by the scaffolder's own migrations.
 */
async function scaffoldedRepo(packages: Migration[]): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "scaffolder-add-deps-"));
  cleanup.push(cwd);
  await writeFile(join(cwd, "package.json"), '{ "name": "fixture", "private": true }\n');
  await writeFile(join(cwd, "pnpm-workspace.yaml"), 'packages:\n  - "apps/*"\n  - "packages/*"\n');
  await mkdir(join(cwd, "apps", "foo-mcp"), { recursive: true });
  await writeFile(
    join(cwd, "apps", "foo-mcp", "package.json"),
    `${JSON.stringify({ name: `${SCOPE}/foo-mcp`, version: "0.0.0" }, null, 2)}\n`,
  );
  const ctx = await ctxFor(cwd, "foo");
  for (const m of packages) await m.apply(ctx);
  return cwd;
}

const ALL_BUT_BUILD_CONFIG = () => [new M1TsconfigPkg(), new M3VitestPkg(), new M1SharedTypes()];

async function addApp(cwd: string, name = "bar"): Promise<string> {
  let out = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    out += String(chunk);
    return true;
  });
  await buildProgram().parseAsync(
    ["--no-banner", "add-mcp-app", name, "--target", cwd, "--no-install"],
    { from: "user" },
  );
  vi.restoreAllMocks();
  return out;
}

/** relative path → bytes, for every file under `dir`. */
async function snapshot(dir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const abs = join(entry.parentPath, entry.name);
    out.set(relative(dir, abs), await readFile(abs, "utf8"));
  }
  return out;
}

async function workspaceNames(cwd: string): Promise<string[]> {
  const list = pnpmWorkspaceLister(makeShell({ cwd, dryRun: false }));
  return [...(await list(cwd)).keys()].sort();
}

describe("add-mcp-app workspace-dependency preflight", () => {
  it("creates a missing build-config so every workspace:* dep of the new app resolves", async () => {
    const cwd = await scaffoldedRepo(ALL_BUT_BUILD_CONFIG());
    expect(await workspaceNames(cwd)).not.toContain(`${SCOPE}/build-config`);

    const out = await addApp(cwd);

    const buildConfig = JSON.parse(
      await readFile(join(cwd, "packages", "build-config", "package.json"), "utf8"),
    );
    expect(buildConfig.name).toBe(`${SCOPE}/build-config`);
    const app = JSON.parse(await readFile(join(cwd, "apps", "bar-mcp", "package.json"), "utf8"));
    const names = await workspaceNames(cwd);
    const workspaceDeps = Object.entries({ ...app.dependencies, ...app.devDependencies })
      .filter(([, range]) => String(range).startsWith("workspace:"))
      .map(([dep]) => dep);
    expect(workspaceDeps).toContain(`${SCOPE}/build-config`);
    for (const dep of workspaceDeps) expect(names).toContain(dep);
    expect(out).toContain(`add-mcp-app: target ${cwd}`);
  }, 60_000);

  it("leaves an existing, customised build-config byte-identical", async () => {
    const cwd = await scaffoldedRepo([...ALL_BUT_BUILD_CONFIG(), new M5BuildConfigPkg()]);
    const pkgDir = join(cwd, "packages", "build-config");
    const manifest = JSON.parse(await readFile(join(pkgDir, "package.json"), "utf8"));
    manifest.description = "locally customised";
    await writeFile(join(pkgDir, "package.json"), `${JSON.stringify(manifest, null, 4)}\n`);
    await writeFile(
      join(pkgDir, "build-stamp.mjs"),
      `// local tweak\n${await readFile(join(pkgDir, "build-stamp.mjs"), "utf8")}`,
    );
    await writeFile(join(pkgDir, "EXTRA.md"), "consumer-only file\n");
    const before = await snapshot(join(cwd, "packages"));
    const rootTsconfig = await readFile(join(cwd, "tsconfig.json"), "utf8");

    await addApp(cwd);

    expect(existsSync(join(cwd, "apps", "bar-mcp", "package.json"))).toBe(true);
    expect(await snapshot(join(cwd, "packages"))).toEqual(before);
    expect(await readFile(join(cwd, "tsconfig.json"), "utf8")).toBe(rootTsconfig);
  }, 60_000);

  it("fails before writing when a missing workspace dep has no migration that creates it", async () => {
    const cwd = await scaffoldedRepo([...ALL_BUT_BUILD_CONFIG(), new M5BuildConfigPkg()]);
    const ctx = await ctxFor(cwd, "bar");
    const appFiles = new Map([
      [
        "package.json",
        JSON.stringify({
          name: `${SCOPE}/bar-mcp`,
          devDependencies: { [`${SCOPE}/not-a-thing`]: "workspace:*" },
        }),
      ],
    ]);
    const before = await snapshot(cwd);

    await expect(
      ensureAppWorkspaceDeps(ctx, {
        listWorkspace: pnpmWorkspaceLister(ctx.shell),
        appFiles,
      }),
    ).rejects.toThrow(
      /@acme\/not-a-thing is a workspace dependency .* no migration that creates it/,
    );
    expect(await snapshot(cwd)).toEqual(before);
  }, 60_000);

  it("refuses to create into a directory that exists but is not the workspace package", async () => {
    const cwd = await scaffoldedRepo(ALL_BUT_BUILD_CONFIG());
    await mkdir(join(cwd, "packages", "build-config"), { recursive: true });
    await writeFile(
      join(cwd, "packages", "build-config", "package.json"),
      '{ "name": "something-else" }\n',
    );
    const before = await snapshot(cwd);

    await expect(addApp(cwd)).rejects.toThrow(
      /@acme\/build-config is not a workspace package, but packages\/build-config\/ already exists/,
    );
    expect(existsSync(join(cwd, "apps", "bar-mcp"))).toBe(false);
    expect(await snapshot(cwd)).toEqual(before);
  }, 60_000);

  it("rejects a present-but-older vitest-config, names the missing export, and its fix works", async () => {
    const cwd = await scaffoldedRepo([...ALL_BUT_BUILD_CONFIG(), new M5BuildConfigPkg()]);
    // The shape browser-tab-mcp's copy had: `shared` and a default, no floor helper.
    const shared = join(cwd, "packages", "vitest-config", "vitest.shared.ts");
    await writeFile(
      shared,
      'import { defineConfig } from "vitest/config";\n\n' +
        "export const shared = defineConfig({});\n\nexport default shared;\n",
    );
    const before = await snapshot(cwd);

    const err = await addApp(cwd).then(
      () => undefined,
      (e: unknown) => e as Error,
    );
    expect(err?.message).toMatch(
      /@acme\/vitest-config\/vitest\.shared has no export named 'withCoverageFloor'/,
    );
    expect(err?.message).toContain(
      "mcp-scaffold migrate 03-configs/m3-vitest-pkg --scope @acme --force --execute",
    );
    expect(existsSync(join(cwd, "apps", "bar-mcp"))).toBe(false);
    expect(await snapshot(cwd)).toEqual(before);

    // The advertised fix must actually be a fix.
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await buildProgram().parseAsync(
      [
        "--no-banner",
        "migrate",
        "03-configs/m3-vitest-pkg",
        "--scope",
        SCOPE,
        "--force",
        "--execute",
        "--target",
        cwd,
        "--no-install",
      ],
      { from: "user" },
    );
    vi.restoreAllMocks();
    await addApp(cwd);
    expect(existsSync(join(cwd, "apps", "bar-mcp", "vitest.config.ts"))).toBe(true);
  }, 60_000);
});
