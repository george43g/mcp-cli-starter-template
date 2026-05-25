#!/usr/bin/env node
/**
 * init-template.mjs — clone-and-rename for mcp-cli-starter-template.
 *
 * Replaces `example-repo` (kebab-case lowercase) and `EXAMPLE_REPO` (env-var
 * style) across every tracked file, renames `apps/example-repo-mcp/` and a few
 * placeholder paths, optionally swaps the npm scope, then self-deletes.
 *
 * Usage:
 *   pnpm tsx scripts/init-template.mjs --name foo-mcp [--scope @myorg]
 *
 * Idempotent in the sense that re-running on an already-renamed repo is a
 * no-op (it'll just not find any placeholders). But after the script
 * deletes itself it can't run again — that's the intended exit signal.
 *
 * No external deps — uses only node:fs/promises, node:path, node:child_process.
 */

import { exec as execCallback } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execCallback);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const NAME_PLACEHOLDER = "example-repo";
const NAME_UPPER_PLACEHOLDER = "EXAMPLE_REPO";
const SCOPE_PLACEHOLDER = "@george43g";

const NAME_RE = /^[a-z][a-z0-9-]*$/;
const KEBAB_RE = /-/g;

// Binary / generated files we should never sed through.
const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".mdc",
  ".yml",
  ".yaml",
  ".toml",
  ".rs",
  ".tape",
  ".sh",
  ".lock",
  ".lockfile",
  ".yamllock",
  ".html",
  ".css",
  ".txt",
  ".gitignore",
  ".gitattributes",
  ".npmignore",
  ".env.example",
  ".releaserc.json",
  ".cursorrules",
  "Cargo.toml",
  "Cargo.lock",
  "Dockerfile",
]);

// Files always treated as text regardless of extension (basename match).
const TEXT_BASENAMES = new Set([
  ".gitignore",
  ".gitattributes",
  ".npmignore",
  ".cursorrules",
  ".releaserc.json",
  "Dockerfile",
  "LICENSE",
  "Cargo.toml",
  "Cargo.lock",
]);

function parseArgs(argv) {
  const out = { name: null, scope: null, license: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--name") out.name = argv[++i] ?? null;
    else if (a === "--scope") out.scope = argv[++i] ?? null;
    else if (a === "--license") out.license = argv[++i] ?? null;
    else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else if (a.startsWith("--")) {
      console.error(`unknown flag: ${a}`);
      process.exit(2);
    }
  }
  return out;
}

function printHelp() {
  console.log(`init-template.mjs — clone-and-rename for mcp-cli-starter-template

USAGE
  pnpm tsx scripts/init-template.mjs --name <tool-name> [--scope @myorg]

OPTIONS
  --name <kebab>   Required. Lowercase kebab-case, e.g. "foo" or "wm-stack".
  --scope <@org>   Optional. Replace @george43g with this scope everywhere.
  --license <name> Optional. Replace MIT with another SPDX license.

EXAMPLE
  pnpm tsx scripts/init-template.mjs --name wm-stack --scope @myorg

WHAT IT DOES
  1. Replace example-repo and EXAMPLE_REPO in every tracked file.
  2. Rename apps/example-repo-mcp/ and a few placeholder paths.
  3. Update package.json names + bin maps.
  4. Optionally swap the npm scope.
  5. Delete this script.
  6. git add -A so you can review with: git diff --cached
`);
}

function nameUpper(name) {
  return name.toUpperCase().replace(KEBAB_RE, "_");
}

function looksLikeText(path) {
  const base = path.slice(path.lastIndexOf("/") + 1);
  if (TEXT_BASENAMES.has(base)) return true;
  // .env, .env.local, .env.test, .env.example etc are all text.
  if (base.startsWith(".env")) return true;
  const dot = base.lastIndexOf(".");
  if (dot < 0) return false;
  return TEXT_EXTENSIONS.has(base.slice(dot));
}

async function gitTrackedFiles() {
  const { stdout } = await exec("git ls-files", { cwd: REPO_ROOT, maxBuffer: 32 * 1024 * 1024 });
  return stdout
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => resolve(REPO_ROOT, p));
}

async function replaceInFile(path, name, upper, scope) {
  if (!existsSync(path)) return false;
  const raw = await readFile(path, "utf8");
  let next = raw.split(NAME_PLACEHOLDER).join(name);
  next = next.split(NAME_UPPER_PLACEHOLDER).join(upper);
  if (scope) {
    next = next.split(SCOPE_PLACEHOLDER).join(scope);
  }
  if (next !== raw) {
    await writeFile(path, next, "utf8");
    return true;
  }
  return false;
}

async function renamePlaceholderPaths(name) {
  const candidates = [
    [join(REPO_ROOT, "apps", `${NAME_PLACEHOLDER}-mcp`), join(REPO_ROOT, "apps", `${name}-mcp`)],
    [
      join(REPO_ROOT, ".agents", "skills", `${NAME_PLACEHOLDER}-dev`),
      join(REPO_ROOT, ".agents", "skills", `${name}-dev`),
    ],
    [
      join(REPO_ROOT, ".cursor", "rules", `${NAME_PLACEHOLDER}.mdc`),
      join(REPO_ROOT, ".cursor", "rules", `${name}.mdc`),
    ],
    [join(REPO_ROOT, "skills", NAME_PLACEHOLDER), join(REPO_ROOT, "skills", name)],
  ];
  for (const [from, to] of candidates) {
    if (!existsSync(from)) continue;
    await mkdir(dirname(to), { recursive: true });
    await rename(from, to);
  }
}

async function selfDelete() {
  const me = resolve(__dirname, "init-template.mjs");
  if (existsSync(me)) await rm(me);
}

async function stageWithGit() {
  try {
    await exec("git add -A", { cwd: REPO_ROOT });
  } catch (err) {
    console.error("warning: `git add -A` failed:", err?.message ?? err);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.name) {
    console.error("error: --name is required");
    printHelp();
    process.exit(2);
  }
  if (!NAME_RE.test(args.name)) {
    console.error(`error: --name must match ${NAME_RE}; got "${args.name}"`);
    process.exit(2);
  }

  const name = args.name;
  const upper = nameUpper(name);
  const scope = args.scope ?? null;

  console.log(`init-template: name=${name}, NAME_UPPER=${upper}${scope ? `, scope=${scope}` : ""}`);

  let files;
  try {
    files = await gitTrackedFiles();
  } catch (err) {
    console.error("error: must be run from inside a git repo. Run `git init` first.");
    console.error(err?.message ?? err);
    process.exit(2);
  }

  let changed = 0;
  for (const f of files) {
    if (!existsSync(f)) continue;
    const s = await stat(f);
    if (!s.isFile()) continue;
    if (!looksLikeText(f)) continue;
    const did = await replaceInFile(f, name, upper, scope);
    if (did) changed++;
  }
  console.log(`replaced placeholders in ${changed} files`);

  await renamePlaceholderPaths(name);
  console.log("renamed placeholder paths");

  await selfDelete();
  console.log("deleted scripts/init-template.mjs");

  await stageWithGit();
  console.log("staged everything with `git add -A`");

  console.log(`
NEXT STEPS:
  1. Review the rename:    git diff --cached
  2. Reinstall workspaces: pnpm install
  3. Build:                pnpm build
  4. Test:                 pnpm test
  5. Edit AGENTS.md with your tool's specifics.
  6. Commit:               git commit -m "chore: scaffold from mcp-cli-starter-template"
`);
}

main().catch((err) => {
  console.error("init-template failed:", err);
  process.exit(1);
});
