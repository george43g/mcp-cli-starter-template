import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Config } from "../src/core/config.js";
import { makeFs } from "../src/core/fs.js";
import { makeGit } from "../src/core/git.js";
import { makeLogger } from "../src/core/logger.js";
import type { MigrationContext } from "../src/core/migration.js";
import { portPackage } from "../src/core/package-port.js";
import { PUBLISHED_NAMES, rangeFor } from "../src/core/runtime-source.js";
import { makeShell } from "../src/core/shell.js";
import { inspectTarget } from "../src/core/target-inspection.js";

/**
 * Build a working MigrationContext rooted at a tmpdir. The migration ctx
 * is a real one — same plumbing the program uses — so tests exercise the
 * actual portPackage code path.
 */
async function makeTestCtx(
  opts: { dryRun?: boolean; name?: string; scope?: string; force?: boolean } = {},
) {
  const cwd = await mkdtemp(join(tmpdir(), "scaffolder-port-test-"));
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

describe("portPackage", () => {
  let cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const fn of cleanup) await fn();
    cleanup = [];
  });

  it("substitutes example-repo placeholders in file content (real lib copy)", async () => {
    // 08-app/lib is now the only shipped lib carrying "example-repo"
    // placeholders — the published packages are no longer vendored, so
    // 04-robustness/lib does not exist.
    const { cwd, ctx } = await makeTestCtx({ name: "foo" });
    cleanup.push(() => rm(cwd, { recursive: true, force: true }));

    const result = await portPackage(ctx, {
      pkgDir: "apps/foo-mcp",
      libPrefix: "08-app/lib/",
    });

    expect(result.status).toBe("applied");
    expect(result.filesChanged?.length).toBeGreaterThan(0);
    expect(result.filesChanged).toContain("apps/foo-mcp/src/cli.ts");

    const cli = await readFile(join(cwd, "apps/foo-mcp/src/cli.ts"), "utf8");
    expect(cli).toContain("foo");
    expect(cli).not.toContain("example-repo");
  });

  it("substitutes example-repo placeholders in PATHS too", async () => {
    // 11-agent-files ships skills/example-repo/SKILL.md as a lib path — the
    // example-repo in the PATH (not just content) must be substituted.
    const { cwd, ctx } = await makeTestCtx({ name: "foo" });
    cleanup.push(() => rm(cwd, { recursive: true, force: true }));

    const result = await portPackage(ctx, {
      pkgDir: "",
      libPrefix: "11-agent-files/lib/",
    });

    expect(result.status).toBe("applied");
    expect(result.filesChanged).toContain("skills/foo/SKILL.md");
    expect(result.filesChanged).not.toContain("skills/example-repo/SKILL.md");
  });

  it("substitutes @george43g when a different scope is set", async () => {
    const { cwd, ctx } = await makeTestCtx({ name: "foo", scope: "@myorg" });
    cleanup.push(() => rm(cwd, { recursive: true, force: true }));

    await portPackage(ctx, {
      pkgDir: "apps/foo-mcp",
      libPrefix: "08-app/lib/",
    });

    // Locally-generated packages take the target's scope...
    const pkg = JSON.parse(await readFile(join(cwd, "apps/foo-mcp/package.json"), "utf8"));
    expect(pkg.dependencies["@myorg/mcp-kit"]).toBe("workspace:*");
    // ...while PUBLISHED packages keep the scope they are published under.
    // Rewriting those to @myorg would point at packages that do not exist.
    expect(pkg.dependencies["@myorg/robustness"]).toBeUndefined();
    expect(pkg.dependencies["@george43g/robustness"]).toBeDefined();
  });

  it("depends on published packages by their derived registry range", async () => {
    const { cwd, ctx } = await makeTestCtx({
      name: "foo",
      scope: "@myorg",
    });
    cleanup.push(() => rm(cwd, { recursive: true, force: true }));

    await portPackage(ctx, {
      pkgDir: "apps/foo-mcp",
      libPrefix: "08-app/lib/",
    });

    const pkg = JSON.parse(await readFile(join(cwd, "apps/foo-mcp/package.json"), "utf8"));
    // Asserted against the DERIVED range, not a literal. A hardcoded "^0.1.0"
    // here is exactly what let runtime-source.ts drift a whole minor behind the
    // published robustness while still passing.
    for (const name of PUBLISHED_NAMES) {
      if (pkg.dependencies?.[name] === undefined) continue;
      expect(pkg.dependencies[name]).toBe(rangeFor(name));
      expect(pkg.dependencies[name]).not.toContain("workspace:");
    }
    expect(pkg.dependencies["@george43g/robustness"]).toBe(rangeFor("@george43g/robustness"));
    expect(pkg.dependencies["@myorg/robustness"]).toBeUndefined();
    expect(pkg.dependencies["@myorg/mcp-kit"]).toBe("workspace:*");
    const entry = await readFile(join(cwd, "apps/foo-mcp/src/index.ts"), "utf8");
    expect(entry).toContain('from "@george43g/robustness"');
  });

  it("dry-run: returns would-apply and writes nothing", async () => {
    const { cwd, ctx } = await makeTestCtx({ dryRun: true });
    cleanup.push(() => rm(cwd, { recursive: true, force: true }));

    const result = await portPackage(ctx, {
      pkgDir: "apps/foo-mcp",
      libPrefix: "08-app/lib/",
    });

    expect(result.status).toBe("would-apply");
    expect(result.filesChanged?.length).toBeGreaterThan(0);
    // Nothing actually written:
    await expect(readFile(join(cwd, "apps/foo-mcp/src/cli.ts"))).rejects.toThrow();
  });

  it("noop on re-run when content is identical", async () => {
    const { cwd, ctx } = await makeTestCtx();
    cleanup.push(() => rm(cwd, { recursive: true, force: true }));

    await portPackage(ctx, {
      pkgDir: "apps/foo-mcp",
      libPrefix: "08-app/lib/",
    });
    const second = await portPackage(ctx, {
      pkgDir: "apps/foo-mcp",
      libPrefix: "08-app/lib/",
    });

    expect(second.status).toBe("noop");
  });

  it("pkgDir='' lands files at the repo root (e.g. for 11-agent-files)", async () => {
    const { cwd, ctx } = await makeTestCtx({ name: "foo" });
    cleanup.push(() => rm(cwd, { recursive: true, force: true }));

    const result = await portPackage(ctx, {
      pkgDir: "",
      libPrefix: "11-agent-files/lib/",
    });

    expect(result.filesChanged).toContain("AGENTS.md");
    expect(result.filesChanged).toContain(".mcp.json");
  });

  it("pkgDir='.' is treated the same as ''", async () => {
    const { cwd, ctx } = await makeTestCtx({ name: "foo" });
    cleanup.push(() => rm(cwd, { recursive: true, force: true }));

    const result = await portPackage(ctx, {
      pkgDir: ".",
      libPrefix: "11-agent-files/lib/",
    });

    expect(result.filesChanged).toContain("AGENTS.md");
  });

  it("inline package.json template overrides lib version", async () => {
    const { cwd, ctx } = await makeTestCtx({ name: "foo" });
    cleanup.push(() => rm(cwd, { recursive: true, force: true }));

    await portPackage(ctx, {
      pkgDir: "packages/x",
      // 11-agent-files/lib ships no package.json of its own. That matters:
      // the TEMPLATES pass runs after metaFiles, so a lib that DOES contain
      // one would overwrite the inline version and this would assert nothing.
      libPrefix: "11-agent-files/lib/",
      packageJson: () => '{ "name": "custom" }\n',
    });

    const pkg = await readFile(join(cwd, "packages/x/package.json"), "utf8");
    expect(pkg).toContain('"custom"');
  });
});
