/**
 * RETROFIT.md generation — unit + integration coverage.
 *
 * Tests the three pieces independently:
 *   - retrofitIntent() output on the three 'new'-only migrations
 *   - collectIntents() filters skipped + divergent rows correctly
 *   - renderRetrofitMarkdown() produces a runnable document
 *
 * Also a full integration test: run the phase runner against an empty
 * existing-mode tempdir + assert RETROFIT.md lands at the target root
 * with the expected sections.
 */

import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Config } from "../src/core/config.js";
import { makeFs } from "../src/core/fs.js";
import { makeGit } from "../src/core/git.js";
import { makeLogger } from "../src/core/logger.js";
import type { MigrationContext } from "../src/core/migration.js";
import { loadPhases, runPhases } from "../src/core/phase-runner.js";
import { collectIntents, renderRetrofitMarkdown } from "../src/core/retrofit.js";
import { makeShell } from "../src/core/shell.js";
import { inspectTarget } from "../src/core/target-inspection.js";
import M4Monorepo from "../src/phases/01-bootstrap/m4-monorepo.js";
import M1AppPort from "../src/phases/08-app/m1-app-port.js";
import M1RustAccel from "../src/phases/09-rust-accel/m1-rust-accel.js";

async function makeExistingModeCtx(opts: { name?: string; scope?: string } = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "scaffolder-retrofit-test-"));
  const dryRun = false;
  const force = false; // apply-mode default
  const log = makeLogger({ verbose: false });
  const shell = makeShell({ cwd, dryRun });
  const fs = makeFs({ cwd, dryRun, force });
  const git = makeGit(shell);
  const config = new Config();
  const name = opts.name ?? "foo";
  config.global.repoName.set(name);
  config.global.scope.set(opts.scope ?? "@george43g");
  config.global.mode.set("existing");
  config.global.packageManager.set("pnpm");
  config.global.runtimeSource.set("source");
  config.global.monorepo.set(true);
  const ctx: MigrationContext = {
    config,
    cwd,
    target: await inspectTarget({
      cwd,
      mode: "existing",
      explicitName: name,
      explicitPackageManager: "pnpm",
    }),
    mode: "existing",
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

describe("retrofitIntent() — 'new'-only migrations", () => {
  it("01-bootstrap/m4-monorepo emits a self-contained retrofit intent", async () => {
    const { ctx } = await makeExistingModeCtx({ name: "wm" });
    trashCans.push(ctx.cwd);

    const intent = new M4Monorepo().retrofitIntent?.(ctx);
    expect(intent).toBeDefined();
    if (!intent) return;
    expect(intent.summary).toMatch(/monorepo/i);
    expect(intent.rationale).toMatch(/appliesTo=new/);
    // Manual steps actually mention the load-bearing edits
    expect(intent.manualSteps.length).toBeGreaterThanOrEqual(3);
    expect(intent.manualSteps.join("\n")).toMatch(/pnpm-workspace\.yaml/);
    expect(intent.manualSteps.join("\n")).toMatch(/turbo\.json/);
    // Prompt is long enough to be runnable + references the source repo
    expect(intent.prompt.length).toBeGreaterThan(500);
    expect(intent.prompt).toMatch(/mcp-cli-starter-template/);
    expect(intent.prompt).toMatch(/turbo/i);
    // User's repo name substituted into the concrete app path
    expect(intent.prompt).toContain("apps/wm-mcp/");
  });

  it("08-app/m1-app-port emits a retrofit intent referencing the architect skill", async () => {
    const { ctx } = await makeExistingModeCtx({ name: "wm" });
    trashCans.push(ctx.cwd);

    const intent = new M1AppPort().retrofitIntent?.(ctx);
    expect(intent).toBeDefined();
    if (!intent) return;
    expect(intent.summary).toMatch(/apps\//);
    expect(intent.prompt).toMatch(/dispatcher invariants/i);
    expect(intent.prompt).toMatch(/skills\/mcp-starter-architect\/SKILL\.md/);
    expect(intent.prompt).toMatch(/robustness/);
    expect(intent.prompt).toMatch(/mcp-kit/);
  });

  it("09-rust-accel/m1-rust-accel emits a retrofit intent that probes for a real hot path", async () => {
    const { ctx } = await makeExistingModeCtx();
    trashCans.push(ctx.cwd);

    const intent = new M1RustAccel().retrofitIntent?.(ctx);
    expect(intent).toBeDefined();
    if (!intent) return;
    expect(intent.prompt).toMatch(/hot path/i);
    expect(intent.prompt).toMatch(/napi/i);
    expect(intent.prompt).toMatch(/drift/i);
  });
});

describe("collectIntents()", () => {
  it("includes skipped migrations that have retrofitIntent()", async () => {
    const { ctx } = await makeExistingModeCtx();
    trashCans.push(ctx.cwd);

    const phases = await loadPhases();
    const phaseResults = await runPhases(phases, ctx);
    const intents = collectIntents(phaseResults, ctx);

    const ids = intents.map((i) => i.migrationId);
    // All three 'new'-only migrations with intents must surface
    expect(ids).toContain("01-bootstrap/m4-monorepo");
    expect(ids).toContain("08-app/m1-app-port");
    expect(ids).toContain("09-rust-accel/m1-rust-accel");
  });

  it("drops migrations that don't implement retrofitIntent()", async () => {
    const { ctx } = await makeExistingModeCtx();
    trashCans.push(ctx.cwd);

    const phases = await loadPhases();
    const phaseResults = await runPhases(phases, ctx);
    const intents = collectIntents(phaseResults, ctx);

    const ids = intents.map((i) => i.migrationId);
    // m2-pkg-manager + m3-tool-name are config-only — they skip but should
    // NOT show up as intents (intentional: nothing to retrofit).
    expect(ids).not.toContain("01-bootstrap/m2-pkg-manager");
    expect(ids).not.toContain("01-bootstrap/m3-tool-name");
  });
});

describe("renderRetrofitMarkdown()", () => {
  it("emits a heading + section per intent + a 'where to read more' footer", async () => {
    const { ctx } = await makeExistingModeCtx({ name: "foo" });
    trashCans.push(ctx.cwd);

    const phases = await loadPhases();
    const phaseResults = await runPhases(phases, ctx);
    const intents = collectIntents(phaseResults, ctx);
    const md = renderRetrofitMarkdown(intents);

    expect(md).toMatch(/^# Retrofit guide/);
    expect(md).toContain("## 01-bootstrap/m4-monorepo");
    expect(md).toContain("## 08-app/m1-app-port");
    expect(md).toContain("## 09-rust-accel/m1-rust-accel");
    expect(md).toContain("**Manual steps:**");
    expect(md).toContain("**Sample AI prompt**");
    expect(md).toContain("## Where to read more");
    expect(md).toContain(
      "https://github.com/george43g/mcp-cli-starter-template/blob/main/skills/mcp-starter-architect/SKILL.md",
    );
    expect(md).toContain("migration sources are not copied into retrofit targets");
  });

  it("is deterministic — two renders of the same input produce identical output", async () => {
    const { ctx } = await makeExistingModeCtx({ name: "foo" });
    trashCans.push(ctx.cwd);

    const phases = await loadPhases();
    const phaseResults = await runPhases(phases, ctx);
    const intents = collectIntents(phaseResults, ctx);

    const a = renderRetrofitMarkdown(intents);
    const b = renderRetrofitMarkdown(intents);
    expect(a).toBe(b);
  });
});

describe("integration — apply --execute writes RETROFIT.md", () => {
  it("writes RETROFIT.md at the target root when there's at least one intent", async () => {
    const { cwd, ctx } = await makeExistingModeCtx({ name: "foo" });
    trashCans.push(cwd);

    // Drop a minimal package.json so the dir looks like a real repo target
    // (the migrations still skip because appliesTo=new, which is the point).
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify({ name: "foo", version: "0.0.0", private: true }, null, 2),
    );

    const phases = await loadPhases();
    const phaseResults = await runPhases(phases, ctx);
    const intents = collectIntents(phaseResults, ctx);
    expect(intents.length).toBeGreaterThanOrEqual(3);
    await ctx.fs.writeIfChanged("RETROFIT.md", renderRetrofitMarkdown(intents));

    const retrofitPath = join(cwd, "RETROFIT.md");
    expect(existsSync(retrofitPath)).toBe(true);
    const body = await readFile(retrofitPath, "utf8");
    expect(body).toMatch(/^# Retrofit guide/);
    expect(body).toContain("## 08-app/m1-app-port");
    // The prompt block must be fenced so the user can copy-paste it
    expect(body).toMatch(/```\n[^`]*Retrofit my existing MCP server/);
  });
});
