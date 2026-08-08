# ExecPlan: build identity for the starter template

**Status**: planned, not started. Design settled by an external brief (2026-08-09),
verified against this repo and corrected where it differed — see Corrections.

**Goal**: make every build self-identifying, so "is the artifact running the one I just
built?" is a fact rather than a guess. Semver only moves on release, so every build
between two releases is currently indistinguishable.

## Why this is not a published package

Vite's `define` is compile-time textual substitution applied only to modules Vite
bundles. A module marked `external` never passes through it. So a `buildStamp()`
exported from `@george43g/robustness` would reference a `__BUILD_STAMP__` that is
never replaced in consumers — permanently `undefined`, always falling through to the
fallback.

**This repo is the case where that bites.** `apps/example-repo-mcp/vite.config.ts`
lists `/^@george43g\//` in `rollupOptions.external`, and as of PR #15 generated repos
install the kits from npm as genuine external dependencies. The reader must live in
the consumer's own bundled graph. Structural constraint, not taste.

Worth naming the failure mode: it degrades to a plausible-looking fallback rather than
erroring, so it would look like it worked.

## Format

```
<semver>+<count>.<sha>[.dirty.<MMDDTHHmm>]
0.9.0+412.a1b2c3d
0.9.0+412.a1b2c3d.dirty.0809T0612
```

| Part | Source | Why |
|---|---|---|
| count | `git rev-list --count HEAD` | Monotonic — tells you which of two builds is newer at a glance. Derived from history, not a committed counter, so it survives clean checkouts and agrees between a laptop and CI instead of colliding. |
| sha | `git rev-parse --short=7 HEAD` | Ties the build to source. |
| dirty | non-empty `git status --porcelain` | Two dev builds off one commit would otherwise be identical; minute resolution separates them. |

Every git call degrades (`0` / `nogit`) rather than throwing, so a published tarball or
shallow container still builds.

## Placement

1. **`@george43g/build-config`** — in-tree, unpublished, devDependency. Fourth sibling to
   `tsconfig` / `biome-config` / `vitest-config`, and it inherits their rule: shared tool
   config is never published and stays `private: true`. Exports `buildStamp(version)` and
   `buildDefines(version)`, the latter returning `{ __BUILD_STAMP__, __BUILT_AT__ }` ready
   to spread into a Vite `define`. Zero runtime deps.
2. **Each app's `vite.config.ts`** — read its own `package.json` version, spread
   `buildDefines(version)` into `define`.
3. **`src/meta.ts`** (template code, already exists) — `declare const __BUILD_STAMP__:
   string | undefined` plus a lazy accessor with the fallback chain **define → git
   shell-out → bare semver**. The git fallback exists because `tsx src/cli.ts` never goes
   through Vite. Lazy, so normal startup never pays for three subprocesses.
4. **Surfacing** — `--version` reports the stamp, not the bare semver
   (`apps/example-repo-mcp/src/cli.ts:44`); the REPL banner (`:115`); the TUI header; and
   health/status output.

## Corrections to the brief

1. **`fetch-depth` is unset in this repo's `ci.yml` — the gotcha is live here.**
   `.github/workflows/ci.yml:23` uses `actions/checkout@v6` with no `fetch-depth`, so it
   defaults to `1` and `git rev-list --count HEAD` would return `1` on every CI build.
   `cli-artifacts-drift.yml:35` and `screenshots.yml:26` are the same.
   `release-packages.yml`, `release.yml` and `readme-check.yml` already set `fetch-depth: 0`.
   Fix the three shallow ones **in the same PR as the stamp**, or the first CI build ships a
   wrong-but-plausible count — exactly the failure this feature exists to prevent.
2. **The Chrome-manifest gotcha does not apply here yet.** This repo has no
   browser-extension template (`apps/` is `example-repo-mcp`, `mcpsync`, `rust-accel`,
   `scaffolder`). Record the constraint — a manifest `version` must be 1–4 dot-separated
   integers 0–65535, so `+build` metadata cannot live there and identity rides in the
   bundled JS — but do not build for it now.
3. **`src/meta.ts` currently reads `package.json` at runtime**, via `readFileSync` at
   module load. So the "don't recompute at runtime" rule needs stating precisely: the
   existing runtime read of *version* is acceptable, but the *stamp* must not be recomputed
   in built output, because it would then describe the checkout the process happens to be
   sitting in rather than the build. That is a different and misleading fact.
4. **Four surfaces, not two.** Anything landing in `apps/example-repo-mcp/` or `packages/`
   must also be mirrored into `apps/scaffolder/src/phases/*/lib/` and regenerated into
   `example/`. A new `packages/build-config` needs a `03-configs` migration and a
   `LIB_TO_CANONICAL` entry, exactly as `vitest-config` got in PR #18.
5. **`APP_VERSION` has six call sites** across `cli.ts` and `index.ts`. Deciding which
   report the stamp and which keep bare semver is part of the work — the MCP handshake
   (`index.ts:46`) advertises `version` to clients and is the one place bare semver is
   probably correct, since it is a protocol field rather than a diagnostic.

## Decisions

- **Chosen**: build-time computation in an unpublished `@george43g/build-config`; the
  reader as template code in `src/meta.ts`.
- **Rejected — exporting `buildStamp()` from `@george43g/robustness`.** Not a style call:
  `define` cannot reach an external module, so it would be permanently `undefined`. See
  "Why this is not a published package".
- **Rejected — a committed counter file.** It collides between a laptop and CI and does
  not survive a clean checkout. `git rev-list --count HEAD` is derived from history and
  does both.
- **Rejected — recomputing the stamp at runtime in built output.** It would describe the
  checkout the process is sitting in, not the build that produced the artifact.
- **Open**: whether the MCP handshake's `version` field (`index.ts:46`) reports the stamp
  or stays bare semver. Leaning bare semver — it is a protocol field consumed by clients,
  not a diagnostic. Decide before implementing, not during.

## Recovery

Every piece is additive and independently revertable. The stamp has a three-step fallback
chain ending at bare semver, so a broken `define` degrades to today's behaviour rather
than failing. If the `fetch-depth` fix is missed, the symptom is a count of `1` on CI
builds — visible in `--version` output, fixed by a one-line workflow change, and no
artifact is corrupted by it. Nothing here is published, so nothing is irreversible.

## Highest-value application

Where two artifacts are built together but deployed separately (daemon + extension,
server + worker), have the long-lived side compare stamps and warn on mismatch. That
turns "your client is stale" from a guess into a fact.

## Out of scope

- Implementing it for a browser extension (none exists here — Correction 2).
- The release-please question, which is a separate decision: see DEFERRED #19.

## Validation

- `pnpm build && node apps/example-repo-mcp/dist/cli.js --version` shows a stamp with a
  real count and sha; `git stash` a change and confirm `.dirty.` appears and disappears.
- `tsx apps/example-repo-mcp/src/cli.ts --version` exercises the git-shell-out fallback
  (no Vite, so no `define`).
- Simulate CI: `git clone --depth 1` this repo into a tempdir, build, and confirm the
  count degrades visibly rather than silently reporting `1` as if it were real.
- Full four-surface sweep: `pnpm verify`, `pnpm regen:example`, golden test.
