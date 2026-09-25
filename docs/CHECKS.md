# Checks: what each gate catches, and why it exists

Repo-only. The root [`AGENTS.md`](../AGENTS.md) lists every command in one line;
this is the rationale behind the ones whose reason is not obvious from the name.
Each gate here is in `pnpm verify` unless it says otherwise.

## Docs and agent files

**`pnpm check:docs`** — relative links resolve, agent-file symlinks
(`CLAUDE.md` → `AGENTS.md`) are intact, every top-level `docs/*.md` has a row
in [`docs/README.md`](README.md), and every root-to-leaf `AGENTS.md` chain is
at most 28,000 B.

The chain budget exists because Codex concatenates every `AGENTS.md` from the
project root to its working directory against one 32,768-byte budget
(`project_doc_max_bytes`) and drops the rest without telling the model. On
2026-09-26 the root guide (19,572 B) plus `example/AGENTS.md` (14,639 B) came to
34,211 B, so Codex working in `example/` lost the end of the generated guide.
28,000 leaves room for the next rule. The chain is counted the way Codex
builds it, and agrees with the shared `check-instruction-chain`
(harness-engineering skill) on its pinned cases: per directory
`AGENTS.override.md` wins over `AGENTS.md`, a whitespace-only override still
hides the `AGENTS.md` beside it, a symlink counts its target's bytes every time
it appears, and only tracked files count. A generated repo before its first
`git add` has none tracked, so the check says it checked nothing rather than
passing; outside a git work tree it fails. `example/` is measured twice: under this
repo's root, and as the root of the generated repo it is. The implementation is
[`scripts/lib/agents-chain.mjs`](../scripts/lib/agents-chain.mjs), which the
scaffolder also stamps, so generated repos enforce the same budget.

**`pnpm check:skills`** — `link-repo-skills --check` (from the
`repo-scoped-skills` skill) over this repo and `example/`. Repo skills live in
`.agents/skills/<name>/`, which Codex, opencode and Cursor read. Claude Code
reads only `.claude/skills/`, so each skill has a tracked relative symlink
`.claude/skills/<name>` → `../../.agents/skills/<name>`. Until 2026-09-26 this
repo had one skill only Codex could see and two only Claude could see.

The checker lives with the skill, not in this repo, so the rule changes in one
place. The gate is guarded: where the skill is not installed (CI, a fresh
clone), it prints one line saying it skipped and passes. That is a named
exception to "a check never exits 0 as skipped". The check matters on the
machines where skills are written, and those have the skill. Generated repos
stamp the same `scripts/check-skills.mjs`.

**`pnpm check:stdout-purity`** — no `console.*` call in an MCP app's `src/`,
because JSON-RPC owns stdout once the stdio transport connects. The stamped
`AGENTS.md` said "CI grep enforces this" for months while nothing did, and the
false sentence was copied into descendant repos. A guard that is claimed but
does not exist is worse than having no guard. The selector keys on the
mcp-kit dependency, so a CLI may print (see the script header).

**`pnpm check:stale-plans`** — an ExecPlan must carry a status in its first 20
lines, must not contradict a completion heading in its own body, and, if
non-terminal, must not go 30 days without a commit unless it carries a dated
`PARKED`/`SUPERSEDED`. Ported from life-stack after a fleet sweep found
`2026-08-build-identity.md` still reading "planned, not started" 28 days after
every deliverable in it had shipped. **What it does not buy**: the status
being *true*. It reads plans, never code (DEFERRED #50).

## Counts and manifests

**`pnpm check:stress-count`** — the stress harness's `EXPECTED_ASSERTIONS`
against every prose site that quotes it. The harness asserts the constant
against its own run, so the chain is `results.length` → constant → docs.
DEFERRED #40 is the incident: the count was stale in 19 places.

**`pnpm check:publishable-manifests`** — publish shape of the npm-published
packages: repository metadata, `files`, no `workspace:` in shipped deps. It
also fails any package that declares `publishConfig.access: "public"` without
being registered, which is what keeps the shared-tool-config packages private
([RELEASE.md](RELEASE.md#what-is-never-published)).

**`pnpm check:registry-boundary`** — fails a generated-app import of a kit API
that is not in the RELEASED surface. It compares against each package's git
release tag, so it needs no network. Nothing else in `pnpm verify` can catch
this, because pnpm links the workspace copy (DEFERRED #23, #28).

**`pnpm check:turbo-tasks`** — every turbo task that RUNS tests must depend on
its OWN `build`, not just `^build`. This was caught twice in one hour:
`^build` builds *dependencies*, so a test that spawns its own `dist/` passes
wherever an old build exists and fails in a fresh clone. That is how a release
job failed after every PR check went green.

**`pnpm check:workflows`** — `actionlint` (pinned in `mise.toml`) over all
three workflow surfaces: this repo, the `12-ci-release` lib mirror, and
`example/`. Requires `mise install` first.

## Not in `verify`

**`pnpm check:deps-stale`** asks the **registry** whether our first-party deps
are current. `verify` is network-free by design, so this one runs weekly via
`.github/workflows/deps-stale.yml`. It catches the one thing every offline
check misses: a tree that agrees with itself and is uniformly behind. Exit 2
means the registry was unreachable, which is **not** a pass.

## CI workflows

`release-tokens.yml` checks that a PR title and body cannot trigger an
unintended release. It is its **own** workflow file, not a job in `ci.yml`,
because it reads the PR title and body, and those change without a push. Only
a workflow listing the `edited` event re-runs when a description is edited, and
`ci.yml` cannot list it without re-running the full matrix on every typo fix.
The same job also runs inside `release-packages.yml` as a gate every release
job needs. That second copy is the one that matters: `main` is unprotected, so
a direct push never opens a PR ([RELEASE.md](RELEASE.md#commit-rules-how-a-message-becomes-a-version)).

`readme-check.yml` fails when `src/**` changed without a `README.md` update;
bypass it with `[skip-readme]`.
