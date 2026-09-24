import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findStaleBuild, staleBuildMessage } from "../src/core/stale-build.js";

// The globally linked mcp-scaffold runs apps/scaffolder/dist/cli.js from the
// primary checkout. On 2026-09-24 that dist/ predated three merged PRs, and a
// retrofit ran the old code with nothing to say so.

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

const T0 = new Date("2026-09-24T00:00:00Z");
const later = (s: number) => new Date(T0.getTime() + s * 1000);

function pkg(files: Record<string, Date>): { root: string; distFile: string } {
  const root = mkdtempSync(join(tmpdir(), "stale-build-"));
  roots.push(root);
  for (const [rel, mtime] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, "x");
    utimesSync(full, mtime, mtime);
  }
  return { root, distFile: join(root, "dist", "cli.js") };
}

describe("findStaleBuild", () => {
  it("names the newest source file when it is newer than dist/cli.js", () => {
    const { root, distFile } = pkg({
      "dist/cli.js": later(10),
      "src/core/a.ts": later(5),
      "src/phases/08-app/lib/README.md": later(20),
      "bin/cli.ts": later(1),
    });
    const stale = findStaleBuild(distFile, root);
    expect(stale?.newestFile).toBe("src/phases/08-app/lib/README.md");
    expect(staleBuildMessage(stale!)).toMatch(
      /STALE BUILD: src\/phases\/08-app\/lib\/README\.md is newer than dist\/cli\.js/,
    );
  });

  it("counts bin/ as source", () => {
    const { root, distFile } = pkg({
      "dist/cli.js": later(10),
      "src/a.ts": later(1),
      "bin/cli.ts": later(11),
    });
    expect(findStaleBuild(distFile, root)?.newestFile).toBe("bin/cli.ts");
  });

  it("is quiet when dist/ is the newest thing", () => {
    const { root, distFile } = pkg({ "dist/cli.js": later(30), "src/a.ts": later(5) });
    expect(findStaleBuild(distFile, root)).toBeUndefined();
  });

  it("ignores src/generated/, which every test run rewrites", () => {
    const { root, distFile } = pkg({
      "dist/cli.js": later(10),
      "src/a.ts": later(5),
      "src/generated/templates.ts": later(99),
    });
    expect(findStaleBuild(distFile, root)).toBeUndefined();
  });

  it("never fires in an installed package, which ships no src/", () => {
    const { root, distFile } = pkg({ "dist/cli.js": later(10), "README.md": later(99) });
    expect(findStaleBuild(distFile, root)).toBeUndefined();
  });

  it("never fires when not running from dist/ (tsx bin/cli.ts)", () => {
    const { root } = pkg({ "bin/cli.ts": later(10), "src/a.ts": later(99) });
    expect(findStaleBuild(join(root, "bin", "cli.ts"), root)).toBeUndefined();
  });
});
