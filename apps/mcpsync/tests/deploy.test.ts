import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runDeploy } from "../src/commands/deploy.js";
import {
  DEPLOY_ITEMS,
  executeDeploy,
  findManifest,
  installedExtensions,
  isArchive,
  matchTarget,
  planDeploy,
  resolveSource,
} from "../src/core/deploy.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "mcpsync-deploy-test-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  process.exitCode = 0;
});

/** Build a source extension dir with a manifest + the given item files/dirs. */
function makeSource(
  parent: string,
  manifest: Record<string, unknown>,
  items: Record<string, string> = { "dist/server.js": "// built" },
): string {
  const dir = join(parent, "source");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
  for (const [rel, content] of Object.entries(items)) {
    const p = join(dir, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, content);
  }
  return dir;
}

/** Build an installed-extensions root with one dir per (id, manifest.name). */
function makeExtRoot(parent: string, exts: Record<string, Record<string, unknown>>): string {
  const extRoot = join(parent, "Claude Extensions");
  for (const [id, manifest] of Object.entries(exts)) {
    const dir = join(extRoot, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
  }
  return extRoot;
}

describe("installedExtensions", () => {
  it("lists only subdirs with a parseable manifest.json", () => {
    const extRoot = makeExtRoot(root, {
      "local.foo": { name: "foo", display_name: "Foo", version: "1.0.0" },
    });
    // a dir with no manifest is ignored
    mkdirSync(join(extRoot, "junk"), { recursive: true });
    // a dir with a broken manifest is ignored
    mkdirSync(join(extRoot, "broken"), { recursive: true });
    writeFileSync(join(extRoot, "broken", "manifest.json"), "{ not json");

    const list = installedExtensions(extRoot);
    expect(list.map((e) => e.id)).toEqual(["local.foo"]);
    expect(list[0]?.manifest.name).toBe("foo");
  });

  it("returns [] for a missing root", () => {
    expect(installedExtensions(join(root, "nope"))).toEqual([]);
  });
});

describe("matchTarget", () => {
  const installed = [
    { id: "local.a", dir: "/x/local.a", manifest: { name: "alpha" } },
    { id: "gh.b", dir: "/x/gh.b", manifest: { name: "beta" } },
  ];
  it("matches by explicit ext id first", () => {
    expect(matchTarget(installed, { extId: "gh.b", name: "alpha" })?.id).toBe("gh.b");
  });
  it("falls back to manifest name", () => {
    expect(matchTarget(installed, { name: "alpha" })?.id).toBe("local.a");
  });
  it("returns null when nothing matches", () => {
    expect(matchTarget(installed, { name: "gamma" })).toBeNull();
    expect(matchTarget(installed, { extId: "missing" })).toBeNull();
  });
});

describe("findManifest", () => {
  it("reads a manifest at the dir root", () => {
    const dir = makeSource(root, { name: "foo" });
    expect(findManifest(dir)?.manifest.name).toBe("foo");
  });
  it("descends into a single wrapping subdir (archive layout)", () => {
    const outer = join(root, "outer");
    const inner = join(outer, "wrapped");
    mkdirSync(inner, { recursive: true });
    writeFileSync(join(inner, "manifest.json"), JSON.stringify({ name: "bar" }));
    const found = findManifest(outer);
    expect(found?.manifest.name).toBe("bar");
    expect(found?.dir).toBe(inner);
  });
  it("returns null when no manifest is found", () => {
    const dir = join(root, "empty");
    mkdirSync(dir, { recursive: true });
    expect(findManifest(dir)).toBeNull();
  });
});

describe("isArchive", () => {
  it("recognizes .mcpb/.dxt/.zip, case-insensitive", () => {
    expect(isArchive("x.mcpb")).toBe(true);
    expect(isArchive("x.DXT")).toBe(true);
    expect(isArchive("x.zip")).toBe(true);
    expect(isArchive("/path/to/built-dir")).toBe(false);
  });
});

describe("resolveSource", () => {
  it("uses a directory in place (no cleanup)", () => {
    const dir = makeSource(root, { name: "foo" });
    const r = resolveSource(dir);
    expect(r.dir).toBe(dir);
    expect(r.cleanup).toBeNull();
  });

  it("unzips an archive to a temp dir via the injected extractor, then cleans up", () => {
    const built = makeSource(root, { name: "foo" });
    // Simulate a packed archive as a plain file; the injected 'unzip' extracts
    // the fixture build into the temp dir.
    const archive = join(root, "foo.mcpb");
    writeFileSync(archive, "PK-not-a-real-zip");
    const r = resolveSource(archive, {
      tmpBase: root,
      unzip: (_archive, dest) => cpSync(built, dest, { recursive: true }),
    });
    expect(r.dir).not.toBe(archive);
    expect(findManifest(r.dir)?.manifest.name).toBe("foo");
    expect(r.cleanup).toBeTypeOf("function");
    r.cleanup?.();
    expect(installedExtensions(r.dir)).toEqual([]); // gone after cleanup
  });

  it("throws when the source path does not exist", () => {
    expect(() => resolveSource(join(root, "nope"))).toThrow(/source not found/);
  });
});

describe("planDeploy", () => {
  it("includes only present items, in DEPLOY_ITEMS order", () => {
    const dir = makeSource(
      root,
      { name: "foo" },
      {
        "dist/x.js": "x",
        "icon.png": "png",
      },
    );
    const plan = planDeploy(dir, "/target");
    expect(plan.map((p) => p.item)).toEqual(["dist", "manifest.json", "icon.png"]);
    expect(plan[0]?.to).toBe(join("/target", "dist"));
  });

  it("adds node_modules only with full", () => {
    const dir = makeSource(
      root,
      { name: "foo" },
      {
        "dist/x.js": "x",
        "node_modules/pkg/index.js": "y",
      },
    );
    expect(planDeploy(dir, "/t").map((p) => p.item)).not.toContain("node_modules");
    expect(planDeploy(dir, "/t", { full: true }).map((p) => p.item)).toContain("node_modules");
  });

  it("DEPLOY_ITEMS is the documented set", () => {
    expect([...DEPLOY_ITEMS]).toEqual(["dist", "native", "manifest.json", "icon.png", "assets"]);
  });
});

describe("executeDeploy", () => {
  it("replaces the target (rm then cp), clearing stale files", () => {
    const src = makeSource(root, { name: "foo" }, { "dist/new.js": "new" });
    const targetDir = join(root, "target");
    mkdirSync(join(targetDir, "dist"), { recursive: true });
    writeFileSync(join(targetDir, "dist", "stale.js"), "stale");

    executeDeploy(planDeploy(src, targetDir));
    expect(readFileSync(join(targetDir, "dist", "new.js"), "utf8")).toBe("new");
    // stale file from the old build is gone (rm before cp)
    expect(installedExtensions(targetDir)).toBeDefined();
    expect(() => readFileSync(join(targetDir, "dist", "stale.js"), "utf8")).toThrow();
  });
});

describe("runDeploy", () => {
  it("errors (exit 1) when the extensions root is missing", async () => {
    await runDeploy({ extRoot: join(root, "absent"), list: true });
    expect(process.exitCode).toBe(1);
  });

  it("dry-run computes the plan but writes nothing", async () => {
    const extRoot = makeExtRoot(root, { "local.foo": { name: "foo", display_name: "Foo" } });
    const src = makeSource(root, { name: "foo" }, { "dist/server.js": "built" });
    await runDeploy({ source: src, extRoot, dryRun: true });
    expect(process.exitCode).toBe(0);
    // target dist was never created
    expect(() => readFileSync(join(extRoot, "local.foo", "dist", "server.js"), "utf8")).toThrow();
  });

  it("with --yes replaces the matched extension's items", async () => {
    const extRoot = makeExtRoot(root, { "local.foo": { name: "foo", display_name: "Foo" } });
    const src = makeSource(root, { name: "foo" }, { "dist/server.js": "v2", "icon.png": "img" });
    await runDeploy({ source: src, extRoot, yes: true });
    expect(process.exitCode).toBe(0);
    expect(readFileSync(join(extRoot, "local.foo", "dist", "server.js"), "utf8")).toBe("v2");
    expect(readFileSync(join(extRoot, "local.foo", "icon.png"), "utf8")).toBe("img");
  });

  it("errors when no installed extension matches the source name", async () => {
    const extRoot = makeExtRoot(root, { "local.other": { name: "other" } });
    const src = makeSource(root, { name: "foo" }, { "dist/server.js": "built" });
    await runDeploy({ source: src, extRoot, yes: true });
    expect(process.exitCode).toBe(1);
    expect(() => readFileSync(join(extRoot, "local.other", "dist", "server.js"), "utf8")).toThrow();
  });

  it("errors when the source has a manifest but no dist/", async () => {
    const extRoot = makeExtRoot(root, { "local.foo": { name: "foo" } });
    const src = makeSource(root, { name: "foo" }, {}); // no items → no dist
    await runDeploy({ source: src, extRoot, yes: true });
    expect(process.exitCode).toBe(1);
  });
});
