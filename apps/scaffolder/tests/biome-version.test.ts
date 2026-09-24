import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BIOME_VERSION, biomeSchemaUrl, biomeVersionFor } from "../src/core/biome-version.js";
import { buildProgram } from "../src/core/program.js";

// A generated repo pinned biome.json's schema at 2.5.5 while depending on
// `^2.5.5`; a fresh install resolved 2.5.14 and every lint printed "schema
// version does not match" twice (recall, 2026-09-24). These hold the pin, the
// schema, and this repo's own Biome in step, so the next bump cannot half-land.

const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const cleanup: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const d of cleanup.splice(0)) await rm(d, { recursive: true, force: true });
});

describe("Biome version and schema stay in step", () => {
  it("this repo pins Biome exactly, at BIOME_VERSION", () => {
    expect(readJson(join(REPO_ROOT, "package.json")).devDependencies["@biomejs/biome"]).toBe(
      BIOME_VERSION,
    );
  });

  it.each(["biome.json", "packages/biome-config/biome.json"])(
    "this repo's %s names the BIOME_VERSION schema",
    (rel) => {
      expect(readJson(join(REPO_ROOT, rel)).$schema).toBe(biomeSchemaUrl(BIOME_VERSION));
    },
  );

  it("a fresh scaffold pins the CLI exactly and stamps the matching schema", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "biome-version-"));
    cleanup.push(cwd);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await buildProgram().parseAsync(
      ["--no-banner", "init", cwd, "--name", "fresh-tool", "--no-install"],
      { from: "user" },
    );
    const pkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf8"));
    expect(pkg.devDependencies["@biomejs/biome"]).toBe(BIOME_VERSION);
    for (const rel of ["biome.json", "packages/biome-config/biome.json"]) {
      expect(JSON.parse(await readFile(join(cwd, rel), "utf8")).$schema).toBe(
        biomeSchemaUrl(BIOME_VERSION),
      );
    }
  });
});

describe("biomeVersionFor", () => {
  it("prefers the Biome already installed in the target", () => {
    const cwd = mkdtempSync(join(tmpdir(), "biome-installed-"));
    cleanup.push(cwd);
    mkdirSync(join(cwd, "node_modules", "@biomejs", "biome"), { recursive: true });
    writeFileSync(
      join(cwd, "node_modules", "@biomejs", "biome", "package.json"),
      JSON.stringify({ version: "2.9.1" }),
    );
    expect(biomeVersionFor(cwd)).toBe("2.9.1");
    rmSync(join(cwd, "node_modules"), { recursive: true });
    expect(biomeVersionFor(cwd)).toBe(BIOME_VERSION);
  });
});
