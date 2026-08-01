/**
 * Hot-deploy a built MCP extension into Claude Desktop's installed-extensions
 * directory — no GUI reinstall. Generalized from imsg-mcp's hot-deploy-ext.mjs;
 * nothing here is imsg-specific.
 *
 * Matching: read the SOURCE `manifest.json` `name`, then find the installed
 * extension dir whose `manifest.json` `name` matches (or take an explicit
 * `--ext-id`). Then replace the pieces that change between builds
 * (`dist`, `native`, `manifest.json`, `icon.png`, `assets`; `node_modules`
 * only with `--full`) via rm+cp.
 *
 * Every function takes explicit paths so tests run against tmp fixtures and
 * never touch the real `~/Library`. The command layer (commands/deploy.ts)
 * gates the rm+cp behind a dry-run preview + confirmation.
 */
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

/** The manifest fields we rely on (a `.mcpb`/`.dxt` manifest has many more). */
export interface ExtManifest {
  name: string;
  display_name?: string;
  version?: string;
}

export interface InstalledExtension {
  /** Directory basename under the extensions root (the "ext id"). */
  id: string;
  /** Absolute path to the extension directory. */
  dir: string;
  manifest: ExtManifest;
}

/** Items replaced between builds, in sync order (from hot-deploy-ext.mjs). */
export const DEPLOY_ITEMS = ["dist", "native", "manifest.json", "icon.png", "assets"] as const;

/**
 * macOS Claude Desktop extensions root. Linux/Windows paths are not wired yet
 * (best-effort deferred); the command surfaces a clear error when the dir is
 * absent, so a non-macOS host fails gracefully rather than silently.
 */
export function defaultExtRoot(home: string = homedir()): string {
  return join(home, "Library", "Application Support", "Claude", "Claude Extensions");
}

/** Parse a manifest.json, returning null on any read/parse error or missing `name`. */
function readManifest(path: string): ExtManifest | null {
  try {
    const m = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    return typeof m.name === "string" ? (m as unknown as ExtManifest) : null;
  } catch {
    return null;
  }
}

/** Enumerate installed extensions (subdirs with a parseable manifest.json). */
export function installedExtensions(extRoot: string): InstalledExtension[] {
  if (!existsSync(extRoot)) return [];
  return readdirSync(extRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d): InstalledExtension | null => {
      const dir = join(extRoot, d.name);
      const manifest = readManifest(join(dir, "manifest.json"));
      return manifest ? { id: d.name, dir, manifest } : null;
    })
    .filter((e): e is InstalledExtension => e !== null);
}

/** True if a path looks like a packed extension archive (a zip). */
export function isArchive(p: string): boolean {
  return /\.(mcpb|dxt|zip)$/i.test(p);
}

export interface ResolvedSource {
  /** Directory holding the built extension (manifest.json + dist/ …). */
  dir: string;
  /** Removes the temp dir when the source was an unzipped archive; else null. */
  cleanup: (() => void) | null;
}

const defaultUnzip = (archive: string, dest: string): void => {
  execFileSync("unzip", ["-q", "-o", archive, "-d", dest]);
};

/**
 * Resolve a source path to a directory. A directory is used in place; a file
 * (or an archive extension) is unzipped to a fresh temp dir whose `cleanup`
 * removes it. `unzip` is injectable so tests exercise the archive branch
 * without real zip tooling.
 */
export function resolveSource(
  raw: string,
  opts: { tmpBase?: string; unzip?: (archive: string, dest: string) => void } = {},
): ResolvedSource {
  if (!existsSync(raw)) throw new Error(`source not found: ${raw}`);
  const unzip = opts.unzip ?? defaultUnzip;
  const tmpBase = opts.tmpBase ?? tmpdir();
  const asArchive = isArchive(raw) || statSync(raw).isFile();
  if (!asArchive) return { dir: raw, cleanup: null };
  const tmp = mkdtempSync(join(tmpBase, "mcpsync-deploy-"));
  unzip(raw, tmp);
  return { dir: tmp, cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}

/**
 * Locate the manifest within a source dir. Handles archives that wrap their
 * contents in a single top-level folder by descending into it.
 */
export function findManifest(dir: string): { dir: string; manifest: ExtManifest } | null {
  const direct = readManifest(join(dir, "manifest.json"));
  if (direct) return { dir, manifest: direct };
  const subdirs = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory());
  if (subdirs.length === 1) {
    const sub = join(dir, subdirs[0]?.name ?? "");
    const nested = readManifest(join(sub, "manifest.json"));
    if (nested) return { dir: sub, manifest: nested };
  }
  return null;
}

/** Find the installed extension to overwrite: by explicit id, else by name. */
export function matchTarget(
  installed: InstalledExtension[],
  opts: { extId?: string | undefined; name?: string | undefined },
): InstalledExtension | null {
  if (opts.extId) return installed.find((e) => e.id === opts.extId) ?? null;
  if (opts.name) return installed.find((e) => e.manifest.name === opts.name) ?? null;
  return null;
}

export interface DeployItem {
  /** The top-level item name (e.g. "dist"). */
  item: string;
  from: string;
  to: string;
}

/**
 * Compute the rm+cp plan: each DEPLOY_ITEM (plus node_modules with `full`)
 * present in the source, mapped to its target path. Pure — no filesystem
 * mutation, so a dry-run and the real run share one code path.
 */
export function planDeploy(
  sourceDir: string,
  targetDir: string,
  opts: { full?: boolean | undefined } = {},
): DeployItem[] {
  const items: string[] = [...DEPLOY_ITEMS];
  if (opts.full) items.push("node_modules");
  const plan: DeployItem[] = [];
  for (const item of items) {
    const from = join(sourceDir, item);
    if (!existsSync(from)) continue;
    plan.push({ item, from, to: join(targetDir, item) });
  }
  return plan;
}

/** Execute a deploy plan: replace each target with the source (rm then cp). */
export function executeDeploy(plan: readonly DeployItem[]): void {
  for (const { from, to } of plan) {
    rmSync(to, { recursive: true, force: true });
    cpSync(from, to, { recursive: true });
  }
}
