#!/usr/bin/env node

/**
 * Repo-skill layout gate: `link-repo-skills --check` over each directory given
 * (default: the repo root).
 *
 * Every repo skill lives in `.agents/skills/<name>/`, which Codex, opencode and
 * Cursor read, with a tracked relative symlink `.claude/skills/<name>` →
 * `../../.agents/skills/<name>`, because Claude Code reads only
 * `.claude/skills`. The checker ships with the `repo-scoped-skills` skill
 * (installed at ~/.agents/skills/repo-scoped-skills), not in this repo, so the
 * rule changes in one place.
 *
 * GUARDED on purpose: a fresh clone on a bare machine, or a CI runner, has no
 * such skill, and must still pass `pnpm verify`. There this prints one skip
 * line naming the missing tool and exits 0. The check has teeth where skills
 * are authored — a dev machine that has the skill installed. Everything else
 * (a skill that fails, a Python that cannot run it) exits non-zero.
 *
 * Usage: node scripts/check-skills.mjs [dir ...]
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const linker = join(homedir(), ".agents/skills/repo-scoped-skills/bin/link-repo-skills");

if (!existsSync(linker)) {
  console.log(
    "check:skills skipped: repo-scoped-skills is not installed (~/.agents/skills/repo-scoped-skills)",
  );
  process.exit(0);
}

const dirs = process.argv.slice(2);
let failed = 0;
for (const dir of dirs.length > 0 ? dirs : ["."]) {
  // The linker is a Python script. Windows cannot exec a shebang, so it goes
  // through the interpreter by name there.
  const [command, args] = process.platform === "win32" ? ["python", [linker]] : [linker, []];
  const result = spawnSync(command, [...args, "--check", resolve(root, dir)], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`check:skills: could not run ${linker}: ${result.error.message}`);
    failed += 1;
  } else if (result.status !== 0) {
    failed += 1;
  }
}

if (failed > 0) {
  console.error(
    "\ncheck:skills failed. Fix: link-repo-skills --apply <dir>, then git add .agents/skills .claude/skills.",
  );
  process.exit(1);
}
