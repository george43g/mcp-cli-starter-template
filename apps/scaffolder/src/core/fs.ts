/**
 * Filesystem helper — idempotent, dry-run-aware writes.
 *
 * Migrations call `fs.writeIfChanged(path, content)` rather than writeFile
 * directly so that re-runs are no-ops when the content matches, and so that
 * dry-run mode can report intended writes without touching disk.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

export type WriteOutcome = "created" | "updated" | "unchanged" | "would-create" | "would-update";

export interface FsHelper {
  readonly cwd: string;
  readonly dryRun: boolean;
  /** Resolve a path against cwd. Throws if the resolved path escapes cwd. */
  safe(relPath: string): string;
  /** Write a file only if content differs. Creates parent dirs as needed. */
  writeIfChanged(relPath: string, content: string | Buffer): Promise<WriteOutcome>;
  /** Read a file relative to cwd. Returns undefined if missing. */
  read(relPath: string): Promise<string | undefined>;
  /** Test existence. */
  exists(relPath: string): boolean;
  /** mkdir -p */
  ensureDir(relPath: string): Promise<void>;
  /** Create a symlink (or no-op if it already points where it should). */
  symlink(target: string, linkRelPath: string): Promise<WriteOutcome>;
  /** Delete a file/symlink. No-op if missing. */
  remove(relPath: string): Promise<void>;
}

export function makeFs(options: { cwd: string; dryRun: boolean }): FsHelper {
  const cwd = resolve(options.cwd);

  function safe(relPath: string): string {
    const abs = isAbsolute(relPath) ? relPath : resolve(cwd, relPath);
    if (!abs.startsWith(cwd + "/") && abs !== cwd) {
      throw new Error(`Path "${relPath}" escapes target cwd "${cwd}"`);
    }
    return abs;
  }

  async function writeIfChanged(relPath: string, content: string | Buffer): Promise<WriteOutcome> {
    const abs = safe(relPath);
    const buffer = typeof content === "string" ? Buffer.from(content, "utf8") : content;
    const exists = existsSync(abs);
    if (exists) {
      const current = await readFile(abs);
      if (current.equals(buffer)) return "unchanged";
    }
    if (options.dryRun) return exists ? "would-update" : "would-create";
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, buffer);
    return exists ? "updated" : "created";
  }

  return {
    cwd,
    dryRun: options.dryRun,
    safe,
    writeIfChanged,
    async read(relPath) {
      const abs = safe(relPath);
      if (!existsSync(abs)) return undefined;
      return readFile(abs, "utf8");
    },
    exists(relPath) {
      return existsSync(safe(relPath));
    },
    async ensureDir(relPath) {
      const abs = safe(relPath);
      if (options.dryRun) return;
      await mkdir(abs, { recursive: true });
    },
    async symlink(target, linkRelPath) {
      const abs = safe(linkRelPath);
      if (existsSync(abs)) {
        // already exists — check it points at the expected target
        try {
          const st = await stat(abs);
          if (st.isSymbolicLink()) return "unchanged";
        } catch {
          // fall through to overwrite
        }
        if (options.dryRun) return "would-update";
        await unlink(abs);
        await symlink(target, abs);
        return "updated";
      }
      if (options.dryRun) return "would-create";
      await mkdir(dirname(abs), { recursive: true });
      await symlink(target, abs);
      return "created";
    },
    async remove(relPath) {
      const abs = safe(relPath);
      if (!existsSync(abs)) return;
      if (options.dryRun) return;
      await unlink(abs);
    },
  };
}
