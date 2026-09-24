import { execSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildProgram } from "../src/core/program.js";
import { rangeFor } from "../src/core/runtime-source.js";
import { PUBLISHED_PACKAGES } from "../src/generated/published-versions.js";

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
    await buildProgram().parseAsync(
      ["--no-banner", "migrate", "11-agent-files", "--target", cwd, "--no-install"],
      {
        from: "user",
      },
    );
    expect(existsSync(join(cwd, "AGENTS.md"))).toBe(false);
    expect(existsSync(join(cwd, "CLAUDE.md"))).toBe(false);
  });

  it("keeps explicit --mode new as the forceful generation path", async () => {
    const cwd = await target({ name: "fresh-tool" });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await buildProgram().parseAsync(
      [
        "--no-banner",
        "migrate",
        "02-toolchain/m1-mise",
        "--target",
        cwd,
        "--mode",
        "new",
        "--no-install",
      ],
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
          [
            "--no-banner",
            "init",
            cwd,
            "--name",
            "fresh-tool",
            "--package-manager",
            packageManager,
            "--no-install",
          ],
          { from: "user" },
        ),
      ).rejects.toThrow(/Fresh scaffolds support pnpm only/);
      expect(existsSync(join(cwd, "package.json"))).toBe(false);
      expect(existsSync(join(cwd, "mise.toml"))).toBe(false);
    },
  );

  it("never generates local source for a published package", async () => {
    const cwd = await target();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await buildProgram().parseAsync(
      ["--no-banner", "init", cwd, "--name", "fresh-tool", "--no-install"],
      {
        from: "user",
      },
    );

    // EVERY published package, not just robustness — mcp-kit shipped as
    // vendored source until 0.1.0 (2026-08-22), and the only thing that made
    // that visible was the E2E smoke. Enumerating the list means the next
    // package to publish cannot be half-de-vendored without this failing.
    expect(PUBLISHED_PACKAGES.length).toBeGreaterThanOrEqual(5);
    for (const { dir } of PUBLISHED_PACKAGES) {
      expect(existsSync(join(cwd, "packages", dir))).toBe(false);
    }
    const pkg = JSON.parse(await readFile(join(cwd, "apps", "fresh-tool", "package.json"), "utf8"));
    // Derived, not literal — a hardcoded range here is what let the scaffolder
    // ship "^0.1.0" while robustness was on 0.2.1.
    for (const { name } of PUBLISHED_PACKAGES) {
      expect(pkg.dependencies[name]).toBe(rangeFor(name));
      expect(pkg.dependencies[name]).not.toContain("workspace:");
    }
  });

  it("ships a named CLI artifact baseline and portable workspace skills", async () => {
    const cwd = await target();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await buildProgram().parseAsync(
      ["--no-banner", "init", cwd, "--name", "fresh-tool", "--no-install"],
      {
        from: "user",
      },
    );

    const app = join(cwd, "apps", "fresh-tool");
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

// The app's name is taken AS GIVEN: no suffix appended, none rejected. The
// installed bin, the commander name `--help` prints, and every path and key
// derived from the name must agree — before this, the bin was the bare token
// while cli.ts regex-stripped `-mcp` off the package name at runtime, and the
// two agreed only because a bare name could never end in `-mcp`.
describe("init names the app verbatim", () => {
  it.each(["fresh-tool", "fresh-tool-mcp"])("--name %s", async (name) => {
    const cwd = await target();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await buildProgram().parseAsync(["--no-banner", "init", cwd, "--name", name, "--no-install"], {
      from: "user",
    });

    const app = join(cwd, "apps", name);
    const pkg = JSON.parse(await readFile(join(app, "package.json"), "utf8"));
    expect(pkg.name).toBe(`@george43g/${name}`);
    expect(Object.keys(pkg.bin)).toEqual([name]);
    expect(existsSync(join(cwd, "apps", `${name}-mcp`))).toBe(false);

    // The commander name comes from the bin, not from the package name.
    const cli = await readFile(join(app, "src", "cli.ts"), "utf8");
    expect(cli).toMatch(/\.name\(CLI_NAME\)/);
    expect(cli).not.toMatch(/-mcp\$/);
    const access = await readFile(join(app, "src", "access-check.ts"), "utf8");
    expect(access).not.toMatch(/-mcp\$/);

    // usage(1) spec, dev-server key and its paths all carry the same name.
    expect(await readFile(join(app, ".usage.kdl"), "utf8")).toContain(`bin "${name}"`);
    const mcp = JSON.parse(await readFile(join(cwd, ".mcp.json"), "utf8"));
    const dev = mcp.mcpServers[`${name}-dev`];
    expect(dev, JSON.stringify(Object.keys(mcp.mcpServers))).toBeDefined();
    expect(dev.env.MCP_DEV_ENTRY).toBe(`apps/${name}/src/index.ts`);
  });
});

// With the app named verbatim, a root package ALSO called `<name>` wins
// `pnpm --filter <name>` (pnpm matches the exact unscoped name before the
// scoped app — measured). The fresh root is `<name>-workspace` so the short
// filter reaches the app.
describe("init names the root so it cannot shadow the app", () => {
  it("pnpm --filter <name> resolves to the app, not the root", async () => {
    const cwd = await target();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await buildProgram().parseAsync(["--no-banner", "init", cwd, "--name", "foo", "--no-install"], {
      from: "user",
    });
    const root = JSON.parse(await readFile(join(cwd, "package.json"), "utf8"));
    expect(root.name).toBe("foo-workspace");
    expect(root.private).toBe(true);
    // `node -e` rather than `pwd` (absent on Windows), and a shell on win32
    // because pnpm there is a .cmd shim that execFile cannot spawn directly.
    // One command string, not an args array: Node 24 deprecates args + shell
    // (DEP0190). Every token here is a literal.
    const where = execSync('pnpm --filter foo exec node -e "console.log(process.cwd())"', {
      cwd,
      encoding: "utf8",
      env: { ...process.env, npm_config_verify_deps_before_run: "false" },
    });
    // `.native` expands Windows 8.3 short names (RUNNER~1 vs runneradmin):
    // the temp dir comes back short, the child's cwd long, and the JS
    // realpath leaves both as given.
    expect(realpathSync.native(where.trim())).toBe(realpathSync.native(join(cwd, "apps", "foo")));
  }, 60_000);
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
      [
        "--no-banner",
        "apply",
        "--target",
        cwd,
        "--execute",
        "--report-json",
        reportPath,
        "--no-install",
      ],
      { from: "user" },
    );

    expect(existsSync(join(cwd, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(cwd, "mise.toml"))).toBe(false);
    expect(existsSync(join(cwd, "packages", "robustness"))).toBe(false);

    const report = JSON.parse(await readFile(reportPath, "utf8"));
    expect(report.target.profile).toBe("generic-existing");
    expect(report.command.existingStrategy).toBe("safe");
    expect(
      report.phases
        .flatMap(
          (phase: { migrations: Array<{ migrationId: string; status: string }> }) =>
            phase.migrations,
        )
        .find(
          (migration: { migrationId: string }) =>
            migration.migrationId === "07-shared-types/m1-shared-types",
        )?.status,
    ).toBe("skipped");
  });

  // An OLD generated repo: root `foo`, app at apps/foo-mcp. Re-stamped files
  // must point at the app that exists, not at apps/foo.
  it("re-stamps an old generated repo against its existing app dir", async () => {
    const cwd = await target({ name: "foo", packageManager: "pnpm@10.29.3" });
    await mkdir(join(cwd, "apps", "foo-mcp"), { recursive: true });
    await writeFile(
      join(cwd, "apps", "foo-mcp", "package.json"),
      JSON.stringify({ name: "@george43g/foo-mcp", dependencies: { "@george43g/mcp-kit": "^2" } }),
    );
    await mkdir(join(cwd, "packages"));
    await writeFile(join(cwd, "turbo.json"), "{}\n");
    await writeFile(join(cwd, "pnpm-workspace.yaml"), "packages: []\n");
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await buildProgram().parseAsync(
      ["--no-banner", "apply", "--target", cwd, "--execute", "--no-install"],
      { from: "user" },
    );

    expect(out.mock.calls.map((c) => String(c[0])).join("")).toMatch(
      /Tool name "foo-mcp" taken from apps\/foo-mcp/,
    );
    expect(existsSync(join(cwd, "apps", "foo"))).toBe(false);
    const mcp = JSON.parse(await readFile(join(cwd, ".mcp.json"), "utf8"));
    expect(mcp.mcpServers["foo-mcp-dev"].env.MCP_DEV_ENTRY).toBe("apps/foo-mcp/src/index.ts");
    expect(await readFile(join(cwd, "mise.toml"), "utf8")).toContain(
      "pnpm --filter @george43g/foo-mcp screenshots",
    );
    // The root is the user's; existing mode never renames it.
    expect(JSON.parse(await readFile(join(cwd, "package.json"), "utf8")).name).toBe("foo");
  });

  it("runs starter migrations for a complete starter layout", async () => {
    const cwd = await target({ name: "starter-tool", packageManager: "pnpm@10.29.3" });
    await mkdir(join(cwd, "apps"));
    await mkdir(join(cwd, "packages"));
    await writeFile(join(cwd, "turbo.json"), "{}\n");
    await writeFile(join(cwd, "pnpm-workspace.yaml"), "packages: []\n");
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await buildProgram().parseAsync(
      ["--no-banner", "apply", "--target", cwd, "--execute", "--no-install"],
      {
        from: "user",
      },
    );

    expect(existsSync(join(cwd, "mise.toml"))).toBe(true);
    expect(existsSync(join(cwd, "packages", "shared-types", "package.json"))).toBe(true);
  });

  it("lets full strategy opt a generic target into starter infrastructure", async () => {
    const cwd = await target({ name: "flat-tool", packageManager: "pnpm@10.29.3" });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await buildProgram().parseAsync(
      [
        "--no-banner",
        "apply",
        "--target",
        cwd,
        "--execute",
        "--existing-strategy",
        "full",
        "--no-install",
      ],
      { from: "user" },
    );
    expect(existsSync(join(cwd, "packages", "shared-types", "package.json"))).toBe(true);
  });
});
