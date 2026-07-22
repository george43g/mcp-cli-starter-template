import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectTarget } from "../src/core/target-inspection.js";

const cleanup: string[] = [];

async function target(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "scaffolder-inspection-test-"));
  cleanup.push(cwd);
  return cwd;
}

async function pkg(cwd: string, value: unknown): Promise<void> {
  await writeFile(join(cwd, "package.json"), JSON.stringify(value));
}

afterEach(async () => {
  for (const cwd of cleanup.splice(0)) await rm(cwd, { recursive: true, force: true });
});

describe("inspectTarget name resolution", () => {
  it("derives an unscoped bare name and removes one trailing -mcp", async () => {
    const cwd = await target();
    await pkg(cwd, { name: "@scope/my-tool-mcp" });
    const result = await inspectTarget({ cwd, mode: "existing" });
    expect(result.repoName).toBe("my-tool");
    expect(result.repoNameSource).toBe("package.json");
    expect(result.fallbackWarning).toBeUndefined();
  });

  it("lets explicit --name win over package metadata", async () => {
    const cwd = await target();
    await pkg(cwd, { name: "package-name" });
    const result = await inspectTarget({ cwd, mode: "existing", explicitName: "explicit-name" });
    expect(result.repoName).toBe("explicit-name");
    expect(result.repoNameSource).toBe("explicit");
  });

  it.each([
    ["missing", undefined],
    ["malformed", "{"],
    ["nameless", JSON.stringify({ version: "1.0.0" })],
    ["invalid", JSON.stringify({ name: "Not Valid" })],
  ])("warns once and falls back for %s package metadata", async (_label, raw) => {
    const cwd = await target();
    if (raw !== undefined) await writeFile(join(cwd, "package.json"), raw);
    const result = await inspectTarget({ cwd, mode: "existing" });
    expect(result.repoName).toBe("mcp-starter");
    expect(result.repoNameSource).toBe("fallback");
    expect(result.fallbackWarning).toMatch(/TARGET NAME FALLBACK/);
  });
});

describe("inspectTarget package-manager precedence", () => {
  it("prefers explicit value over package metadata and lockfiles", async () => {
    const cwd = await target();
    await pkg(cwd, { name: "foo", packageManager: "pnpm@10.29.3" });
    await writeFile(join(cwd, "pnpm-lock.yaml"), "");
    const result = await inspectTarget({
      cwd,
      mode: "existing",
      explicitPackageManager: "bun",
    });
    expect(result.packageManager).toBe("bun");
    expect(result.packageManagerSource).toBe("explicit");
  });

  it("prefers package.json packageManager over lockfiles", async () => {
    const cwd = await target();
    await pkg(cwd, { name: "foo", packageManager: "npm@11.0.0" });
    await writeFile(join(cwd, "pnpm-lock.yaml"), "");
    const result = await inspectTarget({ cwd, mode: "existing" });
    expect(result.packageManager).toBe("npm");
    expect(result.packageManagerSource).toBe("package.json");
  });

  it.each([
    ["pnpm-lock.yaml", "pnpm"],
    ["package-lock.json", "npm"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
  ] as const)("detects %s", async (lockfile, expected) => {
    const cwd = await target();
    await pkg(cwd, { name: "foo" });
    await writeFile(join(cwd, lockfile), "");
    expect((await inspectTarget({ cwd, mode: "existing" })).packageManager).toBe(expected);
  });

  it("falls back to npm for unidentified existing repos and pnpm for new mode", async () => {
    const cwd = await target();
    await pkg(cwd, { name: "foo" });
    expect((await inspectTarget({ cwd, mode: "existing" })).packageManager).toBe("npm");
    expect((await inspectTarget({ cwd, mode: "new" })).packageManager).toBe("pnpm");
  });
});

describe("inspectTarget starter layout detection", () => {
  it("requires every starter marker", async () => {
    const cwd = await target();
    await pkg(cwd, { name: "foo" });
    await mkdir(join(cwd, "apps"));
    await mkdir(join(cwd, "packages"));
    await writeFile(join(cwd, "turbo.json"), "{}");
    expect((await inspectTarget({ cwd, mode: "existing" })).starterLayout).toBe(false);
    await writeFile(join(cwd, "pnpm-workspace.yaml"), "packages: []\n");
    expect((await inspectTarget({ cwd, mode: "existing" })).starterLayout).toBe(true);
  });
});
