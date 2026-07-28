import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildProgram } from "../src/core/program.js";

const cleanup: string[] = [];

async function target(packageJson?: Record<string, unknown>): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "scaffolder-program-test-"));
  cleanup.push(cwd);
  if (packageJson) {
    await writeFile(join(cwd, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
  }
  return cwd;
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const cwd of cleanup.splice(0)) await rm(cwd, { recursive: true, force: true });
});

describe("migrate command safety defaults", () => {
  it("defaults to existing-mode dry-run and writes nothing without --execute", async () => {
    const cwd = await target({ name: "flat-tool", packageManager: "npm@11" });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await buildProgram().parseAsync(["--no-banner", "migrate", "11-agent-files", "--target", cwd], {
      from: "user",
    });
    expect(existsSync(join(cwd, "AGENTS.md"))).toBe(false);
    expect(existsSync(join(cwd, "CLAUDE.md"))).toBe(false);
  });

  it("keeps explicit --mode new as the forceful generation path", async () => {
    const cwd = await target({ name: "fresh-tool" });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await buildProgram().parseAsync(
      ["--no-banner", "migrate", "02-toolchain/m1-mise", "--target", cwd, "--mode", "new"],
      { from: "user" },
    );
    expect(existsSync(join(cwd, "mise.toml"))).toBe(true);
  });

  it.each(["npm", "bun"] as const)(
    "rejects %s in new mode before filesystem writes",
    async (packageManager) => {
      const cwd = await target();
      vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      await expect(
        buildProgram().parseAsync(
          ["--no-banner", "init", cwd, "--name", "fresh-tool", "--package-manager", packageManager],
          { from: "user" },
        ),
      ).rejects.toThrow(/Fresh scaffolds support pnpm only/);
      expect(existsSync(join(cwd, "package.json"))).toBe(false);
      expect(existsSync(join(cwd, "mise.toml"))).toBe(false);
    },
  );

  it("supports a registry-backed runtime without generating local robustness source", async () => {
    const cwd = await target();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await buildProgram().parseAsync(
      ["--no-banner", "init", cwd, "--name", "fresh-tool", "--runtime-source", "registry"],
      { from: "user" },
    );

    expect(existsSync(join(cwd, "packages", "robustness"))).toBe(false);
    const pkg = JSON.parse(
      await readFile(join(cwd, "apps", "fresh-tool-mcp", "package.json"), "utf8"),
    );
    expect(pkg.dependencies["@george43g/robustness"]).toBe("^0.1.0");
    const mcpKit = JSON.parse(
      await readFile(join(cwd, "packages", "mcp-kit", "package.json"), "utf8"),
    );
    expect(mcpKit.dependencies["@george43g/robustness"]).toBe("^0.1.0");
  });

  it("ships a named CLI artifact baseline and portable workspace skills", async () => {
    const cwd = await target();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await buildProgram().parseAsync(["--no-banner", "init", cwd, "--name", "fresh-tool"], {
      from: "user",
    });

    const app = join(cwd, "apps", "fresh-tool-mcp");
    for (const path of [
      join(app, "completions", "fresh-tool.bash"),
      join(app, "completions", "_fresh-tool"),
      join(app, "completions", "fresh-tool.fish"),
      join(app, "man", "fresh-tool.1"),
      join(app, "docs", "cli", "index.md"),
      join(cwd, "skills", "cli-artifacts", "SKILL.md"),
      join(cwd, "skills", "workspace-scaffolding", "SKILL.md"),
      join(cwd, "docs", "NATIVE_SCAFFOLDERS.md"),
    ]) {
      expect(existsSync(path), `expected generated path ${path}`).toBe(true);
    }

    const completion = await readFile(join(app, "completions", "fresh-tool.bash"), "utf8");
    const manpage = await readFile(join(app, "man", "fresh-tool.1"), "utf8");
    const docs = await readFile(join(app, "docs", "cli", "index.md"), "utf8");
    expect(completion).toContain("_fresh_tool()");
    expect(completion).not.toContain("example-repo");
    expect(manpage).toContain(".TH FRESH-TOOL 1");
    expect(docs).toContain("# `fresh-tool`");
  });
});

describe("existing target strategies and reports", () => {
  it("applies only generic-safe migrations by default", async () => {
    const cwd = await target({
      name: "@scope/flat-tool-mcp",
      packageManager: "pnpm@10.29.3",
      scripts: { test: "vitest run" },
    });
    const reportPath = join(cwd, "migration-report.json");
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await buildProgram().parseAsync(
      ["--no-banner", "apply", "--target", cwd, "--execute", "--report-json", reportPath],
      { from: "user" },
    );

    expect(existsSync(join(cwd, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(cwd, "mise.toml"))).toBe(false);
    expect(existsSync(join(cwd, "packages", "robustness"))).toBe(false);

    const report = JSON.parse(await readFile(reportPath, "utf8"));
    expect(report.target.profile).toBe("generic-existing");
    expect(report.command.existingStrategy).toBe("safe");
    expect(report.command.runtimeSource).toBe("source");
    expect(
      report.phases
        .flatMap(
          (phase: { migrations: Array<{ migrationId: string; status: string }> }) =>
            phase.migrations,
        )
        .find(
          (migration: { migrationId: string }) =>
            migration.migrationId === "04-robustness/m1-robustness-pkg",
        )?.status,
    ).toBe("skipped");
  });

  it("runs starter migrations for a complete starter layout", async () => {
    const cwd = await target({ name: "starter-tool", packageManager: "pnpm@10.29.3" });
    await mkdir(join(cwd, "apps"));
    await mkdir(join(cwd, "packages"));
    await writeFile(join(cwd, "turbo.json"), "{}\n");
    await writeFile(join(cwd, "pnpm-workspace.yaml"), "packages: []\n");
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await buildProgram().parseAsync(["--no-banner", "apply", "--target", cwd, "--execute"], {
      from: "user",
    });

    expect(existsSync(join(cwd, "mise.toml"))).toBe(true);
    expect(existsSync(join(cwd, "packages", "robustness", "package.json"))).toBe(true);
  });

  it("lets full strategy opt a generic target into starter infrastructure", async () => {
    const cwd = await target({ name: "flat-tool", packageManager: "pnpm@10.29.3" });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await buildProgram().parseAsync(
      ["--no-banner", "apply", "--target", cwd, "--execute", "--existing-strategy", "full"],
      { from: "user" },
    );
    expect(existsSync(join(cwd, "packages", "robustness", "package.json"))).toBe(true);
  });
});
