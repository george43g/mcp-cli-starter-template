import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
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

/**
 * A skill link's target with `/` on every OS, after proving it resolves to the
 * skill directory. Node stores a relative Windows link target with `\`, so the
 * raw readlink is `..\..\.agents\skills\<name>` there (the fs helper's own
 * "already correct" comparison is separator-blind for the same reason).
 */
async function skillLink(cwd: string, name: string): Promise<string> {
  const link = join(cwd, ".claude/skills", name);
  expect(await realpath(link)).toBe(await realpath(join(cwd, ".agents/skills", name)));
  return (await readlink(link)).replace(/\\/g, "/");
}

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
    expect(existsSync(join(cwd, ".agents/skills/openwrt-mcp/SKILL.md"))).toBe(true);
    expect(await skillLink(cwd, "openwrt-mcp")).toBe("../../.agents/skills/openwrt-mcp");
    expect(existsSync(join(cwd, "skills"))).toBe(false);
    expect(existsSync(join(cwd, ".cursor/rules/openwrt-mcp.mdc"))).toBe(true);
    expect(await readlink(join(cwd, "CLAUDE.md"))).toBe("AGENTS.md");
    // Cursor reads AGENTS.md + .cursor/rules/*.mdc; the legacy .cursorrules
    // link was dropped 2026-09-21 and must not come back.
    expect(existsSync(join(cwd, ".cursorrules"))).toBe(false);
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
    expect(agents).toContain("15 lifecycle assertions");
    expect(existsSync(join(cwd, ".mcp.json"))).toBe(true);
    const skills = await readFile(join(cwd, "skills.md"), "utf8");
    // The cloud-agent dev skill is this repo's own, never stamped.
    expect(skills).not.toContain("-dev");
    expect(existsSync(join(cwd, ".codex/config.toml"))).toBe(true);
    for (const skill of [
      "foo-mcp",
      "cli-artifacts",
      "workspace-scaffolding",
      "mcp-tool-author",
      "pr-review-sop",
    ]) {
      expect(existsSync(join(cwd, `.agents/skills/${skill}/SKILL.md`))).toBe(true);
      expect(await skillLink(cwd, skill)).toBe(`../../.agents/skills/${skill}`);
      // Resolves: Claude Code reads the same SKILL.md through the link.
      expect(existsSync(join(cwd, `.claude/skills/${skill}/SKILL.md`))).toBe(true);
    }
    expect(existsSync(join(cwd, "skills"))).toBe(false);
  });

  it("leaves skills at legacy paths in place and says how to move them", async () => {
    const cwd = await fixture(
      { name: "@scope/foo-mcp", packageManager: "pnpm@10.29.3" },
      { starter: true },
    );
    await mkdir(join(cwd, ".claude/skills/mcp-tool-author"), { recursive: true });
    await writeFile(join(cwd, ".claude/skills/mcp-tool-author/SKILL.md"), "tailored\n");
    await mkdir(join(cwd, "skills/foo-mcp"), { recursive: true });
    await writeFile(join(cwd, "skills/foo-mcp/SKILL.md"), "user skill\n");

    for (const force of [false, true]) {
      const result = await new AgentFilesMigration().apply(await context(cwd, force));
      expect(await readFile(join(cwd, ".claude/skills/mcp-tool-author/SKILL.md"), "utf8")).toBe(
        "tailored\n",
      );
      expect(await readFile(join(cwd, "skills/foo-mcp/SKILL.md"), "utf8")).toBe("user skill\n");
      // No second copy beside the legacy one: Codex and Claude would each see a different skill.
      expect(existsSync(join(cwd, ".agents/skills/mcp-tool-author"))).toBe(false);
      expect(existsSync(join(cwd, ".agents/skills/foo-mcp"))).toBe(false);
      const followUps = result.followUps?.join("\n") ?? "";
      expect(followUps).toContain(
        "git mv .claude/skills/mcp-tool-author .agents/skills/mcp-tool-author",
      );
      expect(followUps).toContain("git mv skills/foo-mcp .agents/skills/foo-mcp");
    }
    // Skills with no legacy copy are still stamped and linked.
    expect(await skillLink(cwd, "pr-review-sop")).toBe("../../.agents/skills/pr-review-sop");
  });

  it("creates only missing skill links on re-run and keeps a divergent one", async () => {
    const cwd = await fixture(
      { name: "@scope/foo-mcp", packageManager: "pnpm@10.29.3" },
      { starter: true },
    );
    await new AgentFilesMigration().apply(await context(cwd));
    await rm(join(cwd, ".claude/skills/cli-artifacts"));
    await rm(join(cwd, ".claude/skills/pr-review-sop"));
    await symlink("elsewhere", join(cwd, ".claude/skills/pr-review-sop"));

    const result = await new AgentFilesMigration().apply(await context(cwd));
    expect(result.filesChanged).toEqual([".claude/skills/cli-artifacts"]);
    expect(result.filesDivergent).toEqual([".claude/skills/pr-review-sop"]);
    expect(await readlink(join(cwd, ".claude/skills/pr-review-sop"))).toBe("elsewhere");
  });

  it("reports a skill link the OS refuses instead of failing the run", async () => {
    const cwd = await fixture(
      { name: "@scope/foo-mcp", packageManager: "pnpm@10.29.3" },
      { starter: true },
    );
    const ctx = await context(cwd);
    const realSymlink = ctx.fs.symlink.bind(ctx.fs);
    // What Windows answers without Developer Mode or an elevated shell.
    ctx.fs = {
      ...ctx.fs,
      symlink: async (target, link, type) => {
        if (link.startsWith(".claude/skills/")) {
          throw Object.assign(new Error("operation not permitted"), { code: "EPERM" });
        }
        return realSymlink(target, link, type);
      },
    };
    const result = await new AgentFilesMigration().apply(ctx);
    expect(result.status).toBe("applied");
    expect(result.followUps?.join("\n")).toMatch(
      /Could not create \.claude\/skills\/cli-artifacts \(EPERM\).*Developer Mode/,
    );
    expect(existsSync(join(cwd, ".agents/skills/cli-artifacts/SKILL.md"))).toBe(true);
    expect(await readlink(join(cwd, "CLAUDE.md"))).toBe("AGENTS.md");
  });

  it("does not swallow an unexpected symlink error", async () => {
    const cwd = await fixture({ name: "foo", packageManager: "npm@11" });
    const ctx = await context(cwd);
    ctx.fs = {
      ...ctx.fs,
      symlink: async () => {
        throw Object.assign(new Error("disk on fire"), { code: "EIO" });
      },
    };
    await expect(new AgentFilesMigration().apply(ctx)).rejects.toThrow("disk on fire");
  });

  it("preserves existing files and wrong links without --force and reports divergence", async () => {
    const cwd = await fixture({ name: "foo", packageManager: "npm@11" });
    await mkdir(join(cwd, "skills/foo"), { recursive: true });
    await writeFile(join(cwd, "AGENTS.md"), "user agents\n");
    await writeFile(join(cwd, "CLAUDE.md"), "user claude\n");
    await writeFile(join(cwd, "skills/foo/SKILL.md"), "user skill\n");

    const result = await new AgentFilesMigration().apply(await context(cwd));
    expect(result.filesDivergent).toEqual(expect.arrayContaining(["AGENTS.md", "CLAUDE.md"]));
    expect(await readFile(join(cwd, "AGENTS.md"), "utf8")).toBe("user agents\n");
    expect(await readFile(join(cwd, "CLAUDE.md"), "utf8")).toBe("user claude\n");
    // A skill at the pre-.agents path is the user's: kept, indexed, not duplicated.
    expect(await readFile(join(cwd, "skills/foo/SKILL.md"), "utf8")).toBe("user skill\n");
    expect(existsSync(join(cwd, ".agents/skills/foo"))).toBe(false);
    expect(await readFile(join(cwd, "skills.md"), "utf8")).toContain("(skills/foo/SKILL.md)");
  });

  // A CLAUDE.md that is a SYMLINK to the wrong target is a different branch of
  // fs.symlink() than a CLAUDE.md that is a plain file (the readlink()
  // target comparison only runs for an existing symlink). Both cases used to be
  // covered because CLAUDE.md was the file and .cursorrules the wrong link;
  // with .cursorrules gone, CLAUDE.md carries both.
  it("preserves a CLAUDE.md symlink pointing at the wrong target without --force", async () => {
    const cwd = await fixture({ name: "foo", packageManager: "npm@11" });
    await symlink("OTHER.md", join(cwd, "CLAUDE.md"));

    const result = await new AgentFilesMigration().apply(await context(cwd));
    expect(result.filesDivergent).toEqual(expect.arrayContaining(["CLAUDE.md"]));
    expect(result.notes?.join("\n")).toContain("preserved divergent links/files: CLAUDE.md");
    expect(await readlink(join(cwd, "CLAUDE.md"))).toBe("OTHER.md");
  });

  it("repoints a CLAUDE.md symlink pointing at the wrong target under --force", async () => {
    const cwd = await fixture({ name: "foo", packageManager: "npm@11" });
    await symlink("OTHER.md", join(cwd, "CLAUDE.md"));

    const result = await new AgentFilesMigration().apply(await context(cwd, true));
    expect(result.filesDivergent).toBeUndefined();
    expect(await readlink(join(cwd, "CLAUDE.md"))).toBe("AGENTS.md");
  });

  it("replaces divergent files and links under --force", async () => {
    const cwd = await fixture({ name: "foo", packageManager: "npm@11" });
    await mkdir(join(cwd, "skills/foo"), { recursive: true });
    await writeFile(join(cwd, "AGENTS.md"), "user agents\n");
    await writeFile(join(cwd, "CLAUDE.md"), "user claude\n");
    await writeFile(join(cwd, "skills/foo/SKILL.md"), "user skill\n");

    const result = await new AgentFilesMigration().apply(await context(cwd, true));
    expect(result.filesDivergent).toBeUndefined();
    expect(await readFile(join(cwd, "AGENTS.md"), "utf8")).toContain("Package manager: `npm`");
    expect(await readlink(join(cwd, "CLAUDE.md"))).toBe("AGENTS.md");
    expect(existsSync(join(cwd, ".cursorrules"))).toBe(false);
    // --force overwrites the migration's own paths, never a skill at a legacy one.
    expect(await readFile(join(cwd, "skills/foo/SKILL.md"), "utf8")).toBe("user skill\n");
    expect(existsSync(join(cwd, ".agents/skills/foo"))).toBe(false);
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
