/**
 * Filesystem helper — idempotent, dry-run-aware writes.
 *
 * Migrations call `fs.writeIfChanged(path, content)` rather than writeFile
 * directly so that re-runs are no-ops when the content matches, and so that
 * dry-run mode can report intended writes without touching disk.
 */

import { existsSync } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readlink,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

const SHEBANG = Buffer.from("#!");
const EXECUTABLE_MODE = 0o755;

export type WriteOutcome =
  | "created"
  | "updated"
  | "unchanged"
  | "would-create"
  | "would-update"
  | "divergent-skipped";

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

export interface FsOptions {
  cwd: string;
  dryRun: boolean;
  /**
   * When false (default for `apply` mode), files that exist AND diverge
   * from the requested content are SKIPPED instead of overwritten — the
   * user's customizations are preserved. Set true for `init` (fresh
   * scaffold) or when the user explicitly passes --force.
   */
  force?: boolean;
}

export function makeFs(options: FsOptions): FsHelper {
  const cwd = resolve(options.cwd);
  const force = options.force ?? true; // default true preserves the pre-existing init semantics

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
      // Existing file diverges. In apply mode (force=false) we preserve
      // the user's version — they pass --force to overwrite intentionally.
      if (!force) return "divergent-skipped";
    }
    if (options.dryRun) return exists ? "would-update" : "would-create";
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, buffer);
    // Files starting with a shebang are scripts — preserve executability.
    // The lib/ source isn't read with stat (it's an inlined string in the
    // generated bundle), so we infer from content. Misses no real cases:
    // any sh/mjs/py script intended to be run directly starts with `#!`.
    if (buffer.length >= 2 && buffer.subarray(0, 2).equals(SHEBANG)) {
      await chmod(abs, EXECUTABLE_MODE);
    }
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
      let existing: Awaited<ReturnType<typeof lstat>> | undefined;
      try {
        existing = await lstat(abs);
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
        if (code !== "ENOENT") throw error;
      }
      if (existing) {
        if (existing.isSymbolicLink() && (await readlink(abs)) === target) return "unchanged";
        if (!force) return "divergent-skipped";
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
