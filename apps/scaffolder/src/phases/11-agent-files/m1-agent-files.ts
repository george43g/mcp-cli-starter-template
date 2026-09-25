/**
 * 11-agent-files/m1-agent-files — port AGENTS.md + agent config + skills.
 *
 * Lands:
 *   - AGENTS.md (canonical agent guide)
 *   - CLAUDE.md (symlink → AGENTS.md)
 *   - .mcp.json, opencode.json, .cursor/mcp.json (dev-MCP entries — relative paths)
 *   - .cursor/rules/example-repo.mdc (Cursor rules pointer)
 *   - .codex/config.toml (Codex's project MCP config, same servers as .mcp.json)
 *   - .claude/settings.local.json
 *   - .agents/skills/{example-repo,cli-artifacts,workspace-scaffolding,
 *     mcp-tool-author,pr-review-sop}/ + skills.md
 *   - .claude/skills/<name> → ../../.agents/skills/<name>, one link per skill
 *     (skill-links.ts), so Claude Code and every other tool read one copy
 *   - .github/PULL_REQUEST_TEMPLATE.md + .github/ISSUE_TEMPLATE/{bug,feature}.md
 *
 * Path-level substitution: paths like `.agents/skills/example-repo/SKILL.md` and
 * `.cursor/rules/example-repo.mdc` get resolved at write time (portPackage now
 * substitutes both content AND path).
 *
 * Symlink: CLAUDE.md is created as a symlink to AGENTS.md after the lib copy.
 * Cursor reads AGENTS.md and .cursor/rules/*.mdc directly, so no .cursorrules
 * is stamped (dropped 2026-09-21).
 */

import {
  appliedStatus,
  bootstrapsBareTree,
  Migration,
  type MigrationContext,
  type MigrationResult,
} from "../../core/migration.js";
import { portPackage } from "../../core/package-port.js";
import { requireRepoName } from "../../core/target-inspection.js";
import { nameUpperOf, substitute } from "../../core/templating.js";
import { TEMPLATES } from "../../generated/templates.js";
import {
  AGENTS_SKILLS_DIR,
  findLegacySkill,
  type LegacySkill,
  legacyFollowUp,
  linkSkills,
  refusedFollowUp,
  skillNamesIn,
} from "./skill-links.js";

const LIB_PREFIX = "11-agent-files/lib/";

const SKELETON_FOLLOW_UP =
  "Generated project skills are skeletons; complete them with the project's real tools and workflows.";

export default class AgentFilesMigration extends Migration {
  readonly id = "11-agent-files/m1-agent-files";
  readonly title = "Port AGENTS.md + CLAUDE.md symlink + .mcp.json + skills";
  readonly appliesTo = "both" as const;
  override readonly existingPolicy = "safe-any-existing" as const;

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    const fullTemplate =
      ctx.mode !== "existing" || ctx.target.starterLayout || bootstrapsBareTree(ctx);
    const name = requireRepoName(ctx.config);
    const skillNames = fullTemplate ? templateSkillNames(name) : [name];
    const legacy: LegacySkill[] = [];
    for (const skill of skillNames) {
      const found = await findLegacySkill(ctx, skill);
      if (found) legacy.push(found);
    }
    const legacyNames = new Set(legacy.map((s) => s.name));
    const skipLegacy = (targetPath: string) =>
      skillNamesIn([targetPath]).some((skill) => legacyNames.has(skill));

    const templateResult = fullTemplate
      ? await portPackage(ctx, { pkgDir: "", libPrefix: LIB_PREFIX, skip: skipLegacy })
      : await writeMinimalAgentFiles(
          ctx,
          legacy.find((s) => s.name === name),
        );

    // Create the CLAUDE.md symlink pointing at AGENTS.md.
    const symlinkChanged: string[] = [];
    const symlinkDivergent: string[] = [];
    const linkOutcome = await ctx.fs.symlink("AGENTS.md", "CLAUDE.md");
    if (linkOutcome === "divergent-skipped") symlinkDivergent.push("CLAUDE.md");
    else if (linkOutcome !== "unchanged") symlinkChanged.push("CLAUDE.md");

    const skillLinks = await linkSkills(
      ctx,
      skillNames.filter((skill) => !legacyNames.has(skill)),
    );
    symlinkChanged.push(...skillLinks.changed);
    symlinkDivergent.push(...skillLinks.divergent);

    const allChanged = [...(templateResult.filesChanged ?? []), ...symlinkChanged];
    const allDivergent = [...(templateResult.filesDivergent ?? []), ...symlinkDivergent];
    const skillFollowUps = [legacyFollowUp(legacy), refusedFollowUp(skillLinks.refused)].filter(
      (line): line is string => line !== undefined,
    );
    const notes = [
      ...(templateResult.notes ?? []),
      ...(symlinkChanged.length ? [`symlinks: ${symlinkChanged.join(", ")}`] : []),
      ...(symlinkDivergent.length
        ? [`preserved divergent links/files: ${symlinkDivergent.join(", ")}`]
        : []),
    ];

    if (allChanged.length === 0 && allDivergent.length === 0 && skillFollowUps.length === 0) {
      return { status: "noop" };
    }

    const result: MigrationResult = {
      status: templateResult.status === "noop" ? appliedStatus(ctx.dryRun) : templateResult.status,
      notes,
      followUps: [...(templateResult.followUps ?? []), SKELETON_FOLLOW_UP, ...skillFollowUps],
    };
    if (allChanged.length > 0) result.filesChanged = allChanged;
    if (allDivergent.length > 0) result.filesDivergent = allDivergent;
    if (templateResult.error) result.error = templateResult.error;
    return result;
  }
}

/** Skill directories the full template stamps, with the repo name substituted. */
function templateSkillNames(name: string): string[] {
  const paths = Object.keys(TEMPLATES)
    .filter((key) => key.startsWith(`${LIB_PREFIX}${AGENTS_SKILLS_DIR}/`))
    .map((key) => substitute(key.slice(LIB_PREFIX.length), { name, nameUpper: nameUpperOf(name) }));
  return skillNamesIn(paths);
}

async function writeMinimalAgentFiles(
  ctx: MigrationContext,
  legacySkill: LegacySkill | undefined,
): Promise<MigrationResult> {
  const name = requireRepoName(ctx.config);
  const skillPath = `${legacySkill?.path ?? `${AGENTS_SKILLS_DIR}/${name}`}/SKILL.md`;
  const files: Array<readonly [string, string]> = [
    ["AGENTS.md", renderMinimalAgents(ctx, name)],
    [`.cursor/rules/${name}.mdc`, renderMinimalCursorRule()],
    ["skills.md", renderMinimalSkillsIndex(name, skillPath)],
  ];
  if (!legacySkill) files.push([skillPath, renderMinimalSkill(name)]);
  const filesChanged: string[] = [];
  const filesDivergent: string[] = [];
  for (const [path, content] of files) {
    const outcome = await ctx.fs.writeIfChanged(path, content);
    if (outcome === "divergent-skipped") filesDivergent.push(path);
    else if (outcome !== "unchanged") filesChanged.push(path);
  }

  if (filesChanged.length === 0 && filesDivergent.length === 0) return { status: "noop" };
  const verb = ctx.dryRun ? "would write" : "wrote";
  const notes = [
    `${verb} minimal agent documentation for detected ${ctx.target.packageManager} repo`,
  ];
  if (filesDivergent.length > 0) {
    notes.push(`${filesDivergent.length} divergent (preserved; pass --force to overwrite)`);
  }
  const result: MigrationResult = {
    status: appliedStatus(ctx.dryRun),
    notes,
  };
  if (filesChanged.length > 0) result.filesChanged = filesChanged;
  if (filesDivergent.length > 0) result.filesDivergent = filesDivergent;
  return result;
}

function renderMinimalAgents(ctx: MigrationContext, name: string): string {
  const packageLabel = ctx.target.packageName ?? name;
  const scripts = Object.entries(ctx.target.packageScripts).sort(([a], [b]) => a.localeCompare(b));
  const scriptRows =
    scripts.length > 0
      ? scripts
          .map(
            ([script, command]) =>
              `| \`${escapeTable(script)}\` | \`${ctx.target.packageManager} run ${escapeTable(script)}\` | \`${escapeTable(command)}\` |`,
          )
          .join("\n")
      : "| _(none detected)_ | Add the project's real commands here. | — |";

  return `# ${name} — Agent Guide

This guide was generated for an existing, non-starter repository. It intentionally records only facts detected from package.json; complete every TODO before treating it as authoritative.

## Detected project facts

- Package: \`${packageLabel}\`
- Package manager: \`${ctx.target.packageManager}\`
- Starter layout: no (the full starter-specific architecture guide was not applied)

## Commands

| Script | Run | package.json definition |
|---|---|---|
${scriptRows}

Install dependencies with \`${installCommand(ctx.target.packageManager)}\`.

## Architecture

TODO: Describe the real source layout, module boundaries, entry points, transports, and data flow.

## Tools and workflows

TODO: List every user-facing MCP tool/CLI command, its inputs, side effects, auth requirements, and common multi-step workflows.

## Environment

TODO: Document required runtime versions, environment variables, secrets, local services, and setup steps. Never commit credentials.

## Security

TODO: Record trust boundaries, validation/sanitization rules, permission constraints, destructive operations, and safe logging requirements.

## Verification

TODO: Identify the minimum checks for routine changes and the full release/CI verification command.

## Troubleshooting

TODO: Add project-specific symptoms, likely causes, diagnostic commands, and recovery steps.
`;
}

function renderMinimalCursorRule(): string {
  return `---
description: Follow the repository's canonical agent guidance
alwaysApply: true
---

Read and follow \`AGENTS.md\` before changing this repository. Treat its TODO sections as required project documentation work, not established facts.
`;
}

function renderMinimalSkill(name: string): string {
  return `---
name: ${name}
description: TODO - replace with when this project's real tools and workflows should be used.
---

# ${name}

> Skeleton generated during an existing-repository retrofit. Replace every TODO with project-specific content.

## When to use this skill

TODO: Describe user intents that should activate this skill.

## Tools

TODO: Document the real tools or commands, inputs, constraints, side effects, and authentication requirements.

## Workflows

TODO: Add reliable project-specific workflows and verification steps.

## Troubleshooting

TODO: Add the most useful failure modes and recovery commands.
`;
}

function renderMinimalSkillsIndex(name: string, skillPath: string): string {
  return `# Skills index

Repo skills live in \`.agents/skills/<name>/\`; Claude Code reads \`.claude/skills/<name>\`, a relative symlink to the same directory.

- [\`${name}\`](${skillPath}) — project skill skeleton; complete it with the real tools and workflows before relying on it.
`;
}

function installCommand(packageManager: MigrationContext["target"]["packageManager"]): string {
  if (packageManager === "npm") return "npm install";
  return `${packageManager} install`;
}

function escapeTable(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/`/g, "\\`");
}
