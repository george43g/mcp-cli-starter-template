# {{name}} — canonical skill

> This is the canonical agent skill file. `.agents/skills/{{name}}-dev/SKILL.md` and any platform-specific copies should point here, not duplicate it.

For the full agent guide (commands, env layout, MCP best practices, watchdog thresholds, post-step verification), see `AGENTS.md` in the repo root — `CLAUDE.md` and `.cursorrules` are symlinks to it.

For per-domain skill development, prefer adding new skill files under `.claude/skills/<topic>/` (Claude Code) or under `.cursor/rules/<topic>.mdc` (Cursor) rather than expanding this file. This file should stay short and stable.

## Canonical workflows

| Workflow | Skill |
|----------|-------|
| Adding an MCP tool | `.claude/skills/mcp-tool-author/SKILL.md` |
| Reviewing a PR | `.claude/skills/pr-review-sop/SKILL.md` |
