import { describe, expect, it } from "vitest";
import { installDependencies } from "../src/core/install-deps.js";
import { makeLogger } from "../src/core/logger.js";
import type { PhaseRunResult } from "../src/core/phase-runner.js";
import type { ShellHelper, ShellRunResult } from "../src/core/shell.js";

/**
 * Records what would have been executed. The real thing shells out to a package
 * manager and hits the network, which has no place in a unit test — the
 * behaviour under test is *whether and with what* we invoke it.
 */
function fakeShell(exitCode = 0): ShellHelper & { calls: Array<[string, readonly string[]]> } {
  const calls: Array<[string, readonly string[]]> = [];
  const result: ShellRunResult = { stdout: "", stderr: exitCode === 0 ? "" : "boom", exitCode };
  return {
    calls,
    dryRun: false,
    async run(command, args = []) {
      calls.push([command, args]);
      return result;
    },
    async tryRun(command, args = []) {
      calls.push([command, args]);
      return result;
    },
  };
}

function phasesWith(files: string[]): PhaseRunResult[] {
  return [
    {
      phaseId: "08-app",
      results: [
        {
          migrationId: "08-app/m1-app-port",
          durationMs: 1,
          result: { status: "applied", filesChanged: files },
        },
      ],
    } as unknown as PhaseRunResult,
  ];
}

const base = {
  log: makeLogger({ verbose: false }),
  cwd: "/tmp/does-not-need-to-exist",
  dryRun: false,
  enabled: true,
  packageManager: "pnpm" as const,
};

describe("installDependencies", () => {
  it("installs with the detected package manager when a manifest changed", async () => {
    const shell = fakeShell();
    const outcome = await installDependencies({
      ...base,
      packageManager: "bun",
      shell,
      phases: phasesWith(["apps/foo-mcp/package.json", "apps/foo-mcp/src/cli.ts"]),
    });

    expect(outcome.status).toBe("installed");
    expect(shell.calls).toEqual([["bun", ["install"]]]);
  });

  it("passes --no-frozen-lockfile to pnpm", async () => {
    const shell = fakeShell();
    await installDependencies({ ...base, shell, phases: phasesWith(["package.json"]) });

    // This install runs because dependencies just changed, so updating the
    // lockfile is the intent. Matches the flag the smoke task already carries.
    expect(shell.calls).toEqual([["pnpm", ["install", "--no-frozen-lockfile"]]]);
  });

  it("counts pnpm-workspace.yaml as a dependency change", async () => {
    const shell = fakeShell();
    const outcome = await installDependencies({
      ...base,
      shell,
      phases: phasesWith(["pnpm-workspace.yaml"]),
    });

    // Adding a workspace member changes the install graph even though no
    // package.json in this run was touched.
    expect(outcome.status).toBe("installed");
  });

  it("skips when nothing dependency-shaped changed", async () => {
    const shell = fakeShell();
    const outcome = await installDependencies({
      ...base,
      shell,
      phases: phasesWith(["README.md", "src/index.ts"]),
    });

    expect(outcome).toEqual({ status: "skipped", reason: "no dependency files changed" });
    expect(shell.calls).toEqual([]);
  });

  it("never installs during a dry run", async () => {
    const shell = fakeShell();
    const outcome = await installDependencies({
      ...base,
      dryRun: true,
      shell,
      phases: phasesWith(["package.json"]),
    });

    expect(outcome).toEqual({ status: "skipped", reason: "dry-run" });
    expect(shell.calls).toEqual([]);
  });

  it("honours --no-install", async () => {
    const shell = fakeShell();
    const outcome = await installDependencies({
      ...base,
      enabled: false,
      shell,
      phases: phasesWith(["package.json"]),
    });

    expect(outcome).toEqual({ status: "skipped", reason: "--no-install" });
    expect(shell.calls).toEqual([]);
  });

  it("reports a failed install instead of throwing", async () => {
    const shell = fakeShell(1);
    const outcome = await installDependencies({
      ...base,
      shell,
      phases: phasesWith(["package.json"]),
    });

    // The generated files are already correct on disk; failing the whole
    // scaffold over a transient registry error would be the worse trade.
    expect(outcome.status).toBe("failed");
    if (outcome.status === "failed") expect(outcome.message).toContain("boom");
  });
});
