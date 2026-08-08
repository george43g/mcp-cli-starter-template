# ExecPlan: `secret-store`, package retirement, and kit hardening (#11 → #8 → #15 → #16)

**Status**: in progress — PR 1 (`feat/secret-store`) landing the package.

This plan absorbs a design brief authored by a life-stack session (originally in that
session's `/tmp` scratchpad, which does not survive). The design below is **settled** —
execute it, do not re-litigate it. Flag genuine blockers instead of improvising.

## Goal

Replace `packages/secrets` — an in-process **policy** chain that talked to a vault
(`env-JSON → 1Password → file`) — with `packages/secret-store`, a **mechanism** package
that never talks to any vault:

```
env  →  .env files  →  OS keychain  →  external command (opt-in)
```

Rationale: pulling secrets *out of* a vault, caching them, and exporting them into the
environment is a secret **manager's** job (mise/direnv/opkeep/systemd). A tool should only
do what a tool does — read env, read `.env`, and read the OS keychain *if it knowingly
stored something there*. That boundary keeps the package portable and keeps vault
credentials out of every tool's dependency tree.

Acceptance criteria:

- `@george43g/secret-store@0.1.0` published, on the OIDC release pipeline.
- `packages/secrets` and `packages/env-loader` gone from all four surfaces
  (canonical, scaffolder phase, `lib/` mirror, `example/`), with nothing lost —
  `secret-store` absorbed `loadEnv`/`parseEnvFile` and re-exports them.
- Scaffolded repos depend on **published** kits, not vendored byte-identical copies.
- The advertised coverage gates actually execute (#15).
- `DEFERRED.md` #16 split so it stops implying we perform EQStack's migration.

## Decisions

- **A mechanism, not a policy.** No vault/vendor code — no 1Password, Vault, AWS SM. Ever.
- **The `exec` layer stays generic.** The package names no tool; the user supplies
  `SECRET_STORE_EXEC_BIN` + `SECRET_STORE_EXEC_ARGS` with a `{VAR}` placeholder, and the
  layer is absent from the chain unless configured. Load-bearing: an earlier attempt
  hardcoded a personal CLI into a shared package, and that was the recorded reason it was
  rejected.
- **Reads degrade to `null`; writes throw.** A failed read has a fallback; a silently
  dropped write is data loss. `saveSecret`/`deleteSecret` throw `UnsupportedPlatformError`
  off-macOS.
- **`-A` (allow-any-app) is opt-in.** It genuinely widens access; never the default.
- **Absolute `/usr/bin/security`.** A GUI/launchd-spawned process does not inherit the
  user's `PATH`; a bare command name works in a terminal and silently fails elsewhere.
- **Ordering is descending explicitness** — real env beats `.env` beats keychain beats
  exec. Do not reorder.
- **Values are returned raw.** `_JSON` is accepted as a var-name alias, but parsing is the
  caller's policy, not this package's.
- **Scaffolded repos consume the published packages** (owner decision, 2026-08-09),
  superseding the brief's "don't add a scaffolder phase yet" default.
- **No byte-identical copies of published packages in the scaffolder** (owner decision,
  2026-08-09). Once a package is on npm, its `lib/` mirror and `LIB_TO_CANONICAL` entry are
  deleted and generated repos take a registry dependency. A package-manager install becomes
  a final step of scaffolding and of any migration that alters dependencies.
- **`#8` is superseded, not un-declined.** The keychain decline assumed the tool itself
  talks to 1Password. Removing vault logic inverts that premise.

## Discoveries

Facts found in this repo that shaped execution — several correct the brief:

1. **The branch did not exist.** The brief said `feat/secret-store` was already created; the
   work was uncommitted on `main`.
2. **`version` was `0.0.0`.** Bootstrapping needs `0.1.0` (matching how robustness, cli-kit
   and tui-kit were bootstrapped) and a matching `secret-store-v0.1.0` tag, or
   semantic-release starts the next release at `1.0.0`.
3. **The retirement blast radius is ~3× the brief's list** — the two packages are named
   across three mirrored surfaces in `docs/ARCHITECTURE.md`, `docs/SHARED_RUNTIME.md`,
   `docs/internals/architecture.mdx`, `README.md`, `AGENTS.md`,
   `.claude/skills/pr-review-sop/SKILL.md` (a review-checklist row),
   `skills/mcp-starter-architect/SKILL.md`, `apps/scaffolder/README.md`,
   `docs/PROJECT_STATE.md`, and a doc-comment in `apps/scaffolder/src/core/package-port.ts`.
4. **Hardcoded migration counts go stale.** "26 migrations" / "172 generated template
   entries" appear in five files, and `README.md` already contradicts itself (25 at line 17,
   26 at line 137).
5. **`templates.ts` and `example/` are generated.** The brief said to edit them.
   `apps/scaffolder/src/generated/templates.ts` is gitignored (`pnpm build:templates`), and
   `pnpm regen:example` does `rm -rf example` first — so stale directories disappear on
   their own.
6. **The golden test's failure mode on deletion is specific.** It walks `lib/` → canonical,
   so canonical-only *additions* are never flagged (the header comment claiming otherwise is
   wrong — pre-existing inaccuracy, also noted in the #14 plan). But deleting a canonical
   package while its `lib/` mirror survives trips *"canonical file missing — was it deleted
   from the live tree?"*. Mirror and `LIB_TO_CANONICAL` entry must go in the same commit.
7. **The publish shape orphans source maps.** `packages/tsconfig/base.json` sets
   `declarationMap` and `sourceMap` true while `files` was `["dist","README.md","LICENSE"]`,
   so every go-to-definition landed on a missing file. Fixed here for secret-store by
   shipping `src` (minus tests); the other three packages are #15's job.
8. **`--runtime-source registry` would have shipped the bug we just fixed.**
   `runtime-source.ts` pinned `PUBLIC_ROBUSTNESS_RANGE = "^0.1.0"`; a caret on a 0.x pins the
   minor, so registry mode installed robustness 0.1.x and missed the #14 singleton fix
   entirely. This is why generated ranges must be derived from the workspace manifests rather
   than hand-written.
9. **The release job must not land before the npm step.** Adding the job and its push
   `paths:` before the Trusted Publisher exists means the first qualifying push runs
   semantic-release with no tag and no publisher, and fails red.

## Validation

Recorded as stages land.

- PR 1: `pnpm --filter @george43g/secret-store test` → 19 passed (1 file).
  `node scripts/check-publishable-manifests.mjs` → passed, 5 publishable packages.
  `npm pack --dry-run` → 28 files: `dist/**` + maps, all five `src/*.ts`, README, LICENSE;
  `src/index.test.ts` correctly excluded by the `!src/**/*.test.ts` negation.

## Recovery

Nothing is published until the owner's manual bootstrap (`pnpm --filter … publish` — pnpm,
not npm, because only pnpm rewrites `workspace:`), so every stage before that is a plain
revert. After publish, npm unpublish is heavily restricted: `pack:check` before, not after.
If a release job misfires, the package is unaffected until the npm publish step itself
succeeds — re-run from `main` (`ref: main` is already in every job). Never hand-edit
versions, tags, or `CHANGELOG.md`; semantic-release owns all three.

## Out of scope

- **EQStack / up-bank-mcp migrations onto these packages.** Different repos, owned
  elsewhere. up-bank-mcp additionally has a hard ordering constraint: the per-app keychain
  item must exist and be verified *before* its 1Password path is dropped, or its CLI breaks.
- **The rest of `DEFERRED.md` #16** beyond the unblocked subset — see the 16a/16b split.
