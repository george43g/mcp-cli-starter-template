#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const temp = await mkdtemp(join(tmpdir(), "registry-runtime-smoke-"));
const target = join(temp, "consumer");
const packageDir = join(root, "packages", "robustness");

try {
  run("pnpm", ["--filter", "@george43g/robustness", "build"], root);
  run("pnpm", ["pack", "--pack-destination", temp], packageDir);
  const tarball = (await readdir(temp)).find((entry) => entry.endsWith(".tgz"));
  if (!tarball) throw new Error("robustness pack did not create a tarball");
  const tarballPath = join(temp, tarball);

  run("pnpm", ["--filter", "@george43g/mcp-scaffold", "build"], root);
  run(
    process.execPath,
    [
      join(root, "apps", "scaffolder", "dist", "cli.js"),
      "--no-banner",
      "init",
      target,
      "--name",
      "registry-smoke",
      "--runtime-source",
      "registry",
      "--no-rust-accel",
    ],
    root,
  );

  const packageJsonPath = join(target, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  packageJson.pnpm = {
    ...(packageJson.pnpm ?? {}),
    overrides: {
      ...(packageJson.pnpm?.overrides ?? {}),
      "@george43g/robustness": `file:${tarballPath}`,
    },
  };
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  run("pnpm", ["install", "--no-frozen-lockfile"], target);
  run("pnpm", ["typecheck"], target);
  run("pnpm", ["test"], target);
  run("pnpm", ["build"], target);
  process.stdout.write("registry-runtime scaffold smoke passed with packed 0.1.0 tarball\n");
} finally {
  await rm(temp, { recursive: true, force: true });
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "inherit",
    env: { ...process.env, CI: "1" },
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status ?? 1}`);
  }
}
