# Release flow

> This document describes release infrastructure copied into generated tools.
> The meta-repository's reusable package workflow is separate; see
> [Reusable package release](#reusable-package-release).

`release.yml` ships disabled. Enabling it is a deliberate, per-tool decision — not every tool cloned from this template will publish to npm.

## When to enable

Enable when:

- The tool is open-source AND
- You want versioned, semantic-release-driven npm publishes on every push to main

Don't enable when:

- The tool is private and you distribute it via internal mechanisms (GitHub Packages with auth, internal registry, container image)
- You're not ready to commit to SemVer (semantic-release derives the version from your commit messages — `fix:` = patch, `feat:` = minor, `BREAKING CHANGE:` footer = major)

## How to enable

The shipped workflow has a single trigger — `workflow_dispatch:` — so it never runs automatically; you can also fire it ad-hoc from the Actions tab to test the pipeline. To run it on every push to main:

1. **Uncomment the `push:` trigger** in `.github/workflows/release.yml`:
   ```yaml
   on:
     workflow_dispatch:
     push:
       branches: [main]
   ```
2. **Add the `NPM_TOKEN` secret** to the repo (Settings → Secrets and variables → Actions). Generate it on npmjs.com with the `Automation` token type and publish scope for your packages.
3. **Decide which packages to publish.** The starter ships `"private": true` on every workspace package. Set `"private": false` on the packages you want to publish:
   - `apps/example-repo-mcp/package.json` — the user-facing CLI / MCP / TUI bin (most common)
   - Any `packages/*` you want reused outside this repo (typically `robustness`, `mcp-kit`, etc.)
4. **Set the `name` field** on each publishable package to match your npm scope (the starter uses `@george43g/*`; rename if you're publishing to a different scope or unscoped).
5. **Push a commit with a conventional-commits prefix** (e.g. `feat: initial release`) — semantic-release will compute the first version and publish.

> **pnpm `workspace:*` caveat.** `@semantic-release/npm` runs plain `npm`
> (`npm version`, `npm publish`) under the hood, and plain npm cannot resolve
> pnpm's `workspace:*` protocol — it fails with
> `EUNSUPPORTEDPROTOCOL: Unsupported URL Type "workspace:"`. Publish only
> **leaf** packages that have no `workspace:*` dependencies, or replace those
> specifiers with real version ranges before publishing (pnpm rewrites them at
> `pnpm publish` time, but `@semantic-release/npm` does not). This is why the
> root `package.json` carries no npm `workspaces` field — pnpm uses
> `pnpm-workspace.yaml` instead, and the npm field would make even
> single-package `npm version` traverse and choke on sibling `workspace:*` deps.

## Conventional-commits cheat sheet

| Prefix | Version bump |
|--------|--------------|
| `fix:` | patch (0.0.x) |
| `feat:` | minor (0.x.0) |
| `feat!:` or footer `BREAKING CHANGE:` | major (x.0.0) |
| `chore:` / `docs:` / `style:` / `refactor:` / `test:` / `ci:` | no release |

`semantic-release` will skip the release if no commit since the last tag triggered a bump.

## Plugin chain

`.releaserc.json`:

1. `@semantic-release/commit-analyzer` — reads commit messages.
2. `@semantic-release/release-notes-generator` — builds the changelog body.
3. `@semantic-release/changelog` — writes the body to `CHANGELOG.md` (Keep-a-Changelog format).
4. `@semantic-release/npm` — `npm publish` with `tarballDir: release`.
5. `@semantic-release/github` — creates the GitHub release with the tarball attached.
6. `@semantic-release/git` — commits the bumped `package.json` + `CHANGELOG.md` with `[skip ci]` so CI doesn't loop.

## Disabling for a specific tool

If you cloned this template and decided NOT to release:

1. Delete `.github/workflows/release.yml` (or leave it disabled — `workflow_dispatch:` is the only trigger, so it never fires automatically).
2. Delete `.releaserc.json`.
3. Remove `semantic-release`-related entries from any package.json scripts.

## Monorepo multi-package release (advanced)

Semantic-release in its default config publishes one root package. If you need to release multiple packages independently:

- Use `semantic-release-monorepo` or move to `changesets` (the latter is better for monorepos but requires more manual orchestration).
- The starter's `.releaserc.json` is single-package by design. Don't over-engineer the release process until you actually have multiple consumers.

## Reusable package release

> This section describes the meta-repository's own upstream release process.
> A freshly generated tool has no `release-packages.yml` and does not need this
> section — it only applies to maintainers of the template repository itself.

Published packages: `@george43g/robustness`, `@george43g/cli-kit`,
`@george43g/tui-kit`, `@george43g/secret-store`, and `@george43g/mcp-kit` (the
last still `workflow_dispatch`-only, pending its one-time bootstrap publish —
semantic-release's first release for a package is 1.0.0, not the manifest's
version, which is why the gate is not cosmetic).

`@george43g/mcpsync` was on this list until 2026-08-22. It migrated to
`life-stack/apps/mcpsync` **without publishing** (DEFERRED #10), and was never
on npm at any point.

They publish via `.github/workflows/release-packages.yml` on every push to
`main` touching one of their directories (also `workflow_dispatch`-able for a
manual rerun). Each package gets its own job, and the jobs are **chained with
`needs` rather than parallel**: every semantic-release run pushes a version-bump
commit to `main`, and concurrent pushes race. Each job runs the verification
matrix — `pnpm verify` (which includes `pnpm check:publishable-manifests`),
plus `pnpm test:no-native`, `pnpm check:robustness-package`, and `pnpm stress`
for robustness, or a `pack:check` for the others — before semantic-release
touches the registry. A red step blocks the release.

### What is never published

Shared-tool-config packages — `tsconfig`, `vitest-config`, `biome-config` — are
**not dependencies**. They are per-monorepo config meant to be customised for the
repo they live in, so they stay `private: true` and are never released. A package
that relocates to another monorepo depends on *that* repo's equivalent (creating
one if it is missing); it never carries these with it.

That is why `packages/cli-kit` and `packages/tui-kit` simply dropped their
`@george43g/tsconfig` / `@george43g/vitest-config` devDependencies when they were
made publishable, following `packages/robustness`, which resolves both through the
root workspace hoist.

### Commit rules: how a message becomes a version

The root `AGENTS.md` states each rule in a line. This is why each one exists.

- **A commit's type is read against every published package whose directory
  it touches.** `semantic-release-monorepo` filters commits by path and ignores
  the scope in the subject. So a `feat(vitest-config): …` commit that edits
  `packages/robustness/vitest.config.ts` counts as a `feat` for **robustness**,
  and that is how `robustness@0.3.0` came to be published by a coverage-config
  change. Use `chore:`/`test:`/`docs:` for anything inside
  `packages/{robustness,cli-kit,tui-kit,secret-store}/` that does not change the
  package's published behaviour. The workflow's `paths` also exclude test and
  tooling files, as a second safeguard.
- **A commit's type is read against its whole diff, not its headline.** The
  rule above catches a commit scoped too narrowly; this one catches the
  opposite case. `fix(cli-kit): drain piped REPL input` also added
  `formatResult`, `showMeta`, and the `json`/`last-error` built-ins, and they
  shipped in `cli-kit@0.3.1` as a patch. Nothing broke, because the additions
  are optional, but the version understated the change. There is no honest way
  to correct that afterwards short of an empty `feat` commit.
- **A breaking marker on a 0.x package publishes 1.0.0, not the next minor.**
  `@semantic-release/commit-analyzer` has no `releaseRules` override here, and
  its default maps any breaking change to a **major**. Unlike some tools, it
  does not hold a `0.x` package at `0.x`. `feat(cli-kit)!:` with the breaking
  footer was planned as `0.4.0` and published as **`cli-kit@1.0.0`**, which is
  immutable. This is kept on purpose (DEFERRED #34): staying on 0.x adds no
  protection, because `^1.x` does not cross a major either. All 0.x buys is
  blocking *additive* minors, which consumers want to receive automatically.
- **Never spell a release-control token in commit prose.** `semantic-release`
  finds the breaking-change footer token ANYWHERE in a commit body, including
  inside a sentence describing a past incident. A `docs:` commit whose body
  explained the previous mishap published `cli-kit@2.0.0`, a major whose
  `dist/` was byte-identical to `1.0.0`. That was two unplanned majors in one
  session, both caused by message text (DEFERRED #35). `pnpm test:scripts` and
  the `release-tokens` job now reject the token unless the subject also
  carries `!`. To write about it, use lowercase prose and do not spell the
  literal. The job catches spurious majors, **not** a breaking change
  published as a minor (DEFERRED #37). [CHECKS.md](CHECKS.md#ci-workflows)
  explains why it runs in two workflows.
- **Rendered output is not covered by semver.** A patch that improves a
  rendering breaks any consumer that snapshots stdout: no API change, no type
  error, nothing thrown. `cli-kit@2.0.1` broke 8 of one consumer's 12 snapshot
  tests. When changing what a kit prints, say so in its README. cli-kit's
  standing promise is that *results and meta footers are stable; chrome is
  not*.

### Adding a package to the pipeline

The order is forced by npm: a Trusted Publisher can only be configured for a
package that already exists.

1. Make the manifest publish-shaped — `version`, `publishConfig.access`,
   `engines.node`, `repository` (`url` **case-exact**, plus `directory`),
   `files` including `README.md` and `LICENSE`. `pnpm check:publishable-manifests`
   enforces all of it; register the new directory in that script's `PUBLISHABLE`
   set.
2. Add a `.releaserc.json` with `extends: "semantic-release-monorepo"` and a
   package-specific `tagFormat`, plus the semantic-release devDependencies.
3. Bootstrap manually: `pnpm --filter <pkg> publish` (use `pnpm`, not `npm` —
   only pnpm rewrites the `workspace:` protocol), then **tag the published
   version** or semantic-release will start the next release at `1.0.0`.
4. Add the Trusted Publisher on npmjs.com (user `george43g`, repo
   `mcp-cli-starter-template`, workflow `release-packages.yml`, no environment).
5. Add a job to `release-packages.yml` chained onto the previous one, and add
   the package directory to the workflow's push `paths:`.

### Build provenance — ON, and coupled to repo visibility

`NPM_CONFIG_PROVENANCE: "true"` is set on each release step's `env` in
`release-packages.yml`, enabled 2026-08-21 when this repo was made public.

**It is not a best-effort flag.** Both of its preconditions are enforced
registry-side as `422 Unprocessable Entity`, which fails the publish outright
rather than degrading:

1. **The source repo must be public.** npm dropped provenance for private
   source repositories in 2023. **If this repo is ever made private again, the
   five `NPM_CONFIG_PROVENANCE` lines have to come out in the same change**, or
   the next release dies at the publish step.
2. **`repository.url` must match the signing certificate's Source Repository
   URI case-sensitively.** All five manifests were checked against the live
   repo on enabling, and `scripts/check-publishable-manifests.mjs` asserts the
   exact string on every CI run, so this half is mechanically held.
   `repository.directory` is *not* part of that validation — it is monorepo
   hygiene only.

Never put `provenance` in `publishConfig`. That fires on a local
`pnpm publish` too, which has no OIDC provider and fails — and a local publish
is exactly how a new package gets bootstrapped here (step 3 above).

Publishing uses npm OIDC trusted publishing — there is **no `NPM_TOKEN`
secret**. The workflow requests `id-token: write` and npm exchanges that for
a short-lived publish token, provided the package's Trusted Publisher is
configured on npmjs.com (organization/user, repository, and workflow
filename must match exactly). `@semantic-release/npm` must be `>= 13.1.0` to
detect this OIDC context, but `semantic-release` loads that plugin from
inside its own `node_modules`, where it finds the OIDC-unaware `^12.0.2`
copy it bundles as a default dependency — a plain devDependency in the
consuming package cannot override that nested resolution. The root
`package.json` therefore forces the version graph-wide with a
`pnpm.overrides` entry (`"@semantic-release/npm": "^13.1.5"`), which pnpm
applies to the nested copy too.

The initial `0.1.0` publish was run manually from a maintainer's machine
(`pnpm --filter @george43g/robustness publish`) — OIDC trusted publishing
only takes effect for versions after the package already exists on the
registry.

The scaffolder must not default to registry mode until a clean external
`pnpm add @george43g/robustness@0.1.0` consumer passes.
