# Scaffold Retrofit Findings

Findings from running `mcp-scaffold apply` and `mcp-scaffold migrate 11-agent-files`
against an **existing, non-starter-derived repo** (`openwrt-mcp` — a simple 3-file
npm/CommonJS MCP server with none of the starter-template infrastructure).

These were bugs, rough edges, and improvement opportunities discovered during the
retrofit. The remediation status below is current as of 2026-07-18; historical
source references in the individual findings remain as discovery evidence.

## Resolution status (2026-07-18)

- **Bugs 1–2 resolved**: one pre-migration target inspection now derives and validates names, detects package managers, and emits one prominent fallback warning for unusable package metadata. Downstream template code treats a missing resolved name as an invariant failure.
- **Bug 3 resolved**: generated `RETROFIT.md` links to the architect skill and migration sources in the scaffolder repository and states that those sources are not copied into targets.
- **Findings 4–6 resolved**: phase 11 detects the complete starter layout before selecting the full template. Other existing repos receive minimal package-manager-aware documentation, safe symlinks, a generic Cursor rule, and clearly marked project skill skeletons. Skeleton completion appears under `Action required` in the recap.
- **Findings 7–8 confirmed**: no behavioral remediation was required.
- **Bugs 9–10 resolved**: generated root `mise.toml` pins `usage = "3.3.0"`; consumer CI omits only the scaffolder E2E and example-drift steps while retaining the consumer verification gates.
- **Related safety defects resolved**: `migrate` now defaults to existing-mode dry-run/preservation, symlink writes verify targets and honor `--force`, and phase 11 preserves combined changed/divergent metadata.
- **Product boundary**: fresh scaffolds are pnpm-only. npm and Bun are detected for accurate minimal documentation in existing repositories; they are not supported fresh-scaffold architectures. Full existing-repo infrastructure migrations remain pnpm/Turborepo-oriented and emit a warning for npm/Bun targets.
- **Deferred**: the strategic “when to build a dedicated MCP server” guidance remains recorded below and is not promoted to user-facing documentation in this remediation.

---

## Bug 1 — Name derivation is broken in apply/migrate mode (CRITICAL)

**Symptom**: Running `mcp-scaffold migrate 11-agent-files --target /path/to/openwrt-mcp --execute`
(without `--name`) generated every file using the placeholder name `mcp-starter`
instead of `openwrt` (the actual `name` field in the target's `package.json`).
The agent had to manually rename `skills/mcp-starter/` → `skills/openwrt/`,
`.agents/skills/mcp-starter-mcp-dev/` → `.agents/skills/openwrt-mcp-dev/`, and
find-replace `mcp-starter` → `openwrt` across ~8 config files.

**Root cause** (two compounding issues):

1. `apps/scaffolder/src/core/config.ts:79` — the `repoName` config leaf has
   `skipIf: (c) => c.global.mode.peek() === "existing"`, so in `apply`/`migrate`
   mode the name is **never asked and never set**. `repoName.peek()` returns
   `undefined`.

2. `apps/scaffolder/src/core/package-port.ts:59` — falls back to a hardcoded
   default when the leaf is unset:
   ```ts
   const name = ctx.config.global.repoName.peek() ?? "mcp-starter";
   ```
   So every template substitution (`example-repo` → `mcp-starter`, `EXAMPLE_REPO`
   → `MCP_STARTER`) silently uses the wrong name.

The `--name` flag does exist (`apps/scaffolder/src/core/program.ts:39,
:178`), but it's documented as `"Tool name (kebab-case, BARE — no -mcp suffix)"`
and is easy to forget in retrofit mode since the target already has a name.

**Fix**: In `apply`/`migrate` mode against an existing repo, when `--name` is
not provided, auto-derive the name from the target's `package.json`:
- Read `<cwd>/package.json` → `name` field
- Strip the npm scope prefix (e.g. `@george43g/foo` → `foo`)
- Strip a trailing `-mcp` suffix if present (the scaffold adds it back for dirs)
- Fall back to `mcp-starter` only if `package.json` is missing or has no `name`

Best implemented in `runScaffolder()` (`program.ts:197`) or
`applyCmdOptsToConfig()` (`program.ts:177`) — after `applyCmdOptsToConfig` runs,
if `mode === "existing"` and `cmdOpts.name` is unset, read the target
`package.json` and call `config.global.repoName.set(derivedName)`.

**Test to add**: `apps/scaffolder/tests/retrofit.test.ts` — apply phase 11 to a
fixture repo whose `package.json` has `{"name": "my-cool-tool"}` (no `--name`
flag) and assert generated paths use `my-cool-tool`, not `mcp-starter`.

---

## Bug 2 — Silent fallback to default name (no warning)

**Symptom**: When Bug 1's fallback fires, the scaffold prints no warning. The
recap just lists "wrote N files" — the user only discovers the wrong name after
inspecting the generated tree. For a retrofit into a real project this means
~15 files sprinkled with `mcp-starter` references that all need manual cleanup.

**Fix**: In `package-port.ts` (or wherever the fallback is consumed), emit a
`log.warn(...)` when the fallback path is taken, e.g.:
> "No --name provided and no package.json name found; using 'mcp-starter' as
> default. Pass --name <name> to override."

This makes Bug 1's failure mode noisy instead of silent.

---

## Bug 3 — Hardcoded skill path in RETROFIT.md generator

**Location**: `apps/scaffolder/src/core/retrofit.ts:115`

```ts
lines.push(
  "- `skills/mcp-starter-architect/SKILL.md` — full retrofit playbook ...",
);
```

This path is hardcoded rather than templated. The skill directory
`skills/mcp-starter-architect/` does exist in the scaffold repo itself (not a
per-target name), so this is arguably correct — but it's inconsistent with the
rest of the scaffold's templating convention and will mislead anyone who assumes
all `mcp-starter` strings are auto-substituted. Either template it or add a
comment clarifying that this path refers to a skill that lives in the scaffold
repo, not the target repo.

---

## Finding 4 — Phase 11 AGENTS.md assumes the full starter architecture

**Symptom**: The phase 11 template at
`apps/scaffolder/src/phases/11-agent-files/lib/AGENTS.md` describes a Turborepo
monorepo with: pnpm 10.x, 4 CLI surfaces (mcp/tui/doctor/repl), `packages/robustness`
watchdog, `packages/mcp-kit`, `packages/cli-kit`, `packages/tui-kit`, `apps/rust-accel`
native acceleration, HTTP transport, an 11-case stress harness, semantic-release,
etc.

When phase 11 is applied to a **non-starter-derived repo** (like `openwrt-mcp`,
which is a flat 3-file npm/CommonJS project with none of that infrastructure),
the generated `AGENTS.md` is almost entirely wrong — every section references
packages, commands, and features that don't exist in the target. The agent had
to **completely rewrite** the AGENTS.md from scratch.

This is not strictly a bug (the template is correct for `init` mode), but it
makes phase 11 retrofit nearly useless for non-starter repos without a full
rewrite.

**Fix options** (pick one):
1. **Detect non-starter targets**: if the target has no `apps/`, no `packages/`,
   no `turbo.json`, and no `pnpm-workspace.yaml`, generate a **minimal** AGENTS.md
   skeleton (stack section, source layout, commands, env vars, tools table,
   security, troubleshooting) instead of the full-architecture one. Ship a
   second template like `lib/AGENTS.minimal.md`.
2. **Warn on retrofit**: when applying phase 11 to an existing repo, print a
   warning that the generated AGENTS.md assumes the full starter architecture
   and will need substantial rewriting for non-starter targets.
3. **Document the limitation**: add a note to `docs/scaffolder-cli/apply.md` and
   `docs/scaffolder-cli/migrate.md` explaining that phase 11's AGENTS.md is
   tailored to starter-derived repos.

---

## Finding 5 — Package manager / monorepo assumptions in generated docs

**Symptom**: The phase 11 templates (AGENTS.md, skills, README) assume **pnpm**
and a **Turborepo monorepo** throughout (`pnpm install`, `pnpm --filter`,
`pnpm build`, `turbo`, workspace topology). When retrofitting into an **npm** or
single-package repo, every command reference needs manual find-replace.

The scaffold does have a `--package-manager` flag (`program.ts:41`, defaults to
`pnpm`) and a `packageManager` config leaf (`config.ts:100`), but the phase 11
template content is **statically pnpm/monorepo** — it doesn't substitute based
on the chosen package manager, and there's no monorepo-vs-flat toggle for the
generated docs.

**Fix**: Either (a) templated command snippets in the phase 11 lib files that
substitute `pnpm`/`npm`/`bun` based on `config.global.packageManager`, and
strip the monorepo sections when `config.global.monorepo` is false; or (b) ship
separate minimal templates for non-monorepo/non-pnpm retrofits (overlaps with
Finding 4 option 1).

---

## Finding 6 — Generated skills are generic skeletons needing full rewrite

**Symptom**: `skills/example-repo/SKILL.md` (the user-facing skill) and
`.agents/skills/example-repo-dev/SKILL.md` (the dev skill) are skeleton files
with placeholder structure. After name substitution they still describe a
generic MCP server, not the actual project's tools/workflows. The agent had to
rewrite both files completely with project-specific content (the 7 openwrt
tools, SSH auth methods, source layout, etc.).

This is **expected for retrofit** (the scaffold can't know the project's tools),
but it's worth documenting so future agents don't expect a turnkey result. The
scaffold's recap should perhaps note: "skills/ and .agents/skills/ generated as
skeletons — rewrite with project-specific tool descriptions."

---

## Finding 7 — Dry-run vs execute behavior is correct (no bug)

For completeness: the dry-run path (`plan`, or `apply`/`migrate` without
`--execute`) accurately previews what would be written. Divergent files (e.g. a
pre-existing customized `README.md`) are **preserved by default** and only
overwritten with `--force`. This is the correct behavior and worked as designed
during the openwrt-mcp apply. The recap correctly reported "18 would apply · 7
skipped · 1 divergent files preserved · 0 failed".

---

## Finding 8 — `migrate <id>` single-phase execution works cleanly

`mcp-scaffold migrate 11-agent-files --target <dir> --execute` ran cleanly
(exit 0, ~10ms) and produced the expected file tree. The `migrate` subcommand's
phase-filter logic (`program.ts:252` `filterPhases`) correctly narrows to a
single migration by id or a whole phase by prefix. No issues here — documenting
that this path is reliable.

---

## Strategic insight — When NOT to build a dedicated MCP server

The `openwrt-mcp` case study is a cautionary tale worth recording. The repo is
an MCP server that wraps 7 SSH commands against an OpenWrt router
(`execute_command`, `read_file`, `write_file`, `list_interfaces`, etc.). After
building it out, the conclusion was: **a dedicated MCP server that just wraps
SSH commands provides minimal value over either (a) an agent running SSH
directly, or (b) a persistent-shell/tmux MCP + SSH session.**

The only genuine differentiator that *would* have justified a dedicated OpenWrt
MCP server is exposing **ubus** — OpenWrt's custom JSON-RPC inter-process bus
(documented at https://openwrt.org/docs/techref/ubus). `ubus call
network.interface.wan status` returns **structured JSON**, unlike raw `uci show`
or `ifconfig` output. An MCP server that exposed ubus calls as typed tools
returning parsed JSON would give an agent something it can't easily get by
running SSH commands directly (it would otherwise have to construct JSON-RPC
calls, manage session tokens, and parse responses itself). The competing
OpenWrt MCP servers (istoreos-mcp with 31 tools, jsebgiraldo's with 19) all
miss this — they just wrap the same CLI commands an agent could run directly.

**Lesson for the starter template**: consider adding guidance (in
`docs/quickstart.mdx` or a new `docs/when-to-build.md`) on when a dedicated MCP
server is justified vs when an agent + SSH + a persistent-shell MCP is the
better architecture. Heuristic: a dedicated MCP server is justified when it
either (a) exposes a non-trivial protocol the agent can't easily speak itself
(ubus, custom APIs, binary protocols), (b) persists connection/auth state across
agent sessions in a way that's painful to recreate each time, or (c) aggregates
multiple calls into a reliable higher-level operation. A thin SSH-command wrapper
satisfies none of these.

---

## Cleanup actions taken downstream (for reference)

After extracting these findings, the `openwrt-mcp` repo was removed:
- `git -C ~/dotfiles rm network/openwrt-mcp` (removed the gitlink; was mode
  160000 but not registered in `.gitmodules`)
- `rm -rf network/openwrt-mcp/` (the nested git repo + working tree)
- Removed `openwrt-router-1` and `openwrt-router-2` entries from
  `~/dotfiles/.mcp.json` and `~/dotfiles/opencode.json`
- Added `tmux-mcp-rs` (bnomei/tmux-mcp, installed via `brew install
  bnomei/tmux-mcp/tmux-mcp-rs`) to `~/dotfiles/.mcp.json` as the persistent
  terminal MCP — agents now SSH into routers through a tmux session instead of
  going through openwrt-mcp.

The `network/openwrt-mesh/` deploy scripts and `network/home-network-topology.md`
are unrelated to openwrt-mcp and were left intact.

---

# init-mode findings — browser-tab-mcp scaffold (2026-07-13)

The findings below are from a fresh `mcp-scaffold init` into a new repo
(`browser-tab-mcp`), **not** a retrofit. They were hit while scaffolding
the repo, fixed downstream in browser-tab-mcp, but never reported back
upstream. Recorded here so the next scaffolder agent can fix them at the
source.

---

## Bug 9 — Root `mise.toml` is missing the `usage(1)` pin (CRITICAL, breaks CI)

**Symptom**: Freshly scaffolded repo's CI step `Check usage(1) artifacts
are fresh vs .usage.kdl` fails with `usage: command not found` on both
ubuntu-latest and macos-latest. The step shells out to `usage` to
regenerate completions/manpage/markdown and byte-compare against the
checked-in copies, but `usage` is not on PATH.

**Root cause**: The scaffolder writes `usage = "3.3.0"` into
`apps/<name>-mcp/mise.toml` (the app-local mise config) but **omits it
from the root `mise.toml`**. `jdx/mise-action@v4` in CI reads the
**root** config to install tools, so it never installs `usage` and never
puts it on PATH. The app-local pin only applies when you `cd` into
`apps/<name>-mcp/` and run mise, which the CI step does not do.

The canonical root `mise.toml` in this meta-repo DOES carry
`usage = "3.3.0"` (lines 13-19), and `apps/example-repo-mcp/mise.toml`
plus the scaffolder lib mirror both have the pin. The scaffolded
output's root `mise.toml` does not. The phase 02-toolchain/m1-mise
migration must be dropping it when emitting the consumer root config.

The golden drift test (`apps/scaffolder/tests/golden.test.ts`) did not
catch this because it compares lib/ vs canonical for app-level files,
and the root `mise.toml` is generated by a migration rather than ported
from lib/.

**Fix**: The migration that emits the root `mise.toml` must include the
`usage = "3.3.0"` pin with the same explanatory comment as the
canonical root config.

**Test to add**: scaffold a fresh repo into a tempdir and assert the
root `mise.toml` contains a `usage = ` line. Or extend
`migrations.test.ts` to assert the emitted root `mise.toml` matches the
canonical byte-for-byte.

**Workaround applied downstream**: browser-tab-mcp commit `32a272d`
manually added the pin to the root `mise.toml` and committed the
first-run completions/man/docs artifacts so the freshness check had a
baseline to diff against.

---

## Bug 10 — Consumer CI workflow copies scaffolder-meta-repo-only steps

**Symptom**: Freshly scaffolded repo's CI fails at the `Scaffolder E2E
smoke (init → install → test)` step with `Cannot find module
'.../apps/scaffolder/dist/cli.js'`. The following `Example/ output
stays in sync with scaffolder` step would fail the same way.

**Root cause**: The CI workflow is copied verbatim from the
`mcp-cli-starter-template` meta-repo, including two steps that are only
valid there:

- `Scaffolder E2E smoke` runs `node apps/scaffolder/dist/cli.js init ...`
  to assert the scaffolder's own output is buildable.
- `Example/ output stays in sync` re-scaffolds into a tempdir and diffs
  against the committed `example/` reference directory.

Both reference `apps/scaffolder/dist/cli.js` and `example/`, which exist
only in the meta-repo. A consumer repo produced by `mcp-scaffold init`
has neither — the scaffolder app is not shipped into its own output.

The other steps (lint, typecheck, build, test, test:no-native,
usage-drift, npm pack, stress, upload-stress-report) are all valid for
consumer repos and should be kept.

**Fix**: The phase 12-ci-release migration that emits
`.github/workflows/ci.yml` must emit a **trimmed** workflow for consumer
repos that omits the `Scaffolder E2E smoke` and `Example/ output stays
in sync` steps. Either ship two variants (`ci.meta.yml` for the
meta-repo, `ci.consumer.yml` for scaffolded output) and select based on
mode, or strip those two steps via a post-process in the migration's
`apply()`.

**Test to add**: scaffold a fresh repo and assert the generated
`.github/workflows/ci.yml` does NOT contain the strings
`Scaffolder E2E smoke` or `Example/ output stays in sync`, and DOES
contain `Stress harness`.

**Workaround applied downstream**: browser-tab-mcp commit `d86d75b`
manually deleted the two steps. CI went green on both matrix legs
(ubuntu + macos, Node 24) thereafter.

---

## Note on backport status

Both bugs were fixed locally in the `browser-tab-mcp` consumer repo
(private) and pushed; the fixes were NOT backported to the scaffolder.
Hence this appendix. A future agent working on the scaffolder should
apply the fixes at the source so the next `mcp-scaffold init` produces a
repo whose CI passes on the first push without manual intervention.
