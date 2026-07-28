import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Config } from "../src/core/config.js";
import { makeFs } from "../src/core/fs.js";
import { makeGit } from "../src/core/git.js";
import { makeLogger } from "../src/core/logger.js";
import type { MigrationContext } from "../src/core/migration.js";
import { makeShell } from "../src/core/shell.js";
import { inspectTarget } from "../src/core/target-inspection.js";
import AgentFilesMigration from "../src/phases/11-agent-files/m1-agent-files.js";
import { drawRecap } from "../src/ui/recap.js";

const cleanup: string[] = [];

async function fixture(
  packageJson: Record<string, unknown>,
  options: { starter?: boolean } = {},
): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "scaffolder-agent-files-test-"));
  cleanup.push(cwd);
  await writeFile(join(cwd, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
  if (options.starter) {
    await mkdir(join(cwd, "apps"));
    await mkdir(join(cwd, "packages"));
    await writeFile(join(cwd, "turbo.json"), "{}\n");
    await writeFile(join(cwd, "pnpm-workspace.yaml"), "packages: []\n");
  }
  return cwd;
}

async function context(cwd: string, force = false): Promise<MigrationContext> {
  const target = await inspectTarget({ cwd, mode: "existing" });
  const config = new Config();
  config.global.mode.set("existing");
  config.global.repoName.set(target.repoName);
  config.global.packageManager.set(target.packageManager);
  config.global.runtimeSource.set("source");
  config.global.scope.set("@george43g");
  const dryRun = false;
  const shell = makeShell({ cwd, dryRun });
  return {
    config,
    cwd,
    target,
    mode: "existing",
    existingStrategy: "safe",
    explicitMigration: true,
    shell,
    fs: makeFs({ cwd, dryRun, force }),
    git: makeGit(shell),
    log: makeLogger({ verbose: false }),
    dryRun,
    force,
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const cwd of cleanup.splice(0)) await rm(cwd, { recursive: true, force: true });
});

describe("11-agent-files target-aware output", () => {
  it("writes minimal npm-aware files with real scripts for a flat repo", async () => {
    const cwd = await fixture({
      name: "@scope/openwrt-mcp",
      packageManager: "npm@11.0.0",
      scripts: { test: "node --test", build: "tsc" },
    });
    const result = await new AgentFilesMigration().apply(await context(cwd));

    expect(result.status).toBe("applied");
    expect(result.followUps?.join("\n")).toMatch(/skeletons/);
    const agents = await readFile(join(cwd, "AGENTS.md"), "utf8");
    expect(agents).toContain("Package manager: `npm`");
    expect(agents).toContain("`npm run test`");
    expect(agents).toContain("`node --test`");
    expect(agents).not.toMatch(/mcp-starter|Turborepo/);
    expect(existsSync(join(cwd, "skills/openwrt/SKILL.md"))).toBe(true);
    expect(existsSync(join(cwd, ".cursor/rules/openwrt.mdc"))).toBe(true);
    expect(await readlink(join(cwd, "CLAUDE.md"))).toBe("AGENTS.md");
    expect(await readlink(join(cwd, ".cursorrules"))).toBe("AGENTS.md");
    expect(existsSync(join(cwd, ".mcp.json"))).toBe(false);
    expect(existsSync(join(cwd, "opencode.json"))).toBe(false);
    expect(existsSync(join(cwd, ".claude/settings.local.json"))).toBe(false);
    expect(existsSync(join(cwd, ".github/PULL_REQUEST_TEMPLATE.md"))).toBe(false);
  });

  it("keeps the full template for starter-derived existing repos", async () => {
    const cwd = await fixture(
      { name: "@scope/foo-mcp", packageManager: "pnpm@10.29.3" },
      { starter: true },
    );
    await new AgentFilesMigration().apply(await context(cwd));
    const agents = await readFile(join(cwd, "AGENTS.md"), "utf8");
    expect(agents).toContain("## Workspace topology");
    expect(agents).toContain("13 lifecycle assertions");
    expect(existsSync(join(cwd, ".mcp.json"))).toBe(true);
    const skills = await readFile(join(cwd, "skills.md"), "utf8");
    expect(skills).not.toContain(".agents/skills");
  });

  it("preserves existing files and wrong links without --force and reports divergence", async () => {
    const cwd = await fixture({ name: "foo", packageManager: "npm@11" });
    await mkdir(join(cwd, "skills/foo"), { recursive: true });
    await writeFile(join(cwd, "AGENTS.md"), "user agents\n");
    await writeFile(join(cwd, "CLAUDE.md"), "user claude\n");
    await symlink("OTHER.md", join(cwd, ".cursorrules"));
    await writeFile(join(cwd, "skills/foo/SKILL.md"), "user skill\n");

    const result = await new AgentFilesMigration().apply(await context(cwd));
    expect(result.filesDivergent).toEqual(
      expect.arrayContaining(["AGENTS.md", "CLAUDE.md", ".cursorrules", "skills/foo/SKILL.md"]),
    );
    expect(await readFile(join(cwd, "AGENTS.md"), "utf8")).toBe("user agents\n");
    expect(await readFile(join(cwd, "CLAUDE.md"), "utf8")).toBe("user claude\n");
    expect(await readlink(join(cwd, ".cursorrules"))).toBe("OTHER.md");
    expect(await readFile(join(cwd, "skills/foo/SKILL.md"), "utf8")).toBe("user skill\n");
  });

  it("replaces divergent files and links under --force", async () => {
    const cwd = await fixture({ name: "foo", packageManager: "npm@11" });
    await mkdir(join(cwd, "skills/foo"), { recursive: true });
    await writeFile(join(cwd, "AGENTS.md"), "user agents\n");
    await writeFile(join(cwd, "CLAUDE.md"), "user claude\n");
    await symlink("OTHER.md", join(cwd, ".cursorrules"));
    await writeFile(join(cwd, "skills/foo/SKILL.md"), "user skill\n");

    const result = await new AgentFilesMigration().apply(await context(cwd, true));
    expect(result.filesDivergent).toBeUndefined();
    expect(await readFile(join(cwd, "AGENTS.md"), "utf8")).toContain("Package manager: `npm`");
    expect(await readlink(join(cwd, "CLAUDE.md"))).toBe("AGENTS.md");
    expect(await readlink(join(cwd, ".cursorrules"))).toBe("AGENTS.md");
    expect(await readFile(join(cwd, "skills/foo/SKILL.md"), "utf8")).toContain(
      "Skeleton generated",
    );
  });

  it("renders the skeleton follow-up in the recap", async () => {
    const cwd = await fixture({ name: "foo", packageManager: "npm@11" });
    const migration = new AgentFilesMigration();
    const result = await migration.apply(await context(cwd));
    let output = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });
    drawRecap([
      {
        phaseId: "11-agent-files",
        results: [{ migrationId: migration.id, migration, result, durationMs: 1 }],
      },
    ]);
    expect(output).toContain("Action required");
    expect(output).toContain("project's real tools and workflows");
  });
});
