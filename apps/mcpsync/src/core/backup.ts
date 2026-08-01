import { copyFileSync, existsSync } from "node:fs";

/**
 * Copy `path` to `path.bak.<epoch>` before an overwrite. Returns the backup
 * path, or null when the file does not exist yet (nothing to back up).
 *
 * `now` is injectable so tests can assert a deterministic backup name; at
 * runtime callers omit it and get the wall-clock epoch.
 */
export function backup(path: string, now: number = Date.now()): string | null {
  if (!existsSync(path)) return null;
  const dest = `${path}.bak.${now}`;
  copyFileSync(path, dest);
  return dest;
}
