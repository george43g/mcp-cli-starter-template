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
import { inspectTarget } from "../src/core/target-inspection.js";
import M4Monorepo from "../src/phases/01-bootstrap/m4-monorepo.js";
import M1Mise from "../src/phases/02-toolchain/m1-mise.js";
import M3GitInit from "../src/phases/02-toolchain/m3-git-init.js";
import M4Gitignore from "../src/phases/02-toolchain/m4-gitignore.js";
import M5Gitattributes from "../src/phases/02-toolchain/m5-gitattributes.js";
import M2CliArtifacts from "../src/phases/08-app/m2-cli-artifacts.js";
import M1CiRelease from "../src/phases/12-ci-release/m1-ci-release.js";

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
  const name = opts.name ?? "foo";
  config.global.repoName.set(name);
  config.global.scope.set(opts.scope ?? "@george43g");
  config.global.mode.set("new");
  config.global.packageManager.set("pnpm");
  config.global.runtimeSource.set("source");
  config.global.monorepo.set(true);
  const ctx: MigrationContext = {
    config,
    cwd,
    target: await inspectTarget({
      cwd,
      mode: "new",
      explicitName: name,
      explicitPackageManager: "pnpm",
    }),
    mode: "new",
    existingStrategy: "safe",
    explicitMigration: false,
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
    // No npm `workspaces` field — pnpm uses pnpm-workspace.yaml (asserted above).
    // An npm workspaces field makes plain-npm tooling choke on `workspace:*` deps.
    expect(pkg.workspaces).toBeUndefined();

    // The full script set must be present, otherwise `pnpm build` fails at root.
    expect(Object.keys(pkg.scripts).sort()).toEqual(
      [
        "build",
        "check:docs",
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
    expect(pkg.scripts["check:docs"]).toBe("node scripts/check-docs-links.mjs");
    expect(pkg.scripts.verify).toMatch(/lint.*check:docs.*typecheck.*test.*build/);

    // Root tsconfig resolution requires the workspace config package to be linked here.
    expect(Object.keys(pkg.devDependencies)).toEqual(
      expect.arrayContaining([
        "@biomejs/biome",
        "@george43g/tsconfig",
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
    expect(mise).toContain('usage = "3.3.0"');
    expect(mise).toContain("13-assertion MCP stress harness");
    expect(mise).toContain("wm-stack"); // substituted
    expect(mise).not.toContain("example-repo");
  });

  it("dry-run reports would-apply and writes nothing", async () => {
    const { cwd, ctx } = await makeCtx({ name: "foo", dryRun: true });
    trashCans.push(cwd);

    const result = await new M1Mise().apply(ctx);
    expect(result.status).toBe("would-apply");
    expect(existsSync(join(cwd, "mise.toml"))).toBe(false);
  });
});

describe("12-ci-release/m1-ci-release", () => {
  it("writes consumer CI without meta-only steps and keeps all consumer gates", async () => {
    const { cwd, ctx } = await makeCtx({ name: "foo" });
    trashCans.push(cwd);

    await new M1CiRelease().apply(ctx);
    const ci = await readFile(join(cwd, ".github/workflows/ci.yml"), "utf8");
    expect(ci).not.toContain("Scaffolder E2E smoke");
    expect(ci).not.toContain("Example/ output stays in sync with scaffolder");
    expect(ci).toContain("Lint");
    expect(ci).toContain("Typecheck");
    expect(ci).toContain("Build (TS workspace + optional native)");
    expect(ci).toContain("Test (default — native path when built)");
    expect(ci).toContain("Test (TS fallback path)");
    expect(ci).toContain("Check usage(1) artifacts are fresh");
    expect(ci).toContain("Verify npm tarball is publishable");
    expect(ci).toContain("Stress harness (13 assertions including HTTP)");
    expect(ci).toContain("Upload stress report");
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

describe("08-app/m2-cli-artifacts", () => {
  it("writes the pipeline into --cli-dir with the bin name substituted", async () => {
    const { cwd, ctx } = await makeCtx();
    trashCans.push(cwd);
    ctx.config.cliArtifacts.bin.set("opkeep");
    ctx.config.cliArtifacts.dir.set("apps/opkeep");

    const result = await new M2CliArtifacts().apply(ctx);

    expect(result.status).toBe("applied");
    const kdl = await readFile(join(cwd, "apps/opkeep/.usage.kdl"), "utf8");
    expect(kdl).toContain('name "opkeep"');
    expect(kdl).toContain('bin "opkeep"');
    const mise = await readFile(join(cwd, "apps/opkeep/mise.toml"), "utf8");
    expect(mise).toContain('usage = "3.3.0"');
    expect(mise).toContain("usage g completion bash opkeep");
    expect(mise).toContain("completions/_opkeep");
    expect(mise).toContain("man/opkeep.1");
    expect(mise).toContain("node scripts/check-usage-freshness.mjs");
    // The freshness script ships bin-agnostic (reads bin from .usage.kdl).
    expect(existsSync(join(cwd, "apps/opkeep/scripts/check-usage-freshness.mjs"))).toBe(true);
    expect(existsSync(join(cwd, "apps/opkeep/scripts/install-completions.sh"))).toBe(true);
  });

  it("preserves a divergent .usage.kdl when force=false", async () => {
    const { cwd, ctx } = await makeCtx({ force: false });
    trashCans.push(cwd);
    ctx.config.cliArtifacts.bin.set("mytool");
    ctx.config.cliArtifacts.dir.set(".");
    const userSpec = 'name "mytool"\nbin "mytool"\ncmd "custom" help="mine"\n';
    await ctx.fs.writeIfChanged(".usage.kdl", userSpec);

    const result = await new M2CliArtifacts().apply(ctx);

    expect(result.filesDivergent).toContain(".usage.kdl");
    expect(await readFile(join(cwd, ".usage.kdl"), "utf8")).toBe(userSpec);
  });

  it("rejects a non-kebab-case bin name", async () => {
    const { cwd, ctx } = await makeCtx();
    trashCans.push(cwd);
    ctx.config.cliArtifacts.bin.set("Bad_Name");
    ctx.config.cliArtifacts.dir.set(".");

    await expect(new M2CliArtifacts().apply(ctx)).rejects.toThrow(/kebab-case/);
  });
});
