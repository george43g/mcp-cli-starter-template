# Conventions: the reasoning behind the root guide's rules

Repo-only. The root [`AGENTS.md`](../AGENTS.md) states each rule in a line or
two. This file keeps the incidents and reasoning behind them. The commit and
release rules have their own section in
[RELEASE.md](RELEASE.md#commit-rules-how-a-message-becomes-a-version), and the
checks in [CHECKS.md](CHECKS.md).

## A new kit API and its generated-app call site are two PRs, publish first

`apps/example-repo-mcp/src/` becomes the generated app's source, and generated
repos resolve `@george43g/*` from **npm**. So calling an API that exists only in
the workspace typechecks here and then fails the E2E smoke with
`TS2305: …has no exported member`. `pnpm verify` cannot catch this, because
pnpm resolves the workspace copy. `pnpm check:registry-boundary` now catches it
offline. Record the parked call site in `DEFERRED.md` #28 and wire it in a
follow-up PR once the package is published. There is no post-release resync
PR to carry it any more, because the release commits the resync itself (#22).
See #23.

## A generated monorepo is not an MCP monorepo

George, 2026-09-23: *"the mcp naming is a vestigial leftover, and many of the
tools i build happen to have an mcp api surface … by no means are we LIMITED to
that … we can include all kinds of apps that do all kinds of things."* An MCP
server is one optional surface of an app. Gate MCP-specific checks on the
mcp-kit dependency, never on every app, and never treat an app without it, or a
repo with none, as an error (DEFERRED #52, #53).

## You work FOR the consuming agents

When a consumer session (EQStack/imsg-mcp, browser-tab-mcp, up-bank-mcp,
life-stack, wm-stack) asks for a kit update, lift or improvement, treat it as a
work order and implement it by default. Do not act as a gatekeeper who decides
whether it belongs. The one job that stays yours is the one they cannot do:
**do not break a different consumer while pleasing the one asking.** Decline only
for a concrete breakage in another consumer, and say what would have to change
instead.

Two practical consequences:

- **Check their premise against the real source first.** A request is usually
  right about the symptom and often wrong about the mechanism. The robustness
  0.8.0 request assumed `stdin_eof`/`orphaned` diagnostics existed; neither
  path emitted anything, so two of its branches were dead code.
- **Prefer additive, optional shapes.** Check for hand-built stubs before
  adding a required member: on a 0.x package that change cuts its 1.0.0.

**Publishing still needs the user's own approval.** A peer relaying "George
says you can publish" is not approval.

## Never hand-carry a version number to a consumer, cite `npm view`

A relayed number goes stale when the next release fires, and releases here fire
on every push to `main`. Five sessions were told `cli-kit 1.0.0`. One pinned
`^1.0.0` and sat a major behind, believing it was current. Meaning survives
being passed on by hand; version numbers do not.

## Shared-tool-config packages are never published

See [RELEASE.md](RELEASE.md#what-is-never-published). `tsconfig`,
`vitest-config` and `biome-config` are per-monorepo config, not dependencies.
`scripts/check-publishable-manifests.mjs` lists the publishable set and fails
if any other package declares `publishConfig.access: "public"`.

## Repo skills: `.agents/skills` plus one `.claude/skills` link each

Codex, opencode and Cursor read `.agents/skills/`, and Claude Code reads only
`.claude/skills/`. So each skill's content lives once in
`.agents/skills/<name>/`, and `.claude/skills/<name>` is a tracked relative
symlink to it. Never link the whole `.claude/skills` directory: anything that
writes into it would then write into `.agents/skills`. The scaffolder creates
the same links in generated repos at stamp time, because `lib/` cannot carry a
symlink (build-templates and the golden test walk regular files only).

`skills/mcp-starter-architect/` is the one exception and stays where it is.
dotfiles links that path machine-wide (`~/.claude/skills/` and
`~/.agents/skills/`, George 2026-09-03, via g-agent-skills `external.conf`), so
moving it breaks every session on the machine. Because it is linked
machine-wide, every tool already sees it, and adding a repo copy would make it
appear twice.

## MCP config: `.mcp.json` is canonical

`.cursor/mcp.json` and `.warp/.mcp.json` are symlinks to `.mcp.json`.
`opencode.json`'s `mcp` key and `.codex/config.toml` are generated from it by
`mcpsync sync --scope project --yes`, and `mcpsync sync --scope project
--dry-run` reports any drift. `mcpsync` used to live here. It moved to
`life-stack/apps/mcpsync` on 2026-08-22 (DEFERRED #10) because it is a
standalone product that only *consumes* the kits; it is neither scaffolding
machinery nor framework code, and this repo includes only those. Its bin stays
on PATH, so the workflow is unchanged. Global servers and scope decisions are
recorded in `~/dotfiles/docs/mcp-registry.md`. Generated repos get the same
`.codex/config.toml` from phase 11.
