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
    // 04-robustness/lib/src/logger.ts contains "example-repo" placeholders in its
    // comments. After portPackage, those should become the user's name.
    const { cwd, ctx } = await makeTestCtx({ name: "foo" });
    cleanup.push(() => rm(cwd, { recursive: true, force: true }));

    const result = await portPackage(ctx, {
      pkgDir: "packages/robustness",
      libPrefix: "04-robustness/lib/",
    });

    expect(result.status).toBe("applied");
    expect(result.filesChanged?.length).toBeGreaterThan(0);
    expect(result.filesChanged).toContain("packages/robustness/src/logger.ts");

    const logger = await readFile(join(cwd, "packages/robustness/src/logger.ts"), "utf8");
    // The canonical logger comments mention `mcp/example-repo-mcp` log paths in
    // comments — those should now reference `foo` after substitution.
    expect(logger).toContain("foo");
    expect(logger).not.toContain("example-repo");
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
      pkgDir: "packages/robustness",
      libPrefix: "04-robustness/lib/",
    });

    // package.json content should reference @myorg, not @george43g
    // (the metaFiles branch templates it via the PKG_JSON function in the
    // robustness migration; portPackage itself doesn't write pkg.json here).
    // Inspect a source file that has @george43g in imports:
    const idx = await readFile(join(cwd, "packages/robustness/src/index.ts"), "utf8");
    expect(idx).not.toContain("@george43g/"); // safety: no leftover scopes
  });

  it("dry-run: returns would-apply and writes nothing", async () => {
    const { cwd, ctx } = await makeTestCtx({ dryRun: true });
    cleanup.push(() => rm(cwd, { recursive: true, force: true }));

    const result = await portPackage(ctx, {
      pkgDir: "packages/robustness",
      libPrefix: "04-robustness/lib/",
    });

    expect(result.status).toBe("would-apply");
    expect(result.filesChanged?.length).toBeGreaterThan(0);
    // Nothing actually written:
    await expect(readFile(join(cwd, "packages/robustness/src/logger.ts"))).rejects.toThrow();
  });

  it("noop on re-run when content is identical", async () => {
    const { cwd, ctx } = await makeTestCtx();
    cleanup.push(() => rm(cwd, { recursive: true, force: true }));

    await portPackage(ctx, {
      pkgDir: "packages/robustness",
      libPrefix: "04-robustness/lib/",
    });
    const second = await portPackage(ctx, {
      pkgDir: "packages/robustness",
      libPrefix: "04-robustness/lib/",
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
      libPrefix: "04-robustness/lib/", // borrow the robustness lib just for source
      packageJson: () => '{ "name": "custom" }\n',
    });

    const pkg = await readFile(join(cwd, "packages/x/package.json"), "utf8");
    expect(pkg).toContain('"custom"');
  });
});
