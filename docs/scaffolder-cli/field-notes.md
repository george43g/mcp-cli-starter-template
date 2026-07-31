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
13. **`setup-node` with `registry-url` shadows npm OIDC trusted
    publishing.** It writes an `.npmrc` auth line resolving a placeholder
    `NODE_AUTH_TOKEN` (`XXXXX-…`); npm sends that bogus token and 401s
    instead of performing the OIDC exchange. For trusted publishing, omit
    `registry-url` entirely. (The semantic-release-monorepo `fail` step also
    crashes with a TypeError while reporting failures, masking the pretty
    error output — read the raw npm error above it.)
14. **Correction to #13: `@semantic-release/npm >= 12.0.2` does NOT detect
    OIDC on its own** — that was an unverified assumption that produced a
    second failed release run even after the `registry-url` fix, now
    failing cleanly with `ENONPMTOKEN` instead of a 401. Real OIDC
    trusted-publishing support (`lib/trusted-publishing/oidc-context.js`,
    calling `@actions/core`'s `getIDToken()` and exchanging it with npm's
    `-/npm/v1/oidc/token/exchange/package/<name>` endpoint) landed in
    `@semantic-release/npm` v13.1.0. `semantic-release` core still bundles
    `@semantic-release/npm: ^12.0.2` as its own dependency. Lesson: when a
    plugin "should" support a feature, read its actual installed source
    (`node_modules/.pnpm/…`) rather than trusting the version range a
    parent package happens to bundle.
15. **A devDependency pin does NOT override which plugin version
    `semantic-release` loads — only a pnpm `overrides` entry does.** The
    first attempt at fixing #14 added `@semantic-release/npm: ^13.1.5` as an
    explicit devDependency of `packages/robustness`; the next CI run still
    loaded v12.0.2 and failed the same way. Root cause: `.releaserc.json`
    plugin names resolve via Node module resolution from *inside*
    `semantic-release`'s own installed location, which walks up through
    `semantic-release`'s own nested `node_modules` and finds its own
    private `@semantic-release/npm@^12.0.2` dependency there — it never
    reaches the consuming package's `node_modules`, regardless of what that
    package explicitly declares. Fix: add
    `"pnpm": { "overrides": { "@semantic-release/npm": "^13.1.5" } }` to
    the root `package.json`, which pnpm applies to every resolution of that
    package in the graph, including nested/transitive ones. Verified via
    `readlink node_modules/.pnpm/semantic-release@*/node_modules/@semantic-release/npm`
    pointing at the 13.1.5 store entry before re-pushing.
16. **`readme-check.yml`'s `src/` regex false-positives on `lib/` mirror
    paths.** It matches `^(apps|packages)/[^/]+/src/`, which also matches
    `apps/scaffolder/src/phases/*/lib/**` — pure golden-output mirror
    content (enforced byte-identical by `tests/golden.test.ts`), not
    scaffolder implementation. Syncing a `docs/RELEASE.md` change into its
    lib mirror tripped the check even though the canonical `docs/RELEASE.md`
    path itself isn't under `apps|packages/*/src/` at all. Fixed by
    excluding `/lib/` paths from the src-changed count in both the PR and
    push variants of the check — any genuine change always touches the
    canonical path too, which still trips the check on its own. **This
    exclusion is meta-repo-only**: `readme-check.yml` is golden output, but
    a generated repo has no `lib/` mirrors and `src/lib/` is legitimate
    source there, so the fix does NOT ship downstream. The canonical file
    is added to `EXEMPT_LIB_PATHS` in `golden.test.ts` and the lib mirror
    keeps the standard check. (First round of this fix missed that the
    canonical edit was un-synced to the lib mirror, so it landed a
    golden-drift failure that only surfaced in CI's `pnpm verify` step —
    the local edit-then-`check:docs`-only loop never ran `golden.test.ts`.
    Lesson: after editing ANY file with a lib/ mirror or `example/`
    counterpart, run the scaffolder test suite, not just `check:docs`.)
17. **`release-packages.yml`'s `paths: ["packages/robustness/**"]` trigger
    missed the actual fix.** The pnpm-override fix for field-note #15 lives
    in the root `package.json`/`pnpm-lock.yaml`, not under
    `packages/robustness/**`, so the push didn't auto-trigger the release
    workflow — had to `gh workflow run release-packages.yml` manually.
    Worth considering whether the paths filter should also watch the root
    lockfile/package.json, at the cost of triggering on unrelated
    dependency bumps.
