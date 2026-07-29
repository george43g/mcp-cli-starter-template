# Field notes — ideas and friction log

Observations from using the scaffolder and its tooling on real tasks. These
are ideas, not commitments; none is scheduled unless promoted into
[PROJECT_STATE.md](../PROJECT_STATE.md) deferred work or a plan under
[plans/](../plans/README.md).

## 2026-07-29 — applying usage(1) artifacts to a non-Node CLI (opkeep/life-stack)

1. **Gap: no standalone `cli-artifacts` migration.** The usage(1) pipeline
   (`.usage.kdl`, completions, manpage, markdown docs, freshness check) ships
   only inside `08-app/m1-app-port`, which ports an entire Node MCP app.
   "Add completions to an existing CLI" is served by the manual procedure in
   [skills/cli-artifacts/SKILL.md](../../skills/cli-artifacts/SKILL.md)
   ("Add the system to another CLI package"). Opportunity: extract a
   dedicated, parameterizable migration (bin name, target directory,
   command-tree source) so `mcp-scaffold migrate cli-artifacts` works against
   any repo. Would pair naturally with the planned `agent-harness` migration.
2. **A JS wrapper around shell tools is unnecessary.** usage(1) is
   language-agnostic: completions and manpages generate from `.usage.kdl`
   regardless of the tool's implementation language. The only Node dependency
   in the starter's pipeline is `scripts/check-usage-freshness.mjs`.
   Opportunity: offer a POSIX-shell freshness check (or make it optional) so
   pure-shell repos need no Node at all. usage(1) also supports embedding the
   spec directly in shell-script comments — worth evaluating as an
   alternative to a separate `.usage.kdl` for single-file tools.
3. **Migration granularity.** `migrate <id>` targets are phase-sized
   (`08-app/m1-app-port` = the whole app). Finer-grained ids would make
   retrofit adoption cheaper; today the workaround is skills + manual edits.
4. **Alias binaries and completions.** opkeep answers to two names
   (`bin/opkeep` and `bin/secret` both symlink to `apps/opkeep/bin/secret`).
   A `.usage.kdl` targets one `bin` name, and generated completions register
   per-name. Multi-name tools need either two generated artifact sets or a
   shell-level alias/compdef bridge — the starter has no convention for this
   yet.
5. **Minor: `pnpm start -- list` rebuilds templates every invocation**
   (`build:templates` runs before tsx). Correct but adds startup latency to
   read-only commands like `list`; a staleness check could skip the rebuild.

## 2026-07-29 — building 08-app/m2-cli-artifacts (the standalone migration)

6. **Prompting config leaves hang sweep runs.** A migration whose `apply()`
   reads an un-preset promptable leaf stalls non-interactive `apply` flows
   (caught only by the 5s test timeout in `program.test.ts`). Resolved with
   an explicit-only `shouldRun` (`ctx.explicitMigration`). Opportunity: a
   convention (or test helper) asserting that non-explicit migrations never
   reach `ask()` — timeouts are a poor detector.
7. **`Migration.commanderOptions?()` is declared but never implemented or
   consumed.** Real flag wiring is centralized in `addCommonFlags` +
   `applyCmdOptsToConfig`. Either wire the hook into `buildProgram()` or
   delete it — a declared-but-dead extension point misleads migration
   authors.
8. **`TEMPLATES[key]` is `string | undefined`** under
   `noUncheckedIndexedAccess`, so each direct consumer needs a guard. A
   shared `requireTemplate(key)` in `core/` would centralize the "run
   build:templates" remediation message (m2 carries a local copy).
9. **The scaffolder's `.usage.kdl` duplicates the shared flag block four
   times** (init/apply/plan/migrate). Adding one flag means four identical
   KDL edits; usage(1) KDL has no include/mixin mechanism we're using.
   Opportunity: generate the spec's shared-flag blocks from
   `addCommonFlags`, which is deferred item 5 (Commander→usage integration)
   in PROJECT_STATE.md.

## 2026-07-29 — first npm publish (robustness)

10. **`publishConfig.provenance: true` blocks local publishes and env
    overrides don't win.** `NPM_CONFIG_PROVENANCE=false pnpm publish` still
    fails with "Automatic provenance generation not supported for provider:
    null" — the manifest value takes precedence. Fix: keep provenance OUT of
    `publishConfig` and pass `--provenance` explicitly in the CI workflow,
    where OIDC makes it valid. Also: npm's web-based publish auth makes
    `npm publish` interactive (browser roundtrip), so agent-driven publishes
    need the user's terminal regardless of login state — a non-TTY session
    fails with EOTP instead of waiting for the browser.
11. **semantic-release 24 + semantic-release-monorepo 8 work together**, and
    `GITHUB_TOKEN=$(gh auth token) … semantic-release --dry-run` is a cheap
    full-pipeline validation (all verifyConditions + commit filtering) with
    zero side effects. Tag the already-published version first
    (`robustness-v0.1.0`) or semantic-release starts the package at 1.0.0.
    Loop prevention matters twice: `[skip ci]` in the release commit AND the
    workflow's `paths:` filter would otherwise re-trigger on the version
    bump commit.
12. **GitHub honors `[skip ci]` anywhere in the commit message, including
    the body.** A commit whose body merely *described* the release commit's
    skip marker silently skipped every workflow on that push. Never write
    the literal marker in a commit message; say "skip-ci marker" instead.
