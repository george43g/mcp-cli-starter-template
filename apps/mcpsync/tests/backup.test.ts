import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backup, pruneBackups } from "../src/core/backup.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mcpsync-backup-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Epochs of the `<base>.bak.<epoch>` siblings currently in `dir`, ascending. */
const bakEpochs = (base: string): number[] =>
  readdirSync(dir)
    .filter((n) => n.startsWith(`${base}.bak.`) && /^\d+$/.test(n.slice(`${base}.bak.`.length)))
    .map((n) => Number(n.slice(`${base}.bak.`.length)))
    .sort((a, b) => a - b);

describe("backup", () => {
  it("copies path → path.bak.<epoch> and returns the dest", () => {
    const p = join(dir, "cfg.json");
    writeFileSync(p, "{}");
    const dest = backup(p, 1000);
    expect(dest).toBe(`${p}.bak.1000`);
    expect(existsSync(dest as string)).toBe(true);
  });

  it("returns null when the source does not exist (nothing to back up)", () => {
    expect(backup(join(dir, "nope.json"))).toBeNull();
  });

  it("prunes automatically after writing (keeps newest 5)", () => {
    const p = join(dir, "cfg.json");
    writeFileSync(p, "{}");
    for (const e of [1, 2, 3, 4, 5, 6]) writeFileSync(`${p}.bak.${e}`, "x");
    backup(p, 7); // 7 backups now → prune to newest 5
    expect(bakEpochs("cfg.json")).toEqual([3, 4, 5, 6, 7]);
  });
});

describe("pruneBackups", () => {
  it("keeps only the newest `keep` backups by epoch, deletes the rest", () => {
    const p = join(dir, "opencode.json");
    for (const e of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) writeFileSync(`${p}.bak.${e}`, "x");
    pruneBackups(p, 5);
    expect(bakEpochs("opencode.json")).toEqual([6, 7, 8, 9, 10]);
  });

  it("leaves non-epoch .bak siblings untouched", () => {
    const p = join(dir, "cfg.json");
    writeFileSync(`${p}.bak.old`, "x"); // not an epoch — ignored
    writeFileSync(`${p}.bak.1`, "x");
    writeFileSync(`${p}.bak.2`, "x");
    pruneBackups(p, 1);
    expect(existsSync(`${p}.bak.old`)).toBe(true);
    expect(existsSync(`${p}.bak.2`)).toBe(true); // newest epoch kept
    expect(existsSync(`${p}.bak.1`)).toBe(false); // older epoch pruned
  });

  it("is a no-op when backups are within the keep limit", () => {
    const p = join(dir, "cfg.json");
    writeFileSync(`${p}.bak.1`, "x");
    writeFileSync(`${p}.bak.2`, "x");
    pruneBackups(p, 5);
    expect(bakEpochs("cfg.json")).toEqual([1, 2]);
  });

  it("does not throw when the directory has no backups", () => {
    expect(() => pruneBackups(join(dir, "cfg.json"))).not.toThrow();
  });
});
