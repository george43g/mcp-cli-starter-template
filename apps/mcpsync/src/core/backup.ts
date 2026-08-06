import { copyFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/**
 * Copy `path` to `path.bak.<epoch>` before an overwrite, then prune old backups
 * so they can't accumulate unbounded (a project-scope apply writes one every
 * run). Returns the backup path, or null when the file does not exist yet
 * (nothing to back up).
 *
 * `now` is injectable so tests can assert a deterministic backup name; at
 * runtime callers omit it and get the wall-clock epoch.
 */
export function backup(path: string, now: number = Date.now()): string | null {
  if (!existsSync(path)) return null;
  const dest = `${path}.bak.${now}`;
  copyFileSync(path, dest);
  pruneBackups(path);
  return dest;
}

/**
 * Keep only the `keep` most-recent `<path>.bak.<epoch>` siblings, deleting the
 * rest. Orders by the numeric epoch suffix (newest first), so it's stable
 * regardless of readdir order and needs no clock. Best-effort: a delete that
 * fails (race, perms) is ignored — a leftover backup is harmless clutter, and
 * pruning must never break the write it follows.
 */
export function pruneBackups(path: string, keep = 5): void {
  const dir = dirname(path);
  const prefix = `${basename(path)}.bak.`;
  let stale: string[];
  try {
    stale = readdirSync(dir)
      .filter((n) => n.startsWith(prefix) && /^\d+$/.test(n.slice(prefix.length)))
      .sort((a, b) => Number(b.slice(prefix.length)) - Number(a.slice(prefix.length)))
      .slice(keep);
  } catch {
    return; // dir vanished — nothing to prune
  }
  for (const name of stale) {
    try {
      rmSync(join(dir, name));
    } catch {
      // best-effort: leave a backup we couldn't remove
    }
  }
}
