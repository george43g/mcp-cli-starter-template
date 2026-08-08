# ExecPlan: `secret-store`, package retirement, and kit hardening (#11 → #8 → #15 → #16)

**Status**: ✅ **complete** — landed as PRs #11–#16 (2026-08-09) plus the call-site wiring
(PR #17). Everything this plan set out to do is done. `DEFERRED.md` #15 and the #16 split
were always separate workstreams and remain open; two harness gaps found along the way are
recorded under Deferred below.

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
- PR 1 CI **failed first** on the `example/` sync check — `docs/ARCHITECTURE.md` is
  byte-mirrored into the cloned tool's copy, so the edit changed generated output.
  Reverted rather than regenerated: the annotation pointed at *this* repo's `DEFERRED.md`
  and listed a package scaffolded repos do not yet receive. Note `pnpm verify` does **not**
  run the `example/` sync check — it is CI-only, so a green local verify is not evidence
  for this class of failure. Merged as `0c6ad8c` with all three checks green on `fd8d937`.
- Bootstrap publish (owner-run): `@george43g/secret-store@0.1.0` live, tag
  `secret-store-v0.1.0` on `0c6ad8c`. Trusted Publisher configured via
  `npm trust github` (id `a31916ca-276a-476f-90d2-5364547fef2e`, permissions
  publish + stage publish) — matching `robustness`'s existing config exactly.
- Verified against the **published** package in a scratch project outside the workspace:
  `varName({toolPrefix:"mcp",name:"http_token"})` → `MCP_HTTP_TOKEN` (confirms the PR 4
  call-site design), env resolution returns `{value,source:"env"}`, `loadEnv` is re-exported
  (so retiring `env-loader` loses nothing), and an absent secret returns `null` rather than
  throwing. The registry 404'd for 210s first — see field-note 40.
- PR 2: workflow YAML parsed and asserted structurally — 4 push paths, chain
  `robustness → cli-kit → tui-kit → secret-store → mcpsync`, all 8 steps present,
  mcpsync's `workflow_dispatch` guard intact. Merged as `58d6cbc`; the release workflow
  correctly did **not** fire, because the merge touched `.github/` and docs rather than
  `packages/secret-store/**`.
- PR 3: both packages, both migrations, both `lib/` mirrors and both `LIB_TO_CANONICAL`
  entries removed in one commit. Counts recomputed from source rather than guessed —
  **24 migrations** (was 26) and **169 template entries** (was 172); `README.md` had said
  both 25 and 26 in different places, so both were wrong. Scaffolder 131 passed with golden
  drift green. `pnpm verify` → 14/14 test tasks and 10/10 builds, down from 16/12 by exactly
  the two deleted packages. `pnpm install --frozen-lockfile` accepts the regenerated
  lockfile (-36 lines). `pnpm regen:example` proven **idempotent** — a second run leaves the
  tree byte-identical — and `example/packages/` no longer contains either package.
- PR 4a (de-vendoring): scaffolder **129 passed** after rewriting the tests that assumed
  vendored source. Five failed first, and each failure was real rather than cosmetic — one
  test asserted `@george43g/cli-kit` should be rewritten to `@myorg/cli-kit`, which is
  precisely the bug (a published name rewritten to the target's scope resolves to nothing).
  Ranges are asserted against `rangeFor()` rather than literals, since a hardcoded `^0.1.0`
  is what let the old value drift a full minor behind. Templates dropped 169 → 123 entries;
  phases 12 → 10; migrations 24 → 21. `pnpm verify` 14/14 + 10/10, `test:no-native` 7/7,
  `stress` 13/0, `check:usage` fresh after regenerating artifacts without the flag.
- **The E2E that matters**: `mise run smoke` scaffolds into `/tmp` and installs. The target
  resolved `@george43g+robustness@0.2.1` into its pnpm store — a real registry install, not
  a workspace symlink — and its tests passed. Generated `packages/` contains only the
  unpublished (`mcp-kit`, `shared-types`) and never-published config packages.

## Recovery

Nothing is published until the owner's manual bootstrap (`pnpm --filter … publish` — pnpm,
not npm, because only pnpm rewrites `workspace:`), so every stage before that is a plain
revert. After publish, npm unpublish is heavily restricted: `pack:check` before, not after.
If a release job misfires, the package is unaffected until the npm publish step itself
succeeds — re-run from `main` (`ref: main` is already in every job). Never hand-edit
versions, tags, or `CHANGELOG.md`; semantic-release owns all three.

## Deferred out of this plan

1. ~~**`secret-store` has no consumer yet.**~~ **RESOLVED (PR #17).** For one day it was
   published with nothing importing it — *precisely* the dead-weight verdict #11 reached
   about `packages/secrets`. Closed by wiring the honest call site that already existed:
   the HTTP bearer token, previously read straight from `process.env` at
   `packages/mcp-kit/src/transports/http.ts:82`. `HttpServerOptions` gained an additive
   `token?: string` taking precedence over `tokenEnv`; the app resolves it via
   `resolveSecret({ toolPrefix: "mcp", name: "http_token" })`. `varName` yields exactly
   `MCP_HTTP_TOKEN` and `envSource` is first in the chain, so an exported env var behaves
   identically to before — the chain only adds `.env`, keychain and exec beneath it.
   `secret-store` joined `docs/ARCHITECTURE.md`'s package list at that point, and its
   "Secrets — nothing built in" section was rewritten, having become false.

   Evidence: 6 new transport tests (2 of which fail if the `token` option is ignored —
   checked by reverting the one line); 13/13 stress including the three HTTP auth
   assertions; `mise run smoke` resolved `@george43g/secret-store@0.1.0` from the registry
   into `/private/tmp/scaffold-smoke/node_modules/.pnpm/`, so scaffolded repos get a real
   install, not a workspace symlink.
2. **`regen:example` is defined twice.** `package.json`'s script writes into the repo;
   `.github/workflows/ci.yml`'s sync check re-implements it against a tempdir. Adding the
   install step to one and not the other broke CI on a repo that was genuinely in sync.
   Re-synced by hand and commented, but the duplication remains — one parameterised script
   taking a target directory is the durable fix.
3. **`pnpm verify` does not run the `example/` sync check.** It is CI-only, so a green local
   verify is not evidence for that class of failure. It bit twice in one session. Adding it
   costs a full scaffolder build on every local `verify`, which is why it was not done
   unilaterally.

## Out of scope

- **EQStack / up-bank-mcp migrations onto these packages.** Different repos, owned
  elsewhere. up-bank-mcp additionally has a hard ordering constraint: the per-app keychain
  item must exist and be verified *before* its 1Password path is dropped, or its CLI breaks.
- **The rest of `DEFERRED.md` #16** beyond the unblocked subset — see the 16a/16b split.
