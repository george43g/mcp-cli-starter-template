#!/usr/bin/env node
// Byte-check the scaffolder's committed usage(1) artifacts against
// apps/scaffolder/.usage.kdl, regenerating with the usage version pinned in
// mise.toml (this directory's has none, so the repo root's governs — the same
// one `mise run artifacts` uses here). See resolveUsage() below.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scaffolderDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoDir = resolve(scaffolderDir, "../..");

// --- usage(1) resolver: begin -------------------------------------------------
// In mcp-cli-starter-template, the repo that scaffolds this script, the same
// region guards the scaffolder's own artifacts; its
// apps/scaffolder/tests/usage-resolver-twin.test.ts keeps the copies identical.

/**
 * The `usage` pin that governs `dir`: the nearest mise.toml / .mise.toml at or
 * above it whose [tools] table names usage — nearest wins, as it does for mise
 * itself. Returns { version, file } or null when nothing pins it.
 */
function findUsagePin(dir) {
  let current = resolve(dir);
  for (;;) {
    for (const name of ["mise.toml", ".mise.toml"]) {
      const file = join(current, name);
      if (!existsSync(file)) continue;
      const version = readUsagePin(readFileSync(file, "utf8"));
      if (version) return { version, file };
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** `usage = "x"` or `usage = { version = "x" }` inside [tools]; else null. */
function readUsagePin(toml) {
  let inTools = false;
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    const table = line.match(/^\[([^\]]+)\]$/);
    if (table) {
      inTools = table[1].trim() === "tools";
      continue;
    }
    if (!inTools) continue;
    const entry = line.match(/^"?usage"?\s*=\s*(.+)$/);
    if (!entry) continue;
    const value = entry[1];
    const plain = value.match(/^"([^"]+)"$/);
    if (plain) return plain[1];
    const inline = value.match(/version\s*=\s*"([^"]+)"/);
    if (inline) return inline[1];
  }
  return null;
}

/** "usage-cli 3.3.0" → "3.3.0"; null when the output carries no version. */
function parseUsageVersion(output) {
  return output.match(/(\d+\.\d+\.\d+[^\s]*)/)?.[1] ?? null;
}

/** A pin of "3.3.0" matches only 3.3.0; "3.3" or "3" match as a prefix. */
function versionMatchesPin(version, pin) {
  return version === pin || version.startsWith(`${pin}.`);
}

/**
 * Spawn a bare command name. On Windows, mise and usage may be .cmd shims,
 * which spawn only resolves through a shell — so there it goes through cmd.exe
 * as ONE command string (not shell:true plus an args array, which Node 24
 * deprecates as DEP0190). Every argument here is a fixed word or a version
 * string read from mise.toml, never user input.
 */
function run(cmd, args, cwd) {
  const opts = { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };
  const result =
    process.platform === "win32"
      ? spawnSync([cmd, ...args.map((a) => (/^[\w@/.:=,+-]+$/.test(a) ? a : `"${a}"`))].join(" "), {
          ...opts,
          shell: true,
        })
      : spawnSync(cmd, args, opts);
  const ok = !result.error && result.status === 0;
  const detail = result.error
    ? (result.error.code ?? result.error.message)
    : `${result.stderr ?? ""}${result.stdout ?? ""}`.trim().split(/\r?\n/).slice(-3).join(" | ");
  return { ok, stdout: (result.stdout ?? "").trim(), detail };
}

/**
 * Which usage(1) binary to regenerate with. Never guesses: it returns the
 * pinned binary, or exits 2 with both versions and the fix. It never returns a
 * binary whose version differs from the pin, because every byte of the
 * comparison would then be a false drift.
 *
 * 1. mise on PATH: install (a no-op when present) and locate usage@<pin>
 *    explicitly, from a neutral cwd so an untrusted project config cannot
 *    block it. PATH order and any global `mise use usage@latest` are
 *    irrelevant to the result.
 * 2. No mise, or mise failed: `usage` from PATH, accepted only if its
 *    --version matches the pin.
 * 3. No pin anywhere: `usage` from PATH, with a warning that drift reports are
 *    only as good as that version.
 */
function resolveUsage(dir) {
  const pin = findUsagePin(dir);
  if (!pin) {
    console.warn(
      "! No usage version pinned in any mise.toml at or above this app; using usage from PATH.\n" +
        '  A different usage version reports every artifact as drifted — pin one: [tools] usage = "<version>"',
    );
    return "usage";
  }

  let miseFailure = null;
  const neutral = tmpdir();
  const miseVersion = run("mise", ["--version"], neutral);
  if (miseVersion.ok) {
    const install = run("mise", ["install", `usage@${pin.version}`], neutral);
    const which = install.ok
      ? run("mise", ["which", "usage", "--tool", `usage@${pin.version}`], neutral)
      : install;
    if (which.ok && which.stdout) {
      const bin = which.stdout.split(/\r?\n/).pop().trim();
      const got = run(bin, ["--version"], neutral);
      const version = got.ok ? parseUsageVersion(got.stdout) : null;
      if (version && versionMatchesPin(version, pin.version)) return bin;
      miseFailure = `mise resolved ${bin}, which reports ${version ?? `no version (${got.detail})`}`;
    } else {
      miseFailure = `mise could not provide usage@${pin.version}: ${which.detail}`;
    }
  }

  const onPath = run("usage", ["--version"], neutral);
  const pathVersion = onPath.ok ? parseUsageVersion(onPath.stdout) : null;
  if (pathVersion && versionMatchesPin(pathVersion, pin.version)) return "usage";

  const found = onPath.ok
    ? `usage on PATH is ${pathVersion ?? `unrecognised ("${onPath.stdout}")`}`
    : `no usage on PATH (${onPath.detail})`;
  console.error(
    `✗ usage(1) version mismatch — not checking artifacts, every comparison would be a false drift.\n` +
      `  pinned: ${pin.version} (${pin.file})\n` +
      `  found:  ${found}\n` +
      (miseFailure ? `  mise:   ${miseFailure}\n` : "  mise:   not on PATH\n") +
      `  Fix: install mise (https://mise.jdx.dev) and run \`mise install\`, or put usage ${pin.version} first on PATH.`,
  );
  process.exit(2);
}
// --- usage(1) resolver: end ---------------------------------------------------

const USAGE = resolveUsage(scaffolderDir);
const tmp = mkdtempSync(join(tmpdir(), "mcp-scaffold-usage-"));

try {
  const completions = join(tmp, "completions");
  const docs = join(tmp, "docs");
  const man = join(tmp, "man");
  execFileSync(
    "bash",
    [
      "-c",
      `set -e
       mkdir -p "${completions}" "${docs}" "${man}"
       "$USAGE_BIN" g completion bash mcp-scaffold -f .usage.kdl > "${completions}/mcp-scaffold.bash"
       "$USAGE_BIN" g completion zsh mcp-scaffold -f .usage.kdl > "${completions}/_mcp-scaffold"
       "$USAGE_BIN" g completion fish mcp-scaffold -f .usage.kdl > "${completions}/mcp-scaffold.fish"
       "$USAGE_BIN" g markdown -f .usage.kdl -m --out-dir "${docs}"
       "$USAGE_BIN" g manpage -f .usage.kdl -o "${man}/mcp-scaffold.1"`,
    ],
    { cwd: scaffolderDir, env: { ...process.env, USAGE_BIN: USAGE } },
  );

  let ok = true;
  for (const name of ["mcp-scaffold.bash", "_mcp-scaffold", "mcp-scaffold.fish"]) {
    ok =
      checkOne(
        `completion ${name}`,
        join(completions, name),
        join(repoDir, "completions", "scaffolder", name),
      ) && ok;
  }
  ok =
    checkOne("manpage", join(man, "mcp-scaffold.1"), join(repoDir, "man", "mcp-scaffold.1")) && ok;
  ok = checkDirectory("markdown docs", docs, join(repoDir, "docs", "scaffolder-cli")) && ok;

  if (!ok) {
    console.error(
      "\n→ Fix: pnpm --filter @george43g/mcp-scaffold artifacts && git add docs/scaffolder-cli completions/scaffolder man/mcp-scaffold.1",
    );
    process.exitCode = 1;
  } else {
    console.log("✓ mcp-scaffold usage(1) artifacts are fresh");
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

function checkDirectory(label, freshDir, checkedInDir) {
  if (!exists(checkedInDir)) {
    console.error(`✗ ${label}: missing ${checkedInDir}`);
    return false;
  }
  const fresh = new Set(readdirSync(freshDir).filter((file) => file.endsWith(".md")));
  const checkedIn = new Set(
    readdirSync(checkedInDir).filter((file) => {
      if (!file.endsWith(".md")) return false;
      return readFileSync(join(checkedInDir, file), "utf8").startsWith(
        "<!-- @generated by usage-cli",
      );
    }),
  );
  if (fresh.size !== checkedIn.size || ![...fresh].every((file) => checkedIn.has(file))) {
    console.error(`✗ ${label}: filename set drifted`);
    return false;
  }
  let ok = true;
  for (const file of fresh) {
    ok = checkOne(`${label}/${file}`, join(freshDir, file), join(checkedInDir, file)) && ok;
  }
  return ok;
}

function checkOne(label, fresh, checkedIn) {
  if (!exists(checkedIn)) {
    console.error(`✗ ${label}: missing ${checkedIn}`);
    return false;
  }
  if (!readFileSync(fresh).equals(readFileSync(checkedIn))) {
    console.error(`✗ ${label}: committed output drifted from apps/scaffolder/.usage.kdl`);
    return false;
  }
  return true;
}

function exists(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}
