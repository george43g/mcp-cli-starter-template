/**
 * Migration-level integration tests.
 *
 * Each test spins up a fresh tempdir, builds a real MigrationContext, runs
 * one migration's apply(), and asserts on the filesystem outcome. Exercises
 * the migration logic itself (separate from portPackage, which has its own
 * unit test file).
 */

import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Config } from "../src/core/config.js";
import { makeFs } from "../src/core/fs.js";
import { makeGit } from "../src/core/git.js";
import { makeLogger } from "../src/core/logger.js";
import type { MigrationContext } from "../src/core/migration.js";
import { makeShell } from "../src/core/shell.js";
import M4Monorepo from "../src/phases/01-bootstrap/m4-monorepo.js";
import M1Mise from "../src/phases/02-toolchain/m1-mise.js";
import M3GitInit from "../src/phases/02-toolchain/m3-git-init.js";
import M4Gitignore from "../src/phases/02-toolchain/m4-gitignore.js";
import M5Gitattributes from "../src/phases/02-toolchain/m5-gitattributes.js";

async function makeCtx(
  opts: { name?: string; scope?: string; dryRun?: boolean; force?: boolean } = {},
) {
  const cwd = await mkdtemp(join(tmpdir(), "scaffolder-mig-test-"));
  const dryRun = opts.dryRun ?? false;
  const force = opts.force ?? true;
  const log = makeLogger({ verbose: false });
  const shell = makeShell({ cwd, dryRun });
  const fs = makeFs({ cwd, dryRun, force });
  const git = makeGit(shell);
  const config = new Config();
  config.global.repoName.set(opts.name ?? "foo");
  config.global.scope.set(opts.scope ?? "@george43g");
  config.global.mode.set("new");
  config.global.packageManager.set("pnpm");
  config.global.monorepo.set(true);
  const ctx: MigrationContext = {
    config,
    cwd,
    mode: "new",
    shell,
    fs,
    git,
    log,
    dryRun,
    force,
  };
  return { cwd, ctx };
}

let trashCans: string[] = [];
beforeEach(() => {
  trashCans = [];
});
afterEach(async () => {
  for (const dir of trashCans) await rm(dir, { recursive: true, force: true });
});

describe("01-bootstrap/m4-monorepo", () => {
  it("writes pnpm-workspace.yaml + turbo.json + a full root package.json", async () => {
    const { cwd, ctx } = await makeCtx({ name: "foo" });
    trashCans.push(cwd);

    const result = await new M4Monorepo().apply(ctx);

    expect(result.status).toBe("applied");
    expect(existsSync(join(cwd, "pnpm-workspace.yaml"))).toBe(true);
    expect(existsSync(join(cwd, "turbo.json"))).toBe(true);
    expect(existsSync(join(cwd, "package.json"))).toBe(true);

    const pkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf8"));
    expect(pkg.name).toBe("foo");
    expect(pkg.private).toBe(true);
    expect(pkg.type).toBe("module");
    expect(pkg.engines.node).toBe(">=24");
    expect(pkg.packageManager).toMatch(/^pnpm@/);
    expect(pkg.workspaces).toEqual(["apps/*", "packages/*"]);

    // The full script set must be present, otherwise `pnpm build` fails at root.
    expect(Object.keys(pkg.scripts).sort()).toEqual(
      [
        "build",
        "clean",
        "dev",
        "format",
        "lint",
        "lint:fix",
        "stress",
        "test",
        "test:no-native",
        "typecheck",
        "verify",
      ].sort(),
    );
    expect(pkg.scripts.build).toBe("turbo run build");
    expect(pkg.scripts.verify).toMatch(/lint.*typecheck.*test.*build/);

    // devDependencies includes turbo + biome + tsx + types/node + typescript + vitest.
    expect(Object.keys(pkg.devDependencies)).toEqual(
      expect.arrayContaining([
        "@biomejs/biome",
        "@types/node",
        "tsx",
        "turbo",
        "typescript",
        "vitest",
      ]),
    );
  });

  it("shouldRun=false when monorepo opted out", async () => {
    const { ctx } = await makeCtx();
    ctx.config.global.monorepo.set(false);
    expect(await new M4Monorepo().shouldRun?.(ctx)).toBe(false);
  });

  it("noop on re-run with identical content", async () => {
    const { cwd, ctx } = await makeCtx({ name: "foo" });
    trashCans.push(cwd);

    await new M4Monorepo().apply(ctx);
    const second = await new M4Monorepo().apply(ctx);
    expect(second.status).toBe("noop");
  });
});

describe("02-toolchain/m1-mise", () => {
  it("writes mise.toml with the user's name substituted", async () => {
    const { cwd, ctx } = await makeCtx({ name: "wm-stack" });
    trashCans.push(cwd);

    const result = await new M1Mise().apply(ctx);
    expect(result.status).toBe("applied");

    const mise = await readFile(join(cwd, "mise.toml"), "utf8");
    expect(mise).toContain('node = "24"');
    expect(mise).toContain('pnpm = "10.29.3"');
    expect(mise).toContain("wm-stack"); // substituted
    expect(mise).not.toContain("{{name}}");
  });

  it("dry-run reports would-apply and writes nothing", async () => {
    const { cwd, ctx } = await makeCtx({ name: "foo", dryRun: true });
    trashCans.push(cwd);

    const result = await new M1Mise().apply(ctx);
    expect(result.status).toBe("would-apply");
    expect(existsSync(join(cwd, "mise.toml"))).toBe(false);
  });
});

describe("02-toolchain/m3-git-init", () => {
  it("shouldRun=true when cwd is not a repo", async () => {
    const { ctx } = await makeCtx();
    trashCans.push(ctx.cwd);
    expect(await new M3GitInit().shouldRun?.(ctx)).toBe(true);
  });

  it("shouldRun=false when cwd is already a repo", async () => {
    const { ctx } = await makeCtx();
    trashCans.push(ctx.cwd);
    await ctx.shell.run("git", ["init", "--initial-branch=main"]);
    expect(await new M3GitInit().shouldRun?.(ctx)).toBe(false);
  });

  it("creates .git/ when applied to a non-repo dir", async () => {
    const { cwd, ctx } = await makeCtx();
    trashCans.push(cwd);
    expect(existsSync(join(cwd, ".git"))).toBe(false);
    await new M3GitInit().apply(ctx);
    expect(existsSync(join(cwd, ".git"))).toBe(true);
  });
});

describe("02-toolchain/m4-gitignore + m5-gitattributes (literal writers)", () => {
  it("m4-gitignore writes a comprehensive .gitignore", async () => {
    const { cwd, ctx } = await makeCtx();
    trashCans.push(cwd);

    await new M4Gitignore().apply(ctx);

    const gi = await readFile(join(cwd, ".gitignore"), "utf8");
    // Critical entries the .gitignore docs explicitly call out:
    expect(gi).toContain("node_modules/");
    expect(gi).toContain("dist/");
    expect(gi).toContain("*.node"); // native artifacts
    expect(gi).toContain(".env"); // env files
    expect(gi).toContain("stress-mcp-report.json"); // stress reports
    expect(gi).toContain(".turbo/");
  });

  it("m5-gitattributes contains the LFS anti-footgun", async () => {
    const { cwd, ctx } = await makeCtx();
    trashCans.push(cwd);

    await new M5Gitattributes().apply(ctx);

    const ga = await readFile(join(cwd, ".gitattributes"), "utf8");
    // The whole point of this file:
    expect(ga).toContain("*.db -filter -diff -merge text");
    expect(ga).toContain("*.sqlite");
    expect(ga).toContain("eol=lf");
    expect(ga).toContain("linguist-generated=true");
  });
});
