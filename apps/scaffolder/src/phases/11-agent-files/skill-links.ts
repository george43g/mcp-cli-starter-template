/**
 * Repo skills: content in `.agents/skills/<name>/`, which Codex, opencode and
 * Cursor read, plus one relative symlink `.claude/skills/<name>` →
 * `../../.agents/skills/<name>`, because Claude Code reads only
 * `.claude/skills`. This is the layout `link-repo-skills --check`
 * (the repo-scoped-skills skill) enforces.
 *
 * The links are CREATED here rather than carried in `lib/`: build-templates
 * and the golden test walk regular files only, so a symlink under `lib/`
 * would silently never ship.
 *
 * Existing repos: a skill already at a pre-`.agents` location (a real
 * `.claude/skills/<name>/` directory, or `skills/<name>/`) is left exactly
 * where it is. Writing a fresh `.agents/skills/<name>/` beside it would hand
 * Codex the template and Claude the tailored copy — two skills with one name
 * that drift. The caller skips it and the follow-up says how to move it.
 */

import { lstat } from "node:fs/promises";
import type { MigrationContext } from "../../core/migration.js";

export const AGENTS_SKILLS_DIR = ".agents/skills";
export const CLAUDE_SKILLS_DIR = ".claude/skills";

export interface LegacySkill {
  name: string;
  /** Where the skill already lives, relative to the repo root. */
  path: string;
}

/** Skill directory names under `.agents/skills/` in a list of target paths. */
export function skillNamesIn(targetPaths: Iterable<string>): string[] {
  const names = new Set<string>();
  const prefix = `${AGENTS_SKILLS_DIR}/`;
  for (const path of targetPaths) {
    if (!path.startsWith(prefix)) continue;
    const name = path.slice(prefix.length).split("/")[0];
    if (name) names.add(name);
  }
  return [...names].sort();
}

async function isRealDirectory(ctx: MigrationContext, relPath: string): Promise<boolean> {
  try {
    const stat = await lstat(ctx.fs.safe(relPath));
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/** The pre-`.agents` location a skill already occupies, if any. */
export async function findLegacySkill(
  ctx: MigrationContext,
  name: string,
): Promise<LegacySkill | undefined> {
  for (const path of [`${CLAUDE_SKILLS_DIR}/${name}`, `skills/${name}`]) {
    if (await isRealDirectory(ctx, path)) return { name, path };
  }
  return undefined;
}

export function legacyFollowUp(legacy: readonly LegacySkill[]): string | undefined {
  if (legacy.length === 0) return undefined;
  const moves = legacy.map((s) => `git mv ${s.path} ${AGENTS_SKILLS_DIR}/${s.name}`).join("; ");
  return (
    `Skills left at a legacy path (${legacy.map((s) => s.path).join(", ")}): only one tool ` +
    `sees each. Move them into ${AGENTS_SKILLS_DIR}/ and link them: ${moves}; then run ` +
    "link-repo-skills --apply (repo-scoped-skills) and commit .agents/skills + .claude/skills."
  );
}

export interface SkillLinkResult {
  changed: string[];
  divergent: string[];
  /** Links the OS refused (Windows without Developer Mode or admin). */
  refused: string[];
}

const REFUSED_CODES = new Set(["EPERM", "EACCES", "ENOSYS"]);

/**
 * Link `.claude/skills/<name>` → `../../.agents/skills/<name>` for each name
 * whose `.agents` directory exists (or would, in a dry run).
 *
 * A refused symlink is reported, never thrown: the skill content is already
 * written and every non-Claude tool reads it. On Windows symlink creation needs
 * Developer Mode or an elevated shell; a junction is not a fallback here,
 * because Node makes a junction's target absolute, which a clone elsewhere
 * cannot resolve.
 */
export async function linkSkills(
  ctx: MigrationContext,
  names: readonly string[],
): Promise<SkillLinkResult> {
  const result: SkillLinkResult = { changed: [], divergent: [], refused: [] };
  for (const name of names) {
    const content = `${AGENTS_SKILLS_DIR}/${name}`;
    if (!ctx.dryRun && !ctx.fs.exists(`${content}/SKILL.md`)) continue;
    const link = `${CLAUDE_SKILLS_DIR}/${name}`;
    try {
      const outcome = await ctx.fs.symlink(`../../${content}`, link, "dir");
      if (outcome === "divergent-skipped") result.divergent.push(link);
      else if (outcome !== "unchanged") result.changed.push(link);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (typeof code !== "string" || !REFUSED_CODES.has(code)) throw error;
      result.refused.push(`${link} (${code})`);
    }
  }
  return result;
}

export function refusedFollowUp(refused: readonly string[]): string | undefined {
  if (refused.length === 0) return undefined;
  return (
    `Could not create ${refused.join(", ")}: this OS refused the symlink, so Claude Code ` +
    "does not see those skills (Codex, opencode and Cursor do). On Windows enable " +
    "Developer Mode, set `git config core.symlinks true`, then run link-repo-skills --apply."
  );
}
