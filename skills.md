# Skills index

Every repo skill lives in `.agents/skills/<name>/` (read by Codex, opencode and
Cursor). Claude Code reads `.claude/skills/<name>`, a tracked relative symlink
to the same directory. Add or rename a skill, then run
`link-repo-skills --apply` and commit both paths; `pnpm check:skills` fails on
a missing or wrong link.

Canonical agent skill: [`.agents/skills/example-repo/SKILL.md`](.agents/skills/example-repo/SKILL.md).

Portable workspace skills:

- [`cli-artifacts`](.agents/skills/cli-artifacts/SKILL.md) — keep CLI help docs, completions, and manpages synchronized, including when the MCP app is removed
- [`workspace-scaffolding`](.agents/skills/workspace-scaffolding/SKILL.md) — choose and integrate official native generators for new leaf workspaces

Topic skills:

- [`mcp-tool-author`](.agents/skills/mcp-tool-author/SKILL.md) — checklist for adding new MCP tools
- [`pr-review-sop`](.agents/skills/pr-review-sop/SKILL.md) — security + quality SOP for PR review
