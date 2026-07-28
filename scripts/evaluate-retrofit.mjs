#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const options = parseArgs(process.argv.slice(2));
const source = resolve(required(options, "source"));
const output = resolve(required(options, "output"));
const cli = resolve(
  options.cli ?? join(import.meta.dirname, "..", "apps", "scaffolder", "dist", "cli.js"),
);
const tempRoot = await mkdtemp(join(tmpdir(), "mcp-scaffold-evaluation-"));
const target = join(tempRoot, basename(source));
const pnpmStore = join(tempRoot, "pnpm-store");

try {
  run("git", ["clone", "--local", "--no-hardlinks", "--quiet", source, target]);
  const sourceHead = capture("git", ["-C", source, "rev-parse", "HEAD"]);
  const cloneHead = capture("git", ["-C", target, "rev-parse", "HEAD"]);
  if (sourceHead !== cloneHead) {
    throw new Error(`Clone revision mismatch: source=${sourceHead}, clone=${cloneHead}`);
  }

  const scaffoldArgs = [cli, "--no-banner", "apply", "--target", target, "--execute"];
  if (options.strategy) scaffoldArgs.push("--existing-strategy", options.strategy);
  if (options.force === true) scaffoldArgs.push("--force");
  const scaffold = runCaptured(process.execPath, scaffoldArgs, target);

  const verification = [];
  if (options.install === true) {
    verification.push(
      runCaptured("pnpm", ["install", "--frozen-lockfile", "--store-dir", pnpmStore], target),
    );
  }
  for (const script of splitList(options.verify)) {
    verification.push(runCaptured("pnpm", ["run", script], target));
  }

  const report = {
    schemaVersion: 1,
    source: {
      path: source,
      head: sourceHead,
      dirtyStatus: capture("git", ["-C", source, "status", "--short"]),
    },
    evaluation: {
      targetProfile: "isolated-local-clone",
      force: options.force === true,
      strategy: options.strategy ?? "legacy-default",
      pnpmStore: options.install === true ? "isolated-temporary" : "not-used",
      scaffold,
      verification,
    },
    diff: {
      status: capture("git", ["-C", target, "status", "--short"]),
      numstat: capture("git", ["-C", target, "diff", "--numstat"]),
      patch: capture("git", ["-C", target, "diff", "--binary"]),
      untracked: capture("git", ["-C", target, "ls-files", "--others", "--exclude-standard"]),
    },
  };

  await mkdir(output, { recursive: true });
  await writeFile(join(output, "evaluation.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(output, "scaffolder.stdout.log"), scaffold.stdout);
  await writeFile(join(output, "scaffolder.stderr.log"), scaffold.stderr);
  await writeFile(join(output, "changes.patch"), report.diff.patch);
  process.stdout.write(`${output}\n`);

  if (scaffold.exitCode !== 0 || verification.some((result) => result.exitCode !== 0)) {
    process.exitCode = 1;
  }
} finally {
  if (options.keep !== true) await rm(tempRoot, { recursive: true, force: true });
  else process.stderr.write(`Kept evaluation clone at ${target}\n`);
}

function parseArgs(args) {
  const out = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--force" || arg === "--install" || arg === "--keep") {
      out[arg.slice(2)] = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      out[arg.slice(2)] = value;
      index++;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function required(options, name) {
  const value = options[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`--${name} is required`);
  }
  return value;
}

function splitList(value) {
  return typeof value === "string"
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
}

function capture(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout.trimEnd();
}

function runCaptured(command, args, cwd) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
    env: {
      ...process.env,
      CI: "1",
      NO_COLOR: "1",
    },
  });
  return {
    command: [command, ...args],
    exitCode: result.status ?? 1,
    durationMs: Date.now() - started,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
