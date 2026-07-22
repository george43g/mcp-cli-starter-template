import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { assertValidRepoName, type Config, type PackageManager } from "./config.js";
import type { ApplyMode } from "./migration.js";

export type PackageMetadataStatus = "missing" | "malformed" | "nameless" | "invalid-name" | "valid";

export interface TargetInspection {
  packageMetadataStatus: PackageMetadataStatus;
  packageName?: string;
  packageScripts: Readonly<Record<string, string>>;
  repoName: string;
  repoNameSource: "explicit" | "package.json" | "fallback";
  packageManager: PackageManager;
  packageManagerSource: "explicit" | "package.json" | "lockfile" | "default";
  starterLayout: boolean;
  fallbackWarning?: string;
}

export interface InspectTargetOptions {
  cwd: string;
  mode: ApplyMode;
  explicitName?: string | undefined;
  explicitPackageManager?: PackageManager | undefined;
}

export function requireRepoName(config: Config): string {
  const name = config.global.repoName.peek();
  if (name === undefined) {
    throw new Error("Invariant violation: repoName was not populated during target inspection");
  }
  return name;
}

interface ParsedPackageJson {
  status: PackageMetadataStatus;
  name?: string;
  packageManager?: PackageManager | undefined;
  scripts: Record<string, string>;
}

const STARTER_MARKERS = ["apps", "packages", "turbo.json", "pnpm-workspace.yaml"] as const;

export async function inspectTarget(options: InspectTargetOptions): Promise<TargetInspection> {
  const pkg = await readPackageJson(options.cwd);
  const resolvedName = resolveRepoName(options.explicitName, pkg);
  const resolvedPackageManager = resolvePackageManager(options, pkg);

  const inspection: TargetInspection = {
    packageMetadataStatus:
      resolvedName.source === "fallback" && pkg.status === "valid" ? "invalid-name" : pkg.status,
    packageScripts: pkg.scripts,
    repoName: resolvedName.name,
    repoNameSource: resolvedName.source,
    packageManager: resolvedPackageManager.value,
    packageManagerSource: resolvedPackageManager.source,
    starterLayout: STARTER_MARKERS.every((marker) => existsSync(join(options.cwd, marker))),
  };
  if (pkg.name) inspection.packageName = pkg.name;
  if (resolvedName.warning) inspection.fallbackWarning = resolvedName.warning;
  return inspection;
}

function resolveRepoName(
  explicitName: string | undefined,
  pkg: ParsedPackageJson,
): { name: string; source: TargetInspection["repoNameSource"]; warning?: string } {
  if (explicitName !== undefined) {
    assertValidRepoName(explicitName);
    return { name: explicitName, source: "explicit" };
  }

  if (pkg.status === "valid" && pkg.name) {
    const unscoped = pkg.name.includes("/")
      ? pkg.name.slice(pkg.name.lastIndexOf("/") + 1)
      : pkg.name;
    const derived = unscoped.endsWith("-mcp") ? unscoped.slice(0, -4) : unscoped;
    try {
      assertValidRepoName(derived);
      return { name: derived, source: "package.json" };
    } catch {
      return fallbackName(
        "package.json contains a name that cannot produce a valid bare kebab-case tool name",
      );
    }
  }

  const reason =
    pkg.status === "missing"
      ? "package.json is missing"
      : pkg.status === "malformed"
        ? "package.json is malformed"
        : pkg.status === "nameless"
          ? "package.json has no string name"
          : "package.json contains an invalid package name";
  return fallbackName(reason);
}

function fallbackName(reason: string): {
  name: string;
  source: "fallback";
  warning: string;
} {
  return {
    name: "mcp-starter",
    source: "fallback",
    warning: `TARGET NAME FALLBACK: ${reason}; using 'mcp-starter'. Pass --name <kebab-case-name> to override.`,
  };
}

function resolvePackageManager(
  options: InspectTargetOptions,
  pkg: ParsedPackageJson,
): {
  value: PackageManager;
  source: TargetInspection["packageManagerSource"];
} {
  if (options.explicitPackageManager) {
    return { value: options.explicitPackageManager, source: "explicit" };
  }
  if (pkg.packageManager) return { value: pkg.packageManager, source: "package.json" };

  const lockfiles: ReadonlyArray<readonly [string, PackageManager]> = [
    ["pnpm-lock.yaml", "pnpm"],
    ["package-lock.json", "npm"],
    ["npm-shrinkwrap.json", "npm"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
  ];
  for (const [lockfile, manager] of lockfiles) {
    if (existsSync(join(options.cwd, lockfile))) return { value: manager, source: "lockfile" };
  }

  return {
    value: options.mode === "existing" ? "npm" : "pnpm",
    source: "default",
  };
}

async function readPackageJson(cwd: string): Promise<ParsedPackageJson> {
  let raw: string;
  try {
    raw = await readFile(join(cwd, "package.json"), "utf8");
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code === "ENOENT") return { status: "missing", scripts: {} };
    throw error;
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { status: "malformed", scripts: {} };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { status: "malformed", scripts: {} };
  }

  const record = value as Record<string, unknown>;
  const scripts: Record<string, string> = {};
  if (record.scripts && typeof record.scripts === "object" && !Array.isArray(record.scripts)) {
    for (const [name, command] of Object.entries(record.scripts as Record<string, unknown>)) {
      if (typeof command === "string") scripts[name] = command;
    }
  }
  const packageManager = parsePackageManager(record.packageManager);
  if (record.name === undefined || record.name === "") {
    return { status: "nameless", packageManager, scripts };
  }
  if (typeof record.name !== "string") {
    return { status: "invalid-name", packageManager, scripts };
  }
  return { status: "valid", name: record.name, packageManager, scripts };
}

function parsePackageManager(value: unknown): PackageManager | undefined {
  if (typeof value !== "string") return undefined;
  const manager = value.split("@", 1)[0];
  return manager === "pnpm" || manager === "npm" || manager === "bun" ? manager : undefined;
}
