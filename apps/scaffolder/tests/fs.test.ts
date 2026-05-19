import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeFs } from "../src/core/fs.js";

describe("fs helper", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "scaffolder-fs-test-"));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  describe("writeIfChanged", () => {
    it("returns 'created' when writing a new file", async () => {
      const fs = makeFs({ cwd, dryRun: false });
      expect(await fs.writeIfChanged("hello.txt", "world")).toBe("created");
      expect(await readFile(join(cwd, "hello.txt"), "utf8")).toBe("world");
    });

    it("returns 'unchanged' when re-writing identical content", async () => {
      const fs = makeFs({ cwd, dryRun: false });
      await fs.writeIfChanged("hello.txt", "world");
      expect(await fs.writeIfChanged("hello.txt", "world")).toBe("unchanged");
    });

    it("returns 'updated' when content differs", async () => {
      const fs = makeFs({ cwd, dryRun: false });
      await fs.writeIfChanged("hello.txt", "v1");
      expect(await fs.writeIfChanged("hello.txt", "v2")).toBe("updated");
      expect(await readFile(join(cwd, "hello.txt"), "utf8")).toBe("v2");
    });

    it("creates parent directories as needed", async () => {
      const fs = makeFs({ cwd, dryRun: false });
      const outcome = await fs.writeIfChanged("deep/nested/path/file.txt", "ok");
      expect(outcome).toBe("created");
      expect(existsSync(join(cwd, "deep/nested/path/file.txt"))).toBe(true);
    });

    it("dry-run: returns 'would-create' without touching disk", async () => {
      const fs = makeFs({ cwd, dryRun: true });
      expect(await fs.writeIfChanged("hello.txt", "world")).toBe("would-create");
      expect(existsSync(join(cwd, "hello.txt"))).toBe(false);
    });

    it("dry-run: returns 'would-update' for differing existing files", async () => {
      const fs = makeFs({ cwd, dryRun: false });
      await fs.writeIfChanged("hello.txt", "v1");

      const dryFs = makeFs({ cwd, dryRun: true });
      expect(await dryFs.writeIfChanged("hello.txt", "v2")).toBe("would-update");
      expect(await readFile(join(cwd, "hello.txt"), "utf8")).toBe("v1"); // not actually written
    });

    it("dry-run: still returns 'unchanged' when content matches", async () => {
      const fs = makeFs({ cwd, dryRun: false });
      await fs.writeIfChanged("hello.txt", "v1");

      const dryFs = makeFs({ cwd, dryRun: true });
      expect(await dryFs.writeIfChanged("hello.txt", "v1")).toBe("unchanged");
    });
  });

  describe("safe path traversal guard", () => {
    it("throws on .. attempts that escape cwd", () => {
      const fs = makeFs({ cwd, dryRun: false });
      expect(() => fs.safe("../escape")).toThrow(/escapes target cwd/);
      expect(() => fs.safe("a/../../escape")).toThrow(/escapes target cwd/);
    });

    it("accepts absolute paths that stay under cwd", () => {
      const fs = makeFs({ cwd, dryRun: false });
      expect(() => fs.safe(join(cwd, "ok.txt"))).not.toThrow();
    });

    it("throws on absolute paths outside cwd", () => {
      const fs = makeFs({ cwd, dryRun: false });
      expect(() => fs.safe("/tmp/elsewhere")).toThrow(/escapes target cwd/);
    });
  });

  describe("exists / read / ensureDir / remove", () => {
    it("exists() reflects file presence", async () => {
      const fs = makeFs({ cwd, dryRun: false });
      expect(fs.exists("nope.txt")).toBe(false);
      await fs.writeIfChanged("nope.txt", "hi");
      expect(fs.exists("nope.txt")).toBe(true);
    });

    it("read() returns content for an existing file", async () => {
      const fs = makeFs({ cwd, dryRun: false });
      await fs.writeIfChanged("hello.txt", "world");
      expect(await fs.read("hello.txt")).toBe("world");
    });

    it("read() returns undefined for a missing file", async () => {
      const fs = makeFs({ cwd, dryRun: false });
      expect(await fs.read("nope.txt")).toBeUndefined();
    });

    it("ensureDir creates the directory", async () => {
      const fs = makeFs({ cwd, dryRun: false });
      await fs.ensureDir("some/dir");
      expect(existsSync(join(cwd, "some/dir"))).toBe(true);
    });

    it("remove() is a no-op when the file doesn't exist", async () => {
      const fs = makeFs({ cwd, dryRun: false });
      await expect(fs.remove("nope.txt")).resolves.toBeUndefined();
    });

    it("remove() deletes an existing file", async () => {
      const fs = makeFs({ cwd, dryRun: false });
      await fs.writeIfChanged("doomed.txt", "bye");
      await fs.remove("doomed.txt");
      expect(fs.exists("doomed.txt")).toBe(false);
    });
  });

  describe("symlink", () => {
    it("creates a new symlink", async () => {
      const fs = makeFs({ cwd, dryRun: false });
      await fs.writeIfChanged("real.md", "real");
      const outcome = await fs.symlink("real.md", "link.md");
      expect(outcome).toBe("created");
      expect(await readFile(join(cwd, "link.md"), "utf8")).toBe("real");
    });

    it("returns 'unchanged' when the symlink already exists", async () => {
      const fs = makeFs({ cwd, dryRun: false });
      await fs.writeIfChanged("real.md", "real");
      await fs.symlink("real.md", "link.md");
      expect(await fs.symlink("real.md", "link.md")).toBe("unchanged");
    });

    it("dry-run: returns 'would-create' without making the link", async () => {
      const fs = makeFs({ cwd, dryRun: true });
      expect(await fs.symlink("AGENTS.md", "CLAUDE.md")).toBe("would-create");
      expect(existsSync(join(cwd, "CLAUDE.md"))).toBe(false);
    });
  });
});
