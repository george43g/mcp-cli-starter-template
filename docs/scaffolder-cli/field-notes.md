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
18. **An npm-style `"workspaces"` field in a pnpm monorepo's root
    `package.json` breaks `@semantic-release/npm`.** With OIDC finally
    working, the release advanced to `@semantic-release/npm`'s `prepare`
    step, which runs `npm version <next>` in the package dir. Plain npm
    walks up to the root, sees the `workspaces` field, treats the repo as
    an npm workspace, and tries to parse every member — several of which
    use pnpm's `workspace:*` protocol — failing with
    `EUNSUPPORTEDPROTOCOL: Unsupported URL Type "workspace:"`. `robustness`
    itself has zero deps, so the field was the sole trigger. Fix: remove the
    `workspaces` field from the root `package.json` — pnpm's workspace
    source is `pnpm-workspace.yaml`, so the npm field is vestigial (nothing
    in the repo reads it; turbo detects pnpm workspaces on its own).
    Verified locally: `npm version` succeeds with the field gone, and pnpm
    still resolves all 14 workspaces on a frozen install. The generator
    (`01-bootstrap/m4-monorepo.ts`) emitted the same field into every
    scaffolded repo, so it was removed there too (plus the two retrofit
    prompts that told users to add it).
    - **Residual, deferred:** the *generated* repo's disabled-by-default
      `release.yml` publishes the root package via `@semantic-release/npm`,
      and the generated root `package.json` legitimately carries
      `workspace:*` devDeps (e.g. `@george43g/tsconfig`). Removing the
      `workspaces` field does NOT fix that path — plain npm still can't
      resolve a `workspace:*` in the published package's own manifest. A
      generated repo that enables npm publishing must publish only leaf
      packages free of `workspace:*` deps, or adopt a pnpm-aware publish
      flow. Documented as a caveat in the generated `docs/RELEASE.md`; a
      full pnpm-aware generated release pipeline is out of scope here.
19. **Trusted publishing does NOT emit build provenance on its own.**
    `@semantic-release/npm` v13's README says provenance is "automatically
    generated" under trusted publishing, and the workflow comment repeated
    that — but the published `0.1.1` came back with only npm's registry
    `dist.signatures` (present on every publish) and no `dist.attestations`
    (the provenance/SLSA bundle). `@semantic-release/npm` runs `npm publish`
    without `--provenance`, and npm did not auto-enable it. Fix: set
    `NPM_CONFIG_PROVENANCE=true` in the release step's `env` (equivalent to
    `npm publish --provenance`; `id-token: write` already supplies the OIDC
    token npm needs to attest). Deliberately NOT `publishConfig.provenance`
    in the package — that also fires on local `pnpm publish`, which has no CI
    OIDC provider and fails with "provenance generation not supported for
    provider: null" (the field-note 10 footgun). Takes effect on the next
    release; `0.1.1` itself stays provenance-less (a re-publish of an
    identical version isn't possible, and a churn bump purely to attach
    provenance wasn't warranted).

    **SUPERSEDED 2026-08-08 — this "fix" was a latent release-breaker.** See
    field-note 23: provenance is unavailable from a private source repo, and
    requesting it fails the publish outright instead of degrading. The setting
    was removed before it ever ran.

## 2026-08-01 — propagating the harness layer into generated repos

20. **Shipping new files into a generated repo is nearly free; the golden test
    is the only surface that needs thought.** `10-docs-readme/m1` ports its
    whole `lib/` subtree via `portPackage({ pkgDir: ".", libPrefix:
    "10-docs-readme/lib/" })`, which iterates *all* `TEMPLATES` keys under the
    prefix — and `build-templates.mjs` walks `lib/**` with no extension filter —
    so a new `.md`/`.mjs` dropped under `lib/` is emitted at its mirrored path
    with zero migration-code change (even into a net-new repo-root `scripts/`
    dir, which generated repos didn't have before). What DOES need attention:
    `golden.test.ts` byte-compares `lib/docs/**` against the meta repo's own
    `docs/**`. Since the generated docs index / PROJECT_STATE / plans convention
    are deliberately *different* from this repo's live versions, they must be
    exempted — and because the test **checks `EXEMPT_LIB_PATHS` before the
    `LIB_TO_CANONICAL` lookup**, an exemption alone suffices: template-only
    files with no canonical twin (e.g. `HANDOFF.md`,
    `scripts/check-docs-links.mjs`) need only an exempt entry, not a mapping.
    Lib↔example drift stays caught by the separate example/ sync check, so
    exempting from the golden test loses no coverage.
21. **The docs guardrail genericizes by changing three constants only.** The meta
    `scripts/check-docs-links.mjs` hardcodes `apps/scaffolder/*` scan roots, a
    scaffolder-only `CLAUDE.md` symlink pair, and `example`/`lib` dir exclusions
    — all meaningless (the symlink pair actively wrong) downstream. The generated
    copy drops those and keeps the three checks (links, symlinks, index
    coverage), `stripCode`, and the `resolve(import.meta.dirname, "..")` anchor
    verbatim. The coverage check filters `.endsWith(".md")`, so the top-level
    `.mdx` Mintlify pages need no index rows (the meta repo already passes with
    the same shape). Adding the check to generated CI means the meta repo's own
    "scaffolder E2E smoke" step (`pnpm verify` inside a fresh scaffold) now
    exercises it — a broken relative link in any shipped generated doc/skill
    fails the meta build, which is the guardrail working as intended.
22. **"Inherit the full system" meant authored onboarding, not stubs.** The user
    wanted the generated `PROJECT_STATE.md`/`HANDOFF.md` custom-written to kick
    off a project and self-referentially explain where/why it is — so they're
    real narratives for the just-scaffolded moment (four surfaces wired, ships
    green, next steps), not empty skeletons. m4's *retrofit* prose was left
    without `check:docs` on purpose: that prompt scopes to the monorepo skeleton
    and doesn't create the script, so referencing it there would be broken
    guidance (existing-repo retrofits that run phase 10 do get the harness but
    keep their own pre-existing `verify` — a separate, deferred retrofit gap).

## 2026-08-08 — publishing the kits (cli-kit + tui-kit)

23. **npm provenance needs a PUBLIC source repo, and it fails loudly.** Two
    independent gates, both enforced registry-side as
    `422 Unprocessable Entity` — not a silent skip, so the publish dies:
    (a) GitHub dropped provenance from private source repositories in 2023, and
    `mcp-cli-starter-template` is private; (b) the registry compares
    `package.json`'s `repository.url` against the signing certificate's Source
    Repository URI **case-sensitively** — a missing field or a casing mismatch
    (`frontenddev-org` vs `FrontEndDev-org`, npm/cli#8036) is the single most
    common failure. `repository.directory` is *not* part of that validation; it
    is monorepo hygiene only. So field-note 19's `NPM_CONFIG_PROVENANCE=true`
    would have broken the next robustness release on both counts. It was
    removed; packages keep npm's registry signature. Re-enable only if the repo
    goes public. Trusted publishing (OIDC) itself is unaffected by repo
    visibility — `0.1.1` published fine from this private repo.
24. **`npm publish` does not rewrite the `workspace:` protocol — only pnpm
    does.** `pnpm pack`/`pnpm publish` run `createExportableManifest()`, which
    substitutes real versions; plain `npm publish` ships the literal string and
    consumers get `EUNSUPPORTEDPROTOCOL`. This matters because
    `@semantic-release/npm` shells out to `npm publish`, so the CI path is the
    unsafe one while the local bootstrap path is safe. Rule enforced by
    `scripts/check-publishable-manifests.mjs`: no `workspace:` in a publishable
    package's `dependencies`/`peerDependencies`. `devDependencies` are exempt —
    consumers never install them. The rewrite table also bites: `workspace:*`
    becomes an **exact pin**, `workspace:^` a caret range.
25. **`link-workspace-packages` is off, so a published range and a `workspace:*`
    range are DIFFERENT INSTANCES of the same package.** Verified in the tree:
    `apps/mcpsync`'s `"@george43g/robustness": "^0.1.1"` resolves into
    `node_modules/.pnpm/@george43g+robustness@0.1.1/`, while every `workspace:*`
    dep symlinks to `packages/`. That is fine across processes and fatal within
    one: had `tui-kit` taken a literal range, `apps/example-repo-mcp` would hold
    two robustness copies and `FullScreenInk`'s `registerCleanup` would register
    into a shutdown registry nobody drains — silently. The fix generalizes:
    **a shared-singleton runtime belongs in `peerDependencies`** (range for
    consumers) **plus a `workspace:*` devDependency** (one instance locally).
    Same reasoning moved `react`/`ink` out of `tui-kit`'s `dependencies`.
26. **pnpm 10.29.3's `publish` delegates to the host `npm`.** It packs to a temp
    dir then spawns `npm publish <tarball>` with the environment intact, so OIDC
    and `NPM_CONFIG_*` pass straight through and the host npm must be >= 11.5.1
    (Node 24 bundles it). That makes `pnpm publish` a valid release path if the
    workspace-protocol rewrite is ever needed in CI — wire it as
    `@semantic-release/npm` with `npmPublish: false` plus `@semantic-release/exec`
    running `pnpm publish --no-git-checks`. pnpm 11 replaces the delegation with
    native `libnpmpublish`, so re-verify OIDC before upgrading.
27. **A new scoped package still needs a manual bootstrap publish.** Trusted
    publishing can only be configured for a package that already exists
    (npm/cli#8544 is open), so each new package is: `pnpm publish` locally →
    add the Trusted Publisher on npmjs.com → CI takes over. Then **tag the
    bootstrapped version** (`cli-kit-v0.1.0`), or semantic-release finds no
    prior tag and starts the next release at `1.0.0` (field-note 11).
    `publishConfig.access: "public"` makes `--access public` unnecessary and
    survives pnpm's pack.
28. **A 0-second CI run with "This run likely failed because of a workflow file
    issue" and `log not found` means the YAML did not parse** — no job ever
    started, so there is nothing to read. `gh run view --log-failed` is useless
    here; `gh run list` showing `failure … 0s` is the tell. The cause this time
    was a step `name:` containing a colon-space:
    `- name: Publish shape (repository metadata, no workspace: in published deps)`.
    YAML reads `: ` inside an unquoted scalar as a nested mapping and rejects it
    ("Nested mappings are not allowed in compact mappings"). Quote the value or
    drop the colon. Nothing in-repo parses workflow YAML — `pnpm verify` cannot
    catch this and neither can Biome — so a workflow edit is only validated by
    pushing it. If this recurs, the fix is a `scripts/check-workflows.mjs`; it
    needs a YAML parser dependency, which the repo does not currently carry, so
    it was judged not yet worth it for a failure CI reports in 15 seconds.
29. **The golden drift test was cacheable on inputs it doesn't actually read —
    so `pnpm verify` could go green on a tree CI rejects.** turbo's `test` task
    declared `inputs: ["src/**", "tests/**", "vitest.config.ts"]`, all
    package-relative, but `tests/golden.test.ts` reads across the entire repo
    (`docs/**`, `packages/*/src/**`, `apps/example-repo-mcp/**`, root
    `AGENTS.md`, `.github/**`) — that is its whole job. Editing a canonical file
    with a `lib/` mirror therefore did not invalidate the scaffolder's test
    cache, and turbo replayed a stale PASS locally while CI (cold cache) failed
    on real drift. Fixed with `apps/scaffolder/turbo.json` (`extends: ["//"]`)
    declaring the canonical roots via `$TURBO_ROOT$`. Verified by touching
    `docs/ARCHITECTURE.md` and watching the task flip from "cache hit, replaying
    logs" to "cache miss, executing". General lesson: **a test that reads
    outside its package must declare those paths as inputs, or caching makes it
    a liar** — and the cross-surface consistency tests are exactly the ones that
    do this.
30. **`docs/RELEASE.md` and `docs/SHARED_RUNTIME.md` have `lib/` mirrors; most
    of `docs/` does.** `LIB_TO_CANONICAL` maps the whole directory
    (`10-docs-readme/lib/docs` → `docs`), so any canonical doc with a lib twin
    must be synced in the same change. Package *manifests* are the opposite —
    `packages/cli-kit/package.json` has no mirror (generated manifests are
    inline `PKG_JSON` templates in `m3-cli-kit.ts`/`m4-tui-kit.ts`), so those
    diverge freely. Checking "is this file mirrored?" is per-file, not
    per-directory-intuition. `RELEASE.md` was exempted rather than synced: its
    new content is a runbook for this repo's own npm pipeline and is wrong
    guidance downstream.
31. **npm 2FA blocks agent-driven publishing at three separate points, and the
    `!`-prefix shell does not help.** With 2FA-on-publish enabled: `pnpm/npm
    publish` needs a browser roundtrip (already field-note 10), `npm trust`
    needs one too (it is an account change), and running either through Claude
    Code's `!` prefix fails the same way — that shell is not an interactive TTY,
    so npm prints the auth URL and exits rather than waiting. Relaying a TOTP
    code through the conversation and passing `--otp=` loses the race more often
    than not: codes rotate every 30s and the round-trip usually eats the window.
    The only reliable route is the user running the whole chain in a real
    terminal. Chain the publishes and the `npm trust github` calls with `&&` in
    ONE block — npm caches the authorization for a few minutes, so a single
    browser roundtrip covers all of them.
32. **`npm trust github` on an already-configured package returns `E409
    Conflict`** — that is "a trust config already exists", not a failure. Read
    the current state with `npm trust list <pkg>` (which, unlike the write, is
    satisfied by the cached session). Its `--file` argument is the workflow
    *filename* only (`release-packages.yml`), not a path.
33. **A freshly published scoped package 404s on the read path for a while.**
    `npm view`, and even an unauthenticated cache-busted GET of the packument,
    return `Not found` for a minute or more after `+ <pkg>@<version>` is
    printed. Do not read that as a failed publish: `npm trust list <pkg>`
    succeeding is proof the package exists registry-side, since trust config
    requires it. Just wait for the read path to catch up before verifying.
34. **Re-running an older release run is a silent no-op, and the commit subject
    decides the version even when the change is metadata.** Two lessons from the
    same run. (a) `gh run rerun <id>` keeps the original triggering SHA, so if
    `main` has moved, semantic-release logs "The local branch main is behind the
    remote one, therefore a new version won't be published" and exits 0 — a
    GREEN run that released nothing. Fixed by giving the robustness job the same
    `ref: main` checkout the other jobs already had; re-running a push run is
    otherwise the right way to retrigger, since `workflow_dispatch` would also
    un-skip the deliberately-deferred mcpsync job. (b) The robustness metadata
    fix was supposed to be `fix(robustness):` → 0.1.2, but it was bundled into a
    `feat(packages):` commit, so commit-analyzer computed **0.2.0**. That is not
    cosmetic: `tui-kit@0.1.0` declares peer `@george43g/robustness: ^0.1.1`, and
    a caret on a 0.x release pins the MINOR — `^0.1.1` means `>=0.1.1 <0.2.0`,
    so 0.2.0 falls outside its own consumer's range and yields ERESOLVE. Fixed
    by widening the peer to `^0.1.1 || ^0.2.0`. In a 0.x monorepo, check what a
    bump does to sibling peer ranges before letting it out.
35. **The three status blocks disagreed with each other and with reality.**
    `HANDOFF.md`, `docs/PROJECT_STATE.md`, `DEFERRED.md` and `README.md` each
    carried counts (migrations, template entries, scaffolder tests, stress
    assertions) and none matched: template entries were logged as 172 / 177 /
    154 against a measured 237; `DEFERRED.md`'s snapshot said "Last reviewed:
    2026-05-26" on a file whose items were dated 2026-08-08. Hand-maintained
    metrics in prose rot silently and then get quoted as fact. Either generate
    them or keep them in exactly one place — `DEFERRED.md`'s snapshot is now the
    single measured block, and the others should defer to it.
36. **A guardrail only guards what it was told to check.**
    `check-publishable-manifests.mjs` was written to reject `workspace:` in
    shipped deps, and it did — so field-note 34's peer-range bug recurred
    *immediately afterwards* in `apps/mcpsync`, which pinned
    `@george43g/robustness: "^0.1.1"` while robustness shipped 0.2.0. The
    original fix widened `tui-kit` and missed the sibling. Added a
    sibling-range invariant: every workspace dependency on a package we publish
    must admit that package's current version. Note it compares against the
    LOCAL manifest version, so it only fires once CI's release bump commits are
    pulled — a stale checkout reports a false pass.
37. **`pnpm verify` passing locally does NOT mean CI will install.** CI runs
    `pnpm install --frozen-lockfile`; a local `pnpm install` is not frozen and
    will happily reconcile a drifted lockfile in place. So editing any
    dependency specifier and then running the full local verify reports green
    while CI dies in ~20s with `ERR_PNPM_OUTDATED_LOCKFILE`. This is the same
    shape as field-note 29 (turbo replaying a stale cached pass): the local
    signal is weaker than the CI signal in a way that is invisible unless you
    know to look. After ANY manifest edit, run
    `pnpm install --lockfile-only && pnpm install --frozen-lockfile` before
    pushing — the second command is the one that actually mirrors CI.

## 2026-08-09 — fixing the robustness singletons (DEFERRED #14)

38. **A lazily-built singleton that takes options is a bug waiting to happen,
    and "replace it" is the wrong fix.** Both P0s in `robustness@0.2.0` were the
    same shape: `installShutdownHandlers(opts)` disposed and rebuilt its
    controller (new empty cleanup registry), while `installWatchdog(opts)` let
    whichever lazy caller ran first win and dropped later options. The tell in
    the first case is that the trigger was `Object.keys(options).length > 0` —
    *"did you pass an object"*, not *"did anything change"* — so passing the
    semantic default was destructive. **`dispose()` was never the problem;
    discarding the closure was.** The fix is `reconfigure()` that merges over the
    live config, keeping the registry, subscriber set and accumulated state, and
    reusing `dispose()` only for the one change that genuinely requires
    detaching (relocating listeners onto a replacement host process). Two
    corollaries worth stealing: validate the merged config *before* mutating
    anything, so a bad option cannot leave a half-applied controller; and when
    re-arming interval timers, reset any "elapsed since last tick" state — the
    watchdog's sleep-skew guard would otherwise discard the first sample after
    the interval shortened.

39. **The bugs survived because the convenience layer had zero tests.** Every
    existing robustness test exercised the `create*` factory, never the exported
    singleton wrappers — and the singleton wrappers were where all the state
    management lived. Test-to-export coverage said 21/40 and the missing 19 were
    not random. When a package has both a factory API and a convenience API over
    a module-level instance, the convenience API is the higher-risk surface, not
    the lower one. Guard rule applied here: write the failing test first, and
    confirm a targeted mutation (disabling the timer re-arm) fails exactly one
    assertion — otherwise the test proves nothing.

## 2026-08-09 — bootstrapping a fifth published package (secret-store)

40. **A brand-new npm package 404s for ~3–5 minutes after a successful publish,
    and the usual "is it live?" probes lie in both directions.** After
    `pnpm publish` printed `+ @george43g/secret-store@0.1.0`, the packument
    (`GET /@scope%2fname`) returned 404 for 210 seconds — so `npm view`,
    `npm owner ls`, and `npm install` all failed, in a clean scratch dir, with a
    hard 404. The cause is in the response headers: npm sits behind Cloudflare
    with `cache-control: public, max-age=300`, so the *negative* response
    produced by the first probe after publishing is edge-cached for five
    minutes. Appending a cache-buster query returns 200 immediately.

    What misleads: `npm access get status <pkg>` returned `public` and
    `npm trust list <pkg>` resolved the package the whole time — those hit
    different services that were never negative-cached. So "the access API sees
    it" is NOT evidence the package is installable. Neither is a 200 on the
    tarball URL (`/-/name-version.tgz`), which is served from a different path
    and was live from the start; the tarball downloaded and unpacked correctly
    while `npm install` of the same version still 404'd.

    The only probe that means anything is `npm install <pkg>@<version>` in a
    directory outside the workspace. Run it, and if it 404s within ~5 minutes of
    the publish, wait rather than diagnose — re-publishing the same version is
    forbidden anyway, and burning a version number on a caching artefact is the
    expensive mistake here. Same shape as field-notes 29/34/37: a green signal
    from something that never observed the thing it appears to certify.

41. **`npm trust` replaces the manual npmjs.com Trusted Publisher step.**
    `npm trust github <pkg> --file release-packages.yml --repo <owner>/<repo>
    --allow-publish --allow-stage-publish` configures it from the CLI, and
    `npm trust list <pkg>` verifies the result. Confirm against an already-
    working package first — `npm trust list @george43g/robustness` prints the
    exact shape to replicate, which is how the `--allow-stage-publish`
    permission was caught (the runbook only mentioned publish). `--dry-run`
    prints the full config without writing it. `docs/RELEASE.md`'s "add the
    Trusted Publisher on npmjs.com" step is now a CLI call, not a browser trip.
