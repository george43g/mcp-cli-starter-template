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
   - `apps/example-mcp/package.json` — the user-facing CLI / MCP / TUI bin (most common)
   - Any `packages/*` you want reused outside this repo (typically `robustness`, `mcp-kit`, etc.)
4. **Set the `name` field** on each publishable package to match your npm scope (the starter uses `@george43g/*`; rename if you're publishing to a different scope or unscoped).
5. **Push a commit with a conventional-commits prefix** (e.g. `feat: initial release`) — semantic-release will compute the first version and publish.

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

> This section describes the meta-repository's own upstream release process
> for `@george43g/robustness`. A freshly generated tool has no
> `release-packages.yml` and does not need this section — it only applies to
> maintainers of the template repository itself.

`@george43g/robustness` publishes via `.github/workflows/release-packages.yml`
on every push to `main` that touches `packages/robustness/**` (also
`workflow_dispatch`-able for a manual rerun). It runs the full verification
matrix — `pnpm verify`, `pnpm test:no-native`, `pnpm check:robustness-package`
(packs the tarball, installs it into a standalone Node 24 project, exercises
the public exports), and `pnpm stress` — before semantic-release touches the
registry. A red step blocks the release.

Publishing uses npm OIDC trusted publishing — there is **no `NPM_TOKEN`
secret**. The workflow requests `id-token: write` and npm exchanges that for
a short-lived publish token, provided the package's Trusted Publisher is
configured on npmjs.com (organization/user, repository, and workflow
filename must match exactly). `@semantic-release/npm` must be `>= 13.1.0` to
detect this OIDC context — `packages/robustness/package.json` pins an
explicit `^13.1.5` devDependency because `semantic-release` core still
bundles the OIDC-unaware `^12.0.2` as its own default.

The initial `0.1.0` publish was run manually from a maintainer's machine
(`pnpm --filter @george43g/robustness publish`) — OIDC trusted publishing
only takes effect for versions after the package already exists on the
registry.

The scaffolder must not default to registry mode until a clean external
`pnpm add @george43g/robustness@0.1.0` consumer passes.
