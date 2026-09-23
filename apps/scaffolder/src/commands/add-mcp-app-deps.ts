/**
 * add-mcp-app workspace-dependency preflight.
 *
 * A generated app depends on four PRIVATE workspace packages that are never
 * published — build-config, tsconfig, vitest-config, shared-types — by
 * `workspace:*` (the published kits are rewritten to registry ranges by
 * runtime-source.ts; these cannot be). `add-mcp-app` runs phase 08-app only, so
 * in a repo scaffolded before one of them existed the new app named a package
 * the workspace did not contain and pnpm refused to install the WHOLE workspace
 * (ERR_PNPM_WORKSPACE_PKG_NOT_FOUND). A package that is present but older than
 * the template is the same failure one step later: the app imports an export
 * the consumer's copy does not have (vitest-config without `withCoverageFloor`).
 *
 * This runs BEFORE the app is written, against the exact bytes 08-app will
 * write (same substitute + applyPublishedRanges pipeline as portPackage), so a
 * refusal leaves the target untouched. Failing after the write would leave
 * apps/<name>/ on disk, and the re-run would then be refused by the 08-app
 * collision guard.
 *
 * Invariant: a consumer's existing package is never modified. A missing one is
 * created only when its directory is absent too, through a create-only fs that
 * skips every file already on disk.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { FsHelper } from "../core/fs.js";
import type { Migration, MigrationContext } from "../core/migration.js";
import type { MigrationRunResult, PhaseRunResult } from "../core/phase-runner.js";
import { applyPublishedRanges } from "../core/runtime-source.js";
import type { ShellHelper } from "../core/shell.js";
import { requireRepoName } from "../core/target-inspection.js";
import { nameUpperOf, substitute } from "../core/templating.js";
import { TEMPLATES } from "../generated/templates.js";
import M1TsconfigPkg from "../phases/03-configs/m1-tsconfig-pkg.js";
import M3VitestPkg from "../phases/03-configs/m3-vitest-pkg.js";
import M5BuildConfigPkg from "../phases/03-configs/m5-build-config-pkg.js";
import M1SharedTypes from "../phases/07-shared-types/m1-shared-types.js";

const APP_LIB_PREFIX = "08-app/lib/";

interface Recipe {
  /** Directory the migration writes into. */
  pkgDir: string;
  migration: Migration;
  /** How to bring an existing, older copy up to date. `scope` is the target's. */
  refresh: (scope: string) => string;
}

/**
 * Private packages the scaffolder knows how to create, keyed by the name
 * without its scope. Each migration writes only inside `pkgDir`, except
 * m1-tsconfig-pkg, which also writes the root tsconfig.json — the create-only
 * fs turns that into "create if absent".
 */
const RECIPES: Record<string, Recipe> = {
  "build-config": {
    pkgDir: "packages/build-config",
    migration: new M5BuildConfigPkg(),
    refresh: (scope) =>
      `run \`mcp-scaffold migrate 03-configs/m5-build-config-pkg --scope ${scope} --force --execute\` ` +
      "(overwrites packages/build-config/package.json and build-stamp.mjs)",
  },
  "vitest-config": {
    pkgDir: "packages/vitest-config",
    migration: new M3VitestPkg(),
    refresh: (scope) =>
      `run \`mcp-scaffold migrate 03-configs/m3-vitest-pkg --scope ${scope} --force --execute\` ` +
      "(overwrites packages/vitest-config/package.json, vitest.shared.ts and vitest.app.ts; " +
      "other files in the package are left alone — review the diff for lost customisations)",
  },
  tsconfig: {
    pkgDir: "packages/tsconfig",
    migration: new M1TsconfigPkg(),
    refresh: (scope) =>
      `run \`mcp-scaffold migrate 03-configs/m1-tsconfig-pkg --scope ${scope} --force --execute\` ` +
      "(overwrites packages/tsconfig/{package,base,node,react}.json AND the root tsconfig.json — " +
      "restore the root file's references afterwards)",
  },
  "shared-types": {
    pkgDir: "packages/shared-types",
    migration: new M1SharedTypes(),
    // Deliberately no --force command: shared-types is meant to be edited, so
    // regenerating it would delete the consumer's own schemas.
    refresh: () =>
      "add the missing exports to packages/shared-types by hand — copy them from " +
      "packages/shared-types/src/index.ts in mcp-cli-starter-template. Regenerating the " +
      "package would overwrite your own schemas",
  },
};

/** name → absolute directory, for every package pnpm counts as a workspace member. */
export type WorkspaceLister = (cwd: string) => Promise<Map<string, string>>;

/**
 * Ask pnpm rather than parsing pnpm-workspace.yaml: pnpm is the authority on
 * membership (glob syntax, `!` exclusions, nested workspaces), the scaffolder
 * carries no YAML or glob dependency, and a hand-rolled matcher that disagrees
 * with pnpm is exactly the bug this preflight exists to prevent. `ls -r
 * --depth -1` reads manifests only — it works before any install and in a
 * workspace whose `workspace:*` references do not resolve.
 */
export function pnpmWorkspaceLister(shell: ShellHelper): WorkspaceLister {
  return async (cwd) => {
    const res = await shell.tryRun("pnpm", ["ls", "-r", "--depth", "-1", "--json"], {
      cwd,
      dryRunOverride: false,
    });
    if (res.exitCode !== 0) {
      throw new Error(
        `Could not list the workspace packages in ${cwd} (\`pnpm ls -r --depth -1 --json\` ` +
          `exited ${res.exitCode}): ${res.stderr.trim() || res.stdout.trim()}`,
      );
    }
    const rows = JSON.parse(res.stdout || "[]") as Array<{ name?: string; path?: string }>;
    const out = new Map<string, string>();
    for (const row of rows) {
      if (typeof row.name === "string" && typeof row.path === "string") {
        out.set(row.name, row.path);
      }
    }
    return out;
  };
}

/** The files 08-app/m1-app-port will write, rendered exactly as it renders them. */
export function renderAppFiles(ctx: MigrationContext): Map<string, string> {
  const name = requireRepoName(ctx.config);
  const scope = ctx.config.global.scope.peek() ?? "@george43g";
  const vars = { name, nameUpper: nameUpperOf(name), scope };
  const out = new Map<string, string>();
  for (const [key, content] of Object.entries(TEMPLATES)) {
    if (!key.startsWith(APP_LIB_PREFIX)) continue;
    out.set(key.slice(APP_LIB_PREFIX.length), applyPublishedRanges(substitute(content, vars)));
  }
  return out;
}

/** Every dependency the rendered package.json still declares as `workspace:`. */
export function workspaceDepsOf(packageJson: string): string[] {
  const pkg = JSON.parse(packageJson) as Record<string, Record<string, string> | undefined>;
  const deps = new Set<string>();
  for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    for (const [dep, range] of Object.entries(pkg[field] ?? {})) {
      if (typeof range === "string" && range.startsWith("workspace:")) deps.add(dep);
    }
  }
  return [...deps].sort();
}

interface Requirement {
  /** Workspace package name. */
  pkg: string;
  /** Path inside the package; "" for the package root. */
  subpath: string;
  /** Named exports the app imports ("default" for a default import). */
  symbols: string[];
  /** App file the requirement came from, for the error message. */
  from: string;
}

const IMPORT_RE =
  /import\s+(?:type\s+)?(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\}|\*\s+as\s+[\w$]+)?\s*from\s*["']([^"']+)["']/g;
const EXTENDS_RE = /"extends"\s*:\s*"([^"]+)"/g;

/** What the rendered app files import from each workspace dependency. */
export function collectRequirements(files: Map<string, string>, deps: string[]): Requirement[] {
  const owner = (spec: string) =>
    deps.find((d) => spec === d || spec.startsWith(`${d}/`)) ?? undefined;
  const reqs: Requirement[] = [];
  for (const [path, content] of files) {
    if (/\.(m?[jt]sx?)$/.test(path)) {
      for (const m of content.matchAll(IMPORT_RE)) {
        const spec = m[3] as string;
        const pkg = owner(spec);
        if (pkg === undefined) continue;
        const symbols: string[] = [];
        if (m[1]) symbols.push("default");
        for (const part of (m[2] ?? "").split(",")) {
          const bare = part
            .trim()
            .replace(/^type\s+/, "")
            .split(/\s+as\s+/)[0]
            ?.trim();
          if (bare) symbols.push(bare);
        }
        reqs.push({ pkg, subpath: spec.slice(pkg.length).replace(/^\//, ""), symbols, from: path });
      }
    } else if (path.endsWith(".json")) {
      for (const m of content.matchAll(EXTENDS_RE)) {
        const spec = m[1] as string;
        const pkg = owner(spec);
        if (pkg === undefined) continue;
        reqs.push({
          pkg,
          subpath: spec.slice(pkg.length).replace(/^\//, ""),
          symbols: [],
          from: path,
        });
      }
    }
  }
  return reqs;
}

const SOURCE_EXTS = ["", ".ts", ".mts", ".tsx", ".mjs", ".js", ".json", "/index.ts", "/index.js"];

/** Files a specifier could load from, source-first. Only existing files are returned. */
function candidateFiles(pkgDir: string, subpath: string): string[] {
  const rels: string[] = [];
  if (subpath === "") {
    let manifest: { main?: unknown; exports?: unknown } = {};
    try {
      manifest = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
    } catch {
      // unreadable manifest: fall through to the conventional entry points
    }
    if (typeof manifest.main === "string") {
      rels.push(manifest.main);
      // A built entry (dist/index.js) is absent before the first build; the
      // source it is compiled from carries the same exports.
      rels.push(manifest.main.replace(/^(\.\/)?dist\//, "src/").replace(/\.js$/, ".ts"));
    }
    rels.push("src/index.ts", "index.ts", "index.mjs", "index.js");
  } else {
    for (const ext of SOURCE_EXTS) rels.push(`${subpath}${ext}`);
  }
  return [...new Set(rels.map((r) => resolve(pkgDir, r)))].filter(
    (abs) => existsSync(abs) && !abs.endsWith("/"),
  );
}

const DECL_RE =
  /export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
const LIST_RE = /export\s+(?:type\s+)?\{([^}]*)\}/g;
const STAR_AS_RE = /export\s+\*\s+as\s+([A-Za-z_$][\w$]*)/g;
const STAR_RE = /export\s+\*\s+from\s+["'](\.[^"']+)["']/g;

/** Exported names of a module, following relative `export * from` re-exports. */
function exportedNames(file: string, seen = new Set<string>()): Set<string> {
  const names = new Set<string>();
  if (seen.has(file)) return names;
  seen.add(file);
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return names;
  }
  for (const m of text.matchAll(DECL_RE)) names.add(m[1] as string);
  for (const m of text.matchAll(STAR_AS_RE)) names.add(m[1] as string);
  for (const m of text.matchAll(LIST_RE)) {
    for (const part of (m[1] ?? "").split(",")) {
      const alias = part
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (alias) names.add(alias);
    }
  }
  if (/export\s+default\b/.test(text)) names.add("default");
  for (const m of text.matchAll(STAR_RE)) {
    const rel = (m[1] as string).replace(/\.js$/, "");
    for (const ext of [".ts", ".tsx", ".mts", ".js", ".mjs", "/index.ts"]) {
      const target = resolve(dirname(file), `${rel}${ext}`);
      if (existsSync(target)) {
        for (const n of exportedNames(target, seen)) if (n !== "default") names.add(n);
        break;
      }
    }
  }
  return names;
}

/** One line per unmet requirement against the package at `pkgDir`. */
function checkRequirements(pkgDir: string, reqs: Requirement[]): string[] {
  const problems: string[] = [];
  for (const req of reqs) {
    const spec = req.subpath === "" ? req.pkg : `${req.pkg}/${req.subpath}`;
    const files = candidateFiles(pkgDir, req.subpath);
    if (files.length === 0) {
      problems.push(`${spec} does not resolve to a file in ${pkgDir} (imported by ${req.from})`);
      continue;
    }
    if (req.symbols.length === 0) continue;
    const names = new Set<string>();
    for (const f of files) for (const n of exportedNames(f)) names.add(n);
    const missing = req.symbols.filter((s) => !names.has(s));
    if (missing.length > 0) {
      problems.push(
        `${spec} has no export named ${missing.map((s) => `'${s}'`).join(", ")} ` +
          `(imported by ${req.from})`,
      );
    }
  }
  return [...new Set(problems)];
}

/**
 * FsHelper that never modifies an existing file: writes to a path already on
 * disk are skipped and recorded. The add-mode fs runs force=true, so without
 * this the migrations below would overwrite a consumer's files.
 */
export function createOnlyFs(inner: FsHelper, skipped: string[]): FsHelper {
  return {
    ...inner,
    async writeIfChanged(relPath, content) {
      if (inner.exists(relPath)) {
        skipped.push(relPath);
        return "unchanged";
      }
      return inner.writeIfChanged(relPath, content);
    },
    async symlink(target, linkRelPath) {
      if (inner.exists(linkRelPath)) {
        skipped.push(linkRelPath);
        return "unchanged";
      }
      return inner.symlink(target, linkRelPath);
    },
    async remove(relPath) {
      throw new Error(`create-only fs refuses to remove ${relPath}`);
    },
  };
}

export const WORKSPACE_DEPS_PHASE_ID = "add-mcp-app/workspace-deps";

/**
 * Make every `workspace:` dependency of the app about to be written resolvable
 * in the target, or throw before anything is written.
 */
export async function ensureAppWorkspaceDeps(
  ctx: MigrationContext,
  options: { listWorkspace: WorkspaceLister; appFiles?: Map<string, string> },
): Promise<PhaseRunResult> {
  const results: MigrationRunResult[] = [];
  const phase: PhaseRunResult = { phaseId: WORKSPACE_DEPS_PHASE_ID, results };
  const name = requireRepoName(ctx.config);
  // m1-app-port reports the collision; creating packages first would be noise.
  if (ctx.fs.exists(`apps/${name}`)) return phase;

  const scope = ctx.config.global.scope.peek() ?? "@george43g";
  const files = options.appFiles ?? renderAppFiles(ctx);
  const manifest = files.get("package.json");
  if (manifest === undefined) {
    throw new Error("Internal: 08-app template has no package.json; run `pnpm build:templates`.");
  }
  const deps = workspaceDepsOf(manifest);
  const reqs = collectRequirements(files, deps);
  const workspace = await options.listWorkspace(ctx.cwd);

  const problems: string[] = [];
  const toCreate: Array<[string, Recipe]> = [];
  for (const dep of deps) {
    const recipe = dep.startsWith(`${scope}/`) ? RECIPES[dep.slice(scope.length + 1)] : undefined;
    const present = workspace.get(dep);
    if (present !== undefined) {
      const unmet = checkRequirements(
        present,
        reqs.filter((r) => r.pkg === dep),
      );
      if (unmet.length > 0) {
        const fix = recipe ? recipe.refresh(scope) : "update it to match the template";
        problems.push(
          `${dep} (${present}) is older than the app template:\n` +
            unmet.map((u) => `      - ${u}`).join("\n") +
            `\n    To fix: ${fix}.`,
        );
      }
      continue;
    }
    if (recipe === undefined) {
      problems.push(
        `${dep} is a workspace dependency of the new app, but no workspace package has that name ` +
          "and mcp-scaffold has no migration that creates it.\n" +
          `    To fix: add a workspace package named ${dep}, or remove the dependency from the template.`,
      );
      continue;
    }
    if (ctx.fs.exists(recipe.pkgDir)) {
      problems.push(
        `${dep} is not a workspace package, but ${recipe.pkgDir}/ already exists — ` +
          "left untouched.\n" +
          `    To fix: make ${recipe.pkgDir}/package.json name it ${dep} and include ` +
          `${recipe.pkgDir} in pnpm-workspace.yaml, or move the directory aside so it can be created.`,
      );
      continue;
    }
    toCreate.push([dep, recipe]);
  }
  if (problems.length > 0) {
    throw new Error(
      `add-mcp-app: refusing to write apps/${name}/ into ${ctx.cwd} — ` +
        "the workspace could not install it:\n" +
        problems.map((p) => `  - ${p}`).join("\n") +
        "\nNothing was written.",
    );
  }

  for (const [dep, recipe] of toCreate) {
    const skipped: string[] = [];
    const started = Date.now();
    const result = await recipe.migration.apply({ ...ctx, fs: createOnlyFs(ctx.fs, skipped) });
    result.notes = [
      ...(result.notes ?? []),
      `created ${dep} (${recipe.pkgDir}/) — the new app depends on it`,
      ...skipped.map((p) => `kept existing ${p}`),
    ];
    results.push({
      migrationId: recipe.migration.id,
      migration: recipe.migration,
      result,
      durationMs: Date.now() - started,
    });
    ctx.log.info(`Created ${recipe.pkgDir}/ for ${dep}`);
  }

  if (toCreate.length > 0) {
    const after = await options.listWorkspace(ctx.cwd);
    const unlisted = toCreate.filter(([dep]) => !after.has(dep));
    if (unlisted.length > 0) {
      throw new Error(
        `add-mcp-app: created ${unlisted.map(([, r]) => `${r.pkgDir}/`).join(", ")}, but ` +
          "pnpm-workspace.yaml does not include it, so the new app still could not install.\n" +
          "  To fix: add `packages/*` to pnpm-workspace.yaml, then re-run add-mcp-app. " +
          `apps/${name}/ was not written.`,
      );
    }
  }
  return phase;
}
