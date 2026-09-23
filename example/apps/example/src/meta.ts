/**
 * App metadata — read from package.json at runtime to avoid hand-syncing
 * the version when semantic-release bumps it.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface PackageJson {
  name: string;
  version: string;
  description?: string;
  bin?: string | Record<string, string>;
}

function loadPackageJson(): PackageJson {
  // dist/<bin>.js → ../package.json; src/<bin>.ts → ../package.json
  const path = resolve(__dirname, "..", "package.json");
  try {
    const raw = readFileSync(path, "utf8");
    return JSON.parse(raw) as PackageJson;
  } catch {
    // A computed key, so the literal's formatting does not depend on whether
    // the substituted name needs quotes (`foo` does not, `foo-bar` does).
    const bin = "example";
    return { name: "example", version: "0.0.0", bin: { [bin]: "./dist/cli.js" } };
  }
}

const pkg = loadPackageJson();

export const APP_NAME = pkg.name;

/**
 * The command a user types — READ from `bin`, never derived from the package
 * name. The two are chosen independently, and a regex that turns one into the
 * other is right only while every app follows one naming shape.
 */
export function cliNameOf(p: Pick<PackageJson, "name" | "bin">): string {
  const unscoped = p.name.replace(/^@[^/]+\//, "");
  // npm installs a string `bin` under the unscoped package name.
  if (typeof p.bin !== "object" || p.bin === null) return unscoped;
  return Object.keys(p.bin)[0] ?? unscoped;
}

/** The installed bin's name: commander's `.name()`, the REPL prompt, `~/.<name>/`. */
export const CLI_NAME = cliNameOf(pkg);
export const APP_VERSION = pkg.version;
export const APP_DESCRIPTION = pkg.description ?? "";

/**
 * Substituted at build time by Vite `define` (see vite.config.ts).
 *
 * Declared, never imported: the value does not exist as a module. In a `tsx`
 * run there is no Vite, so the identifier is genuinely undefined at runtime —
 * hence the `typeof` guard in `buildStamp()` rather than a plain read, which
 * would throw a ReferenceError.
 */
declare const __BUILD_STAMP__: string | undefined;

let cachedStamp: string | null = null;

/**
 * Build identity: `<semver>+<count>.<sha>[.dirty.<MMDDTHHmm>]`.
 *
 * Semver only moves on release, so it cannot distinguish two builds between
 * releases. This can.
 *
 * Three-step fallback, in order:
 *   1. The `define` value — the only one that describes the BUILD.
 *   2. A git shell-out, for `tsx src/cli.ts` runs that never go through Vite.
 *   3. Bare semver.
 *
 * Step 2 is deliberately NOT used in built output: there, the stamp is already
 * baked, and re-deriving it would describe whatever checkout the process
 * happens to be sitting in rather than the build that produced the artifact —
 * a different and misleading fact.
 *
 * Lazy and cached, so a normal startup never pays for the subprocesses.
 */
export function buildStamp(): string {
  if (cachedStamp !== null) return cachedStamp;

  if (typeof __BUILD_STAMP__ === "string" && __BUILD_STAMP__.length > 0) {
    cachedStamp = __BUILD_STAMP__;
    return cachedStamp;
  }

  cachedStamp = gitStamp() ?? APP_VERSION;
  return cachedStamp;
}

/** Source-run fallback. Returns null when this is not a usable git checkout. */
function gitStamp(): string | null {
  const git = (args: string[]): string | null => {
    try {
      return execFileSync("git", args, {
        cwd: __dirname,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      return null;
    }
  };

  const sha = git(["rev-parse", "--short=7", "HEAD"]);
  if (sha === null) return null;
  // A shallow checkout reports a real-looking small count, so treat it as
  // unknown rather than publishing a number that is wrong but believable.
  const shallow = git(["rev-parse", "--is-shallow-repository"]);
  const count = shallow === "false" ? (git(["rev-list", "--count", "HEAD"]) ?? "0") : "0";
  const dirty = git(["status", "--porcelain"]);
  return `${APP_VERSION}+${count}.${sha}${dirty ? ".dirty" : ""}`;
}
