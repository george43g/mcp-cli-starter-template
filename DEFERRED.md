# Deferred Work

Items intentionally not done in the current shipping series. Each has a "trigger" — the signal that says "now is the time to action this."

---

## Resolved this round (no action needed)

- **Npm scope rename** — user decided to keep `@george43g`. Personal username is the publishing identity. Closed; not a deferred item anymore.
- **`{{name}}` placeholder syntax** — migrated to `example-repo` / `EXAMPLE_REPO`. Filesystem-safe, no tera/handlebars collisions, no usage(1) identifier corruption. Done.
- **Root `mise.toml` tera collision** — auto-resolved by the placeholder migration (mise no longer sees `{{name}}` to fail-parse). `mise tasks` from repo root works cleanly. Done.

---

## 1. Scaffolder's own usage(1) freshness gate in CI

**Status**: ✅ DONE (confirmed 2026-08-09). `apps/scaffolder/scripts/check-usage-freshness.mjs`
exists, root `package.json` chains `check:usage`, `ci.yml` runs it, and
`.github/workflows/cli-artifacts-drift.yml` is a second gate. Item closed.

<details><summary>original note</summary>

**Status**: missing — only the SCAFFOLDED output has a gate.

**Why deferred**: the scaffolded output's freshness gate (`apps/example-repo-mcp/scripts/check-usage-freshness.mjs` + the CI step that runs it) is the user-facing value. The scaffolder repo itself uses `usage` via `mise run completions` from `apps/scaffolder/mise.toml` but ships its checked-in artifacts at `completions/scaffolder/` + `docs/scaffolder-cli/` + `man/mcp-scaffold.1` without a CI gate.

**Trigger to action**: if drift between `apps/scaffolder/.usage.kdl` and the checked-in scaffolder completions lands on `main` (would mean someone edited the spec without regen — visible in PR review for now).

**Cost**: ~30 minutes. Copy the cloned-tool's `check-usage-freshness.mjs` pattern into `apps/scaffolder/scripts/`, point it at `apps/scaffolder/.usage.kdl`, wire into `.github/workflows/ci.yml` before the lint step.

---

</details>

---

## 2. RESOLVED — `mise trust` friction on first-run

**Status**: ✅ **RESOLVED 2026-08-10** with option A, documented in both places a new user actually
looks:

- The generated README gains a "Working on this repo" block leading with `mise trust .`, and says
  WHY — mise refuses to load an unseen `mise.toml`, so skipping it makes `mise install` fail in a
  way that reads like a broken checkout rather than a security prompt.
- `mcp-scaffold init`'s "Action required" recap already told the user to run
  `mise install && mise run artifacts`; that line was missing the trust step, so following it
  verbatim failed. It now reads `mise trust . && mise install && mise run artifacts`.

Option B (auto-trusting at scaffold time) was NOT taken: the prompt is mise's supply-chain guard,
and a scaffolder that silently trusts config on the user's behalf defeats it. Documenting the
answer is the fix; bypassing it is not.

**Original entry follows.**

## 2 (original). `mise trust` friction on first-run

**Status**: known UX rough edge.

**Why**: mise's security model requires the user to `mise trust` any `mise.toml` it hasn't seen before. After `mcp-scaffold init`, the user has to run `mise trust .` in the scaffolded directory before `pnpm artifacts` / `pnpm completions` will work. The error message mise prints is clear enough but adds friction.

**Trigger to action**: when first-time users report being confused by the mise trust prompt.

**Cost**: ~15 minutes.

**Fix options**:
- A. Document the `mise trust .` step prominently in the README's first-run section + add to `mcp-scaffold init`'s closing message.
- B. Have `mcp-scaffold init` run `mise trust <target>/mise.toml` + `mise trust <target>/apps/<name>-mcp/mise.toml` automatically at scaffold time. Requires mise binary on the scaffolder's machine, which it usually has if the dev is iterating on the template.
- C. Set `MISE_TRUSTED_CONFIG_PATHS` env var in the scaffolded `.env.example` with a comment explaining the security trade-off. Less invasive than auto-trust.

Recommended: A (just document it). The trust prompt IS the right UX for security-conscious users; documenting the answer is enough.

---

## 3. REFRAMED — MCPB bundle is BROKEN, not merely large

**Status**: open, and materially worse than this entry claimed. Investigated 2026-08-10; no fix
shipped, deliberately.

**The bundle does not run.** Extracted from a clean build and executed:

```
$ node dist/cli.js health
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'ajv' imported from
  node_modules/@george43g/mcp-kit/node_modules/@modelcontextprotocol/sdk/dist/esm/validation/ajv-provider.js
```

So the headline was wrong twice over: the size is **36.4 MB**, not ~52 MB, and size is not the
defect. Like the screenshots pipeline (#29), this is a surface that has been shipping without ever
producing a working artifact.

**Root cause, and it explains both symptoms at once.** `zip -r` FOLLOWS symlinks. The app's
`node_modules` in a pnpm workspace is a symlink farm into `.pnpm`, so the zip walks each link and
writes real files at the link's location — pulling the whole monorepo graph in once per workspace
kit (22.5 MB of `typescript/lib`, plus vite and vitest, measured from the archive listing) while
FLATTENING the nested layout that pnpm relies on for resolution. Packages arrive without their own
dependencies.

**Two fixes attempted, both rejected on evidence:**

| Attempt | Result |
|---|---|
| `pnpm deploy --prod` into the stage | **46.6 MB — larger.** pnpm's output is itself a symlink farm into its own `.pnpm`, so zip followed those instead. |
| `pnpm deploy --prod` + `cp --dereference` + filter `.pnpm/node_modules` | **26.26 MB and still broken** — `Cannot find package 'picocolors'`. Dereferencing flattens exactly what pnpm needs. |

**What a correct fix must satisfy**: the extracted bundle runs `node dist/cli.js health`. Size is
secondary and should not be reported without that check — a 30% reduction that breaks resolution is
strictly worse than the status quo.

**Option B from the original entry now looks strongest**: have Vite bundle dependencies inline
(drop them from `external` for the mcpb build only), producing a self-contained `dist/` with no
`node_modules` in the archive at all. That sidesteps the symlink interaction entirely rather than
negotiating with it. The original entry's objection — harder to debug — is much weaker than
"the artifact has never worked".

**Cost**: revised from ~1-2h to ~half a day, and it needs the runs-after-extraction assertion wired
into CI, or this recurs silently.

**Original entry follows.**

## 3 (original). MCPB bundle size optimization

**Status**: works, but produces ~52 MB artifacts.

**Why**: `scripts/build-mcpb.mjs` currently copies the entire `node_modules/` tree into the bundle. That includes dev-dependencies (typescript, vitest, vite, etc.) that the runtime doesn't need.

**Trigger to action**: when the bundle size matters (someone tries to ship via npm tarball + the 50MB+ size becomes a friction point).

**Cost**: ~1-2 hours. Options:
- A. Add a `pnpm install --omit=dev --prefix <stage>` step before zipping. Requires the user to have pnpm on the build machine. Probably the cleanest.
- B. Switch Vite to bundle dependencies inline (drop them from `external`), producing a self-contained `dist/index.js`. Trade-off: harder to debug, no shared workspace versions.
- C. Walk node_modules with a denylist of dev-only packages. Brittle.

---

## 4. Stress harness JSON-report artifact upload

**Status**: stress runs locally + in CI but doesn't upload a report artifact for non-default cases.

**Why deferred**: the existing CI step `actions/upload-artifact` already grabs `apps/**/stress-*-report.json` — but the harness doesn't currently emit JSON, only a console table. The plan in `glowing-percolating-key.md` (originating imsg-mcp research) had this as a "Phase 3 deferred" item.

**Trigger to action**: when a stress regression is hard to diagnose from CI logs alone (e.g. timing-sensitive HTTP case fails on macOS only).

**Cost**: ~1 hour. Add a `--json` flag to `stress-mcp.ts` that emits `{ case, pass, durationMs, detail }[]` to `stress-mcp-report.json`. Update CI to always pass `--json`.

---

## 5. Semantic / vector search demo for the Resources kit

**Status**: DEFERRED BY THE USER, 2026-08-10, and explicitly kept in the backlog as **an experiment
they want to run eventually** — not as work anyone should schedule.

> "this can be deferred until the end / later — I don't know why vector db was even brought up in
> this repo — but do remind me that it's an experiment I want to do eventually"

That doubt is worth preserving alongside the item: **the entry never justified why a vector search
demo belongs in a starter template at all.** It was proposed as a richer Resources example, and the
original text already conceded it "probably belongs in a separate advanced-patterns doc". Nobody
has since asked for it, and the stated trigger below has never fired.

**So the first question is not "how do we build it" but "does it belong here".** It would add an
embedding dependency to every scaffolded repo to demonstrate one pattern. Weigh that before
implementing — and if the answer is that it is an experiment rather than template content, the
right home may be a scratch repo, not `08-app/lib`.

Deprioritised below #3 (the MCPB bundle does not run) and Stage 7 (mcpsync relocation + repo
rename) in the 2026-08-10 batch.

**Original entry follows.**

## 5 (original). Semantic / vector search demo for the Resources kit

**Status**: not started.

**Why deferred**: the MCP Resources demo (`apps/example-repo-mcp/src/resources/registry.ts`) currently exposes `health://` + `logs://recent/{n}`. Adding a `search://embeddings/{query}` example would show a richer pattern (vector index + pluggable embedding model), but it's bespoke and probably belongs in a separate "advanced patterns" doc.

**Trigger to action**: when someone asks "how do I expose search results as MCP Resources?" or when we have a real-world MCP using the kit for semantic search.

**Cost**: ~1 day. Pick a tiny embedding lib (e.g. `@xenova/transformers` for browser-portable models), wire a demo with a sample corpus.

---

## 6. `example/biome.json` strip is a small divergence from "faithful scaffolded output"

**Status**: known compromise.

**Why**: the committed `example/` reference is byte-equal to what `mcp-scaffold init` produces, with TWO exceptions: `example/biome.json` is stripped post-regen (biome 2.x discovers nested biome.json as a competing root and errors), and the `.git/` directory isn't committed (m3-git-init creates one in fresh dirs but skips inside the parent repo). The CI diff step mirrors both strips on the tempdir side before comparison.

**Trigger to action**: if biome adds a `"root": false` config field or a `.biomeignore` mechanism that lets the parent suppress nested-root discovery without modifying the nested file.

**Cost**: ~15 minutes when the upstream fix lands. Drop the `rm -f example/biome.json` from `regen:example` and the matching strip from CI; remove the diff-side `.git` strip if biome can also stop walking into it.

---

## 7. Two-branch `main` + `experimental` SOP

**Status**: declined per spec locked decision #10.

**Why**: the user explicitly chose single-`main` to keep the operational surface small. Don't reintroduce without an explicit reason.

---

## 8. Apple Keychain integration for `packages/secrets/`

**Status**: ✅ **SUPERSEDED 2026-08-09 — shipped, in a different package.** The OS keychain is a
first-class source in `packages/secret-store` (read via `/usr/bin/security`, plus
`saveSecret`/`deleteSecret` for setup flows).

**Why the decline was reversed**: it rested on the premise that *the tool itself talks to
1Password* — "the 1Password CLI handles that already with better cross-machine sync". Removing
vault logic from tools inverts that premise. Once a tool no longer carries vault credentials or
vendor code, the keychain becomes the **only** local store it can read without taking a vault
dependency, so it stops being a macOS convenience and becomes the load-bearing local layer.

**Why the original cross-platform objection no longer bites**: keychain is macOS-only and
**degrades to `null`** everywhere else, so the chain simply falls through to `env` / `env-file`,
which work on every platform. Reads degrade, writes throw `UnsupportedPlatformError` — a failed
read has a fallback, a silently-dropped write is data loss. Cross-platform CI is unaffected.

<details><summary>original note</summary>

**Status**: declined per spec locked decision #5.

**Why**: the secrets chain (`env-json → 1Password → file`) covers macOS, Linux, CI, and Docker uniformly. Keychain would only help macOS dev loops, and the 1Password CLI handles that already with better cross-machine sync.

</details>

---

## 9. MOVED — mcpsync TUI env/args editing is life-stack's now

**Status**: transferred with the app 2026-08-22. Not closed and not abandoned — it stopped being
ours the moment mcpsync left. Kept as a pointer rather than deleted so the number is never reused
and the trail survives.

**Where it lives now**: `life-stack/apps/mcpsync/HANDOFF.md`, under "Known gap: TUI env/args
editing", carried in full — the two blockers (no text-input primitive in `@george43g/tui-kit`; no
canonical `.mcp.json` write-back path plus `reload()`), the sketch (an `e` edit mode over ink's
`useInput`, or adopt `ink-text-input`), and the ~half-day estimate.

**The half that is still OURS**: tui-kit ships `useVimKeys`, `useMouse`, `StatusBar`, `HelpBar` and,
since 0.5.x, the list primitives — but **no text-input primitive**. If a second consumer ever wants
one, that is a tui-kit item and belongs in a new entry, not this one.

---

## 10. Relocate mcpsync out of this repo (to life-stack) — DECIDED: migrate WITHOUT publishing

**DECISION 2026-08-22, George**: **migrate without publishing.** mcpsync leaves as a private tool
installed from a local path, not as a registry dependency. That is a narrowing of this entry, not a
completion of it — the move itself is still to do.

**Three planned work items are dissolved rather than solved by it:**

- **The npm bootstrap is not needed.** `@george43g/mcpsync` was never published (`npm view` returned
  E404 every time it was checked), so there is no orphaned version, no trusted publisher to
  configure, and no name to defend.
- **"life-stack has no release pipeline" stops being the blocker.** It was recorded as this
  migration's hard blocker on 2026-08-18. Not publishing removes the requirement entirely.
- **`semantic-release` + `.releaserc.json` in `apps/mcpsync/` are now dead weight** and can be
  dropped at the new home. Nothing reads them any more.

**Done in this repo 2026-08-22 (the departure half):**

- `apps/mcpsync/package.json` → `private: true`, `publishConfig` removed.
- Removed from `PUBLISHABLE` in `scripts/check-publishable-manifests.mjs` (now 4 packages).
- Its `workflow_dispatch`-only release job deleted from `release-packages.yml`, plus the header
  paragraph explaining the deferral. **Nothing needed re-chaining** — it was already the tail and
  nothing had `needs: mcpsync`, exactly as the life-stack session established by reading the
  workflow rather than this checklist.
- `apps/mcpsync/HANDOFF.md` written so the knowledge TRAVELS WITH THE APP: destination and terms,
  the four `workspace:*` devDeps that still need rewriting, the Vite bundling decision, the "there
  is no reinstall" fact about the global bin, DEFERRED #9's TUI editing gap in full, and the
  secrets invariant.

**RESOLVED 2026-08-22 — landed, PUSHED, and `apps/mcpsync/` is now removed from this repo.**
Verified from GitHub rather than from their report: all five commits are ancestors of `origin/main`
on `github.com/george43g/life-stack`, with 60 files under `apps/mcpsync/`. File-set diff against our
tracked copy: **the only file not carried is `.releaserc.json`** (deliberate — no publishing), and
their only addition is `bin/mcpsync` (their PATH convention). `src/` + `tests/` are byte-identical
across all 51 files — `git archive` both sides into a scratch dir, `diff -r`, empty.

**LANDED at the new home 2026-08-22** — life-stack `3441550`, `feat(mcpsync): migrate from
mcp-cli-starter-template into apps/mcpsync`, 61 files, under George's approval given **directly to
that session, not relayed through this one**. They verified before reporting: 170/170 tests,
`tsc --noEmit` clean, biome clean over 56 files, `mise run verify` rc=0, and `mcpsync doctor`
read-only against the real host set. `src/` and `tests/` are byte-identical to ours — no source
edits. Their manifest delta is repository URL, the four `workspace:*` devDeps rewritten
(`cli-kit ^2.0.1`, `tui-kit >=0.5.1 <1`), and the semantic-release devDeps plus `pack:check` dropped.

**The deletion was held until the push, deliberately** — `3441550` sat on their local `main`
unpushed, and deleting against a commit nobody can fetch would have meant mcpsync existed in no
pushed tree if that push were refused or reset. Same trade as splitting the departure half: two
copies for a day beats none for an hour. George pushed it himself; the hold cost one evening and
bought the guarantee.

**What the removal touched here**, beyond `apps/mcpsync/` itself: six `docs/plans/2026-08-mcpsync-*`
plans, the `AGENTS.md` "MCP servers (project scope)" section (**the workflow is unchanged** — the
`mcpsync` bin still runs against this repo's `.mcp.json`, only its source moved), `docs/RELEASE.md`'s
published-package list, and a comment in `check-publishable-manifests.mjs`. **`.gitignore`'s
`*.bak.[0-9]*` pattern STAYS** — the bin still writes timestamped backups here.

**A CORRECTION TO OUR OWN HANDOFF NOTE, from them.** `apps/mcpsync/HANDOFF.md` says "there is no
reinstall — the pnpm shim is PATH-based". Right conclusion, wrong mechanism: the shim at
`~/Library/pnpm/mcpsync` was an **orphan**, its `NODE_PATH` naming `global/5/.pnpm/node_modules`
against a live `global/v11`, and absent from `pnpm ls -g --depth 0` entirely. **`pnpm rm -g
@george43g/mcpsync` would have found nothing and exited 0** — the fifth sighting in two days of *an
operation that succeeded because it had nothing to do*. They retired the file by hand instead.

**A DEFECT IN THE FILE WE WROTE**: `apps/mcpsync/HANDOFF.md`'s sibling README carried
`../../docs/plans/2026-08-mcpsync-overview.md`, correct here and dead the moment the app moved. The
generalisable form: **a relative link inside a file designed to MOVE is a defect at authoring time,
not at move time.** Neither repo's docs check covers it — ours excludes `apps/*/README.md`, and
life-stack's `harness:check` passed with the dead link in place. Open on both sides.

**A CONSEQUENCE OF THE VITE BUNDLING THEY KEPT** (they declined step 2 with sound reasoning —
`private: true`, installed from the working tree, never resolved by npm, so nothing observes the
difference on the publish axis; verified here that `robustness`/`ink`/`react` are external, so the
duplicate-React hazard does not exist). What it does create: **cli-kit and tui-kit are resolved at
BUILD time, not run time**, so their three version checks — `check-dep-ranges.mjs`, the
resolved-version-from-disk read, and `mise run verify` — all read `node_modules` and none describes
what `dist/cli.js` executes. A kit bump without a rebuild reports current while the binary on PATH
runs the inlined old code. **Mechanism 5 wearing a build step instead of a lockfile.**

**RESOLVED at their end, and by the option we priced as the expensive one** — life-stack `230914f`,
`refactor(mcpsync): externalise cli-kit and tui-kit so the version checks tell the truth`. 66 modules
transformed → 32; `dist/cli.js` 30.3 kB → 27.7 kB.

**THE COST WE QUOTED FOR EXTERNALISING DOES NOT EXIST, AND IT TOOK THREE PASSES TO NOTICE.** Our
`apps/mcpsync/HANDOFF.md` said externalising "means moving `cli-table3`/`picocolors`/`ink`/`react`
back out of its own `dependencies`". life-stack repeated it back; we then re-priced option (1) with
the same cost and recommended option (2) partly because of it. It is checkable in one command
against the manifest **in our own tree**:

| package | where | range |
|---|---|---|
| `cli-table3` | dependencies | `^0.6.5` |
| `picocolors` | dependencies | `^1.1.0` |
| `commander` | dependencies | `^14.0.0` |
| `fullscreen-ink` | dependencies | `^0.1.0` |
| `@george43g/robustness` | dependencies | `>=0.11.0 <1` |
| `ink` | dependencies | `^7.1.1` |
| `react` | dependencies | `^19.2.8` |

All seven were **already** direct dependencies — we had externalised them long ago. The entire change
is the two kits moving `devDependencies` → `dependencies` plus two lines in `rollupOptions.external`.
**A cost that travels through three hands without anyone checking it is not a measurement, it is
folklore** — and this one originated in a file we wrote, which is why nobody downstream questioned it.

**A SIXTH SIGHTING, and it is the sharpest variant yet.** Their first check for leftover inlining was
`grep -rl "useVimKeys|allocateWidths|scrollbarThumb" dist/*.js`. It matched — and **would have
matched either way**, because it hits the import binding as readily as inlined source:

```
3:import { useTheme, useVimKeys, HelpBar, StatusBar, renderFullScreen, ThemeProvider } from "@george43g/tui-kit";
87:  useVimKeys({
```

They caught it before recording the result, and settled it by reading the chunk's import statements
and executing both paths instead. This is not "an operation that succeeded because it had nothing to
do" — it is one step worse: **a check whose pass and fail cases are indistinguishable, i.e. a test
with no discriminating power.** It is the same discipline this repo already writes into its own
plans (*every fix observed FAILING before it is trusted*), arriving from the other direction: **a
check you have not watched fail is not a check.**

**Original entry (2026-08-08 → 2026-08-18), kept for the checklist and the corrections it records:**

**Status**: not started. **This SUPERSEDES the earlier same-session "stay + publish + import"
home decision** (see `docs/plans/2026-08-mcpsync-overview.md`). Governing **inclusion rule**:
a thing belongs in this repo iff it is (a) scaffolding machinery or (b) framework code that
generated tools depend on long-term and don't heavily customize. mcpsync is neither — it's a
standalone product that merely *consumes* the kits, exactly like an external consumer. It's a
sibling of `opkeep`, not framework code.

**Retraction**: the "generated tools import mcpsync as a library for self-deploy" idea is
dropped. A tool that wants self-setup instead documents an **optional one-time
`npx @george43g/mcpsync …` runtime shell-out** — no build-time dependency baked into every
generated tool. `npx` works regardless of where the source lives; it only needs mcpsync to be
*published*, not *co-located*.

**Sequenced work**:
1. ✅ **DONE 2026-08-08** — `@george43g/cli-kit@0.1.0` and `@george43g/tui-kit@0.1.0` are
   published, so mcpsync's `workspace:*` devDeps resolve from npm.
   `@george43g/robustness` is on npm too (now `0.2.0`).
   **The tsconfig/vitest-config question is CLOSED, and the answer is "neither".** Shared-tool
   config packages are never published (see the rule in `AGENTS.md`) — a relocated package
   depends on the destination monorepo's own equivalent. Verified 2026-08-18: life-stack ships
   `@george43g/{tsconfig,vitest-config,biome-config}`, all `private: true`, so those resolve.

   **CORRECTION 2026-08-18 — "zero manifest changes" was WRONG.** mcpsync has **four**
   `workspace:*` devDeps, not two. `@george43g/cli-kit` and `@george43g/tui-kit` are NOT
   workspace packages in life-stack, so they do not resolve there. They are devDeps rather than
   deps because `apps/mcpsync/vite.config.ts` BUNDLES them into `dist/` — its own comment
   (`:17-22`) says so and calls the bundling "legacy" now that both are published. Step 2 below
   already covers rewriting them; it is this step's "no work required" that was false. The
   original claim was made by checking only the two config packages and generalising.
2. Move `apps/mcpsync` to life-stack (sibling of `opkeep`); rewrite `workspace:*` → the
   published versions; publish `@george43g/mcpsync` from there. It can also stop bundling the
   kits via Vite (`apps/mcpsync/vite.config.ts` externals) and take them as real deps —
   optional, and it means moving `cli-table3`/`picocolors`/`ink`/`react` back out of its own
   `dependencies`.
3. Remove mcpsync from this repo. Full checklist (the earlier version of this list was
   incomplete — whoever executes the move would have hit the gaps mid-flight):
   - its release job in `release-packages.yml:369-374`. **CORRECTED 2026-08-18** (this line
     previously said "chained after `tui-kit` — re-chain `tui-kit`"): mcpsync `needs: secret-store`
     and is ALREADY the tail — nothing has `needs: mcpsync`. Deleting it requires **no re-chaining
     at all**; `secret-store` simply stays the tail it already effectively is. Do not edit
     `tui-kit`. Caught by the life-stack session reading the workflow rather than the checklist.
   - its entry in `PUBLISHABLE` in `scripts/check-publishable-manifests.mjs`
   - its meta-suite tests (it contributes 17 test files to `pnpm test`)
   - the whole **"MCP servers (project scope)" section of `AGENTS.md`**, which instructs agents to
     run the local `mcpsync` bin after editing `.mcp.json` — that workflow leaves with it
   - `apps/mcpsync/vite.config.ts`'s bundling rationale (moot once relocated; see step 2)
   - its `LICENSE` (added 2026-08-08 to satisfy the manifest guardrail)

**BLOCKER found 2026-08-18, not previously recorded: life-stack has no release pipeline.**
`ls .github/workflows/` there returns no release workflow at all. mcpsync is meant to publish as
`@george43g/mcpsync` and carries `semantic-release` + `semantic-release-monorepo` +
`@semantic-release/{changelog,git,npm}` in its own devDeps; its release job here is
`release-packages.yml:369-374`, `workflow_dispatch`-only and bootstrap-pending. This repo
publishes via **npm OIDC trusted publishing with no `NPM_TOKEN`**. "Release wiring at the new
home" is not mechanical when the home has no wiring.

**CORRECTED 2026-08-18 — "re-established" was wrong; there is nothing to re-establish.**
`npm view @george43g/mcpsync version` returns **E404: the package has never been published.**
The workflow header (`release-packages.yml:16-18, 30-36`) states both halves: trusted-publishing
config "requires the package to already exist — each new package needs a one-time manual
`pnpm publish` bootstrap", and mcpsync's publish is deferred by a user decision of 2026-08-03.

So publishing mcpsync is **three** steps wherever it happens, not one: (i) a one-time manual
`pnpm publish` of 0.1.0, (ii) creating a trusted publisher on npmjs.com pointed at whichever repo
will publish it, (iii) a release pipeline in that repo. (i) and (ii) are the user's alone.

**THE ORDERING TRAP** (life-stack's finding, and the most actionable thing here): exactly one
sequence forces a trusted-publisher *migration*, and it is the one that looks safest — publish
from THIS repo first, then move. That pays bootstrap + TP-here + TP-repoint-there + pipeline.
The two clean orderings are **move now and publish later or never** (no TP is ever created here,
so none is ever migrated), or **publish from here and never move** (cheapest route to a published
mcpsync, since the job at `:369-374` is already written; permanently accepts the impurity).

Also corrected: #10 said to place mcpsync "beside `opkeep`". `apps/opkeep` is a **bash** project
(`bin/`, `lib/`, `load.sh`, `backends/`, `widgets/`, `mise.toml`), neither private nor
publishConfig-bearing. It indicates where the directory goes and nothing about how a published
TypeScript CLI should be wired there.

**ANSWERED 2026-08-18 by the life-stack session, with evidence.** Their picks:
- **Q1 → (b) move, stay private/unpublished.** Verified there: `.github/workflows/` holds only
  `ci.yml` (lint/typecheck/test) and `reaper.yml`; zero `npm publish`, zero `id-token`.
  **11 of 11 workspace packages are `private: true` with zero `publishConfig`**, and
  `docs/REPOSITORY.md:38-39` states "Use `@george43g/*` only for private workspace linking.
  Packages are not published by default." (a) would make mcpsync the first non-private member —
  an architectural change to that repo, not a config toggle. Their argument for (b): it loses
  nothing because nothing is currently gained; mcpsync is unpublished today and would be
  unpublished tomorrow. **Known cost they insisted be written down**: the `npx @george43g/mcpsync`
  self-setup story this entry adopted when it retracted import-as-library is DEAD under (b) until
  someone publishes. Do not let that quietly evaporate.
- **Q2 → (b) stop bundling; real deps at caret.** Decisive argument is asymmetric visibility, not
  taste: a stale `dependencies` pin is visible to `pnpm outdated` and the lockfile, whereas a stale
  BUNDLED devDep is compiled into `dist/` where no dependency tool looks — the repo's own top bug
  class. Also concrete: life-stack ALREADY consumes `@george43g/cli-kit: ^2.0.1` as a real external
  dep (`apps/os-fork-ctl/package.json:19`), so (a) would put cli-kit in that repo twice, once
  unobservable.
- **Q3 → `apps/mcpsync`.** `docs/REPOSITORY.md:45` reserves `packages/` for reusable libraries and
  `:66` gates it on "at least one real reuse boundary" — mcpsync has a `bin` and zero in-repo
  importers, so the rule actively forbids `packages/`.
- **Q4 → nothing filed.** Nine `mcpsync` hits across their repo, all usage docs or design
  precedent; no defect, complaint, or request. Reported as empty rather than invented.

**THE CONDITION THAT FLIPS THIS TO (c)**, and it needs the user: *if mcpsync should be published
soon, do not move it.* Publishing from here needs only the bootstrap plus a TP entry against a
workflow that already exists; publishing from life-stack needs a pipeline built first. The move is
right precisely because publishing is not urgent — if that assumption is wrong, the answer flips.

**Two arrival-side facts to budget for**: mcpsync brings **React, Ink and Vite into life-stack,
which has none of them today** (verified absent from their lockfile importers), so a green
`mise run verify` there is an explicit acceptance step, not a formality; and their
`mise run harness:check` validates their agent-knowledge layer, so the `AGENTS.md` MCP-servers
section move must be checked immediately after that edit rather than at the end.

**Still with the user** — whether mcpsync should be published at all or soon (the single
input that flips Q1 to (c)), and — only if publishing is ever wanted — the manual bootstrap and
trusted-publisher steps, which nobody else can perform. **Do not start deleting until that is
answered.**

**Cost**: ~half a day IF Q1 is (b) unpublished-at-life-stack. Materially more for (a), which
means standing up a release pipeline plus an npm trusted-publisher reconfiguration in a repo
that has deliberately never had one.

---

## 11. `packages/secrets` (and `packages/env-loader`) — retire or justify

**Status**: ✅ **DONE 2026-08-09 — both retired (PR #13), superseded by `packages/secret-store`.**
**The caveat is now closed too**: for a day `secret-store` was published with no importer, which
was exactly the dead-weight verdict this item reached about `packages/secrets`. It now has a real
consumer — the HTTP bearer token resolves through it in `apps/example-repo-mcp/src/commands/http.ts`,
and every scaffolded repo declares the dependency and installs it from the registry. The test this
item set ("do generated tools actually import it?") passes for the replacement.
Option (a) with a replacement rather than a hole. The new package is a **mechanism**, not a
policy: `env → .env → OS keychain → external command (opt-in)`, with no vault/vendor code in it
at all. It absorbs `env-loader`'s `loadEnv`/`parseEnvFile` verbatim and re-exports them, so
nothing is lost by deleting that package.

The reasoning behind the swap: pulling secrets *out of* a vault, caching them, and exporting them
into the environment is a secret **manager's** job (mise/direnv/opkeep/systemd). A tool should
only read env, read `.env`, and read the OS keychain if it knowingly put something there. That
boundary is what keeps vault credentials out of every tool's dependency tree. The optional `exec`
layer is the generic escape hatch to whatever manager the user runs — it names no tool; the user
supplies `SECRET_STORE_EXEC_BIN` + `SECRET_STORE_EXEC_ARGS` with a `{VAR}` placeholder. That
genericity is load-bearing: an earlier attempt hardcoded a personal CLI into a shared package and
that was the recorded reason it was rejected.

Reverses **#8** (Apple Keychain), which was declined on a premise this inverts.
Full record: [`docs/plans/2026-08-secret-store-and-kit-hardening.md`](docs/plans/2026-08-secret-store-and-kit-hardening.md).

<details><summary>original note</summary>

**Status**: ✅ **VERIFIED 2026-08-09 — the answer is "retire", pending your call on how.**
The stated test was "do generated tools actually import it?" A repo-wide grep for
`@george43g/secrets` / `getSecret` / `resolveSecret` finds **zero importers** — not in
`apps/example-repo-mcp`, not in the tracked `example/` output, nowhere but the package's own
`src/index.ts` and prose. By the inclusion rule (a thing belongs here iff it is scaffolding
machinery, or framework code generated tools depend on long-term) `packages/secrets` fails
outright.

**`packages/env-loader` has the identical profile** and was not previously part of this item:
zero importers, including in `example/`. Only descriptive prose in `AGENTS.md`,
`docs/ARCHITECTURE.md` and the example's mirrors. Both ship into every scaffolded repo as dead
weight.

**Layer note (still true)**: `packages/secrets` is an in-process `env-JSON → 1Password → file`
*resolution* chain, a different layer from `opkeep` (life-stack's standalone secret-*provisioning*
CLI). They are complementary in principle. The problem is not overlap — it is that nothing
consumes it.

**Options**: (a) delete both packages and their scaffolder phases; (b) keep them but wire the
example app to actually use them, proving the contract; (c) keep as opt-in migrations the
scaffolder does not run by default. Note DEFERRED #8 (Apple Keychain for `packages/secrets`) is
moot under (a).

</details>

---

## 12. Repo / directory rename — it has outgrown "template + scaffolder"

**Status**: idea, unblocked earlier than written. It was gated on #10 and #11 stabilising; both
are now actionable, so this can move sooner.

**What this repo actually is** (recording the framing so it survives a compact — it previously
lived only in a chat transcript, which this repo's own rules forbid): three things at once —
a **framework/SDK** (the published kits + `robustness`), a **schematics-style generator and
migrator** (`mcp-scaffold`: `init` / `apply` / `migrate` / `add-mcp-app`), and a **golden
reference implementation** (`apps/example-repo-mcp` + the tracked `example/` output, which IS the
thing being scaffolded). The jargon: "scaffolder/generator" and "schematics/migrations" are
Angular/Nx vocabulary; "golden master / reference implementation" covers `example/`.
Closest analogues: Nx, Angular CLI + Schematics + `ng update`, RedwoodJS/Blitz, Copier,
`create-t3-turbo`.

**Naming directions**: `create-mcp` if the generator leads (matches the `create-*` convention
users already expect from `npm create`); `mcp-forge` or `mcp-stack` if the framework leads.
The current name undersells it — "template" implies a static copy, which is the one thing it
is not.

**Cost**: the rename itself is cheap (repo + directory); the cost is every absolute reference —
`repository.url` in four publishable manifests (which `check-publishable-manifests.mjs` pins
case-exactly), the Trusted Publisher config on npmjs.com for three packages, and the golden
`lib/` mirrors. Do it in one pass, not incrementally.

---

## 13. RESOLVED — Local validation for `.github/workflows/*.yml`

**Status**: ✅ **RESOLVED 2026-08-10.** `actionlint` 1.7.7 is pinned in `mise.toml` and runs as
`pnpm check:workflows` over ALL THREE workflow surfaces — `.github/`, `12-ci-release/lib/` and
`example/` — wired into `pnpm verify` and CI.

It found two real `SC2086` issues immediately: unquoted `$DIFF_RANGE` in `readme-check.yml`, on
both the PR and push paths. Fixed, so the check is a gate rather than advisory.

**Original entry follows.**

## 13 (original). Local validation for `.github/workflows/*.yml`

**Status**: not started, deliberately. Nothing in the repo parses workflow YAML, so a
malformed workflow is only discovered by pushing it — and it surfaces as an opaque 0-second
run with no logs (field-note 28). A `scripts/check-workflows.mjs` wired into `pnpm verify`
would catch it pre-push, but it needs a YAML parser dependency the repo does not carry, and
CI already reports the failure within 15 seconds.

**Trigger to action**: if this bites a second time, or if a YAML parser arrives in the
dependency graph for another reason. Would also be a natural home for asserting release-job
invariants (every publishable package has a job; jobs stay chained via `needs`).

---

## 14. `@george43g/robustness` — two verified singleton bugs (P0, published)

**Status**: ✅ FIXED 2026-08-09 on `fix/robustness-reconfigure`. Both controllers gained
`reconfigure()`, and `installShutdownHandlers` / `installWatchdog` now apply options in place
instead of replacing the controller. Registered cleanups, memory-sample subscribers, and
accumulated watchdog state survive; options merge across repeated calls; both validate before
mutating; the watchdog re-arms live timers only when a timer-shaping value changed and refuses to
reconfigure once a kill is in flight. The singleton layer — previously untested, which is why
these shipped — now has tests, and the three `docs/repros/` scripts pass. Released as
**`@george43g/robustness@0.2.1`** (tag `robustness-v0.2.1`, cut by CI over OIDC from PR #9) and
verified from a scratch project outside the workspace; `tui-kit@0.1.1` installs against it with no
peer warnings, which is what the patch-not-minor decision was for.
Full record: [`docs/plans/2026-08-robustness-reconfigure.md`](docs/plans/2026-08-robustness-reconfigure.md).

<details><summary>original note</summary>

**Status**: VERIFIED, not fixed. Both are in `robustness@0.2.0`, live on npm. Found by audit
2026-08-09, independently reproduced twice, and independently re-found by the EQStack parity
audit (its D1/D5). Repro scripts are checked in at `docs/repros/`.

**Shared root cause: replace-instead-of-reconfigure.** Both APIs throw away consumer-registered
state when handed options, silently.

**14a — `installShutdownHandlers(opts)` discards every already-registered cleanup.**
`packages/robustness/src/shutdown.ts:233-239` calls `dispose()` and builds a NEW controller,
whose `registry` Set starts empty. Proven with a control pair (`docs/repros/robustness-b2-*.mjs`):
identical scripts, the only difference being whether one option is passed —
`cleanup-ran=1` without options, `cleanup-ran=0` with. The trigger is "did you pass an object",
not "did anything change", so `installShutdownHandlers({ forceExitAfterMs: 3000 })` (semantically
the default) nukes the registry.
*Cross-package impact*: `tui-kit`'s `renderFullScreen` calls `registerCleanup` — so a consumer who
mounts the TUI then configures shutdown loses terminal restore and is left in an alternate screen
buffer with a raw-mode TTY on Ctrl-C.

**14b — `installWatchdog(opts)` silently ignores options if anything read watchdog state first.**
`packages/robustness/src/watchdog.ts:416-425` — the lazy singleton is first-call-wins, and
`readWatchdogState()` / `noteActivity()` / `onMemorySample()` all construct it with NO options.
Proven (`docs/repros/robustness-b1.mjs`): `onDiagnostic honoured after install: false`.
*Cross-package impact*: `tui-kit`'s `useDevStats` calls `readWatchdogState()` **during render**, so
a consumer following tui-kit's own README gets `idleRestart: true` — an interactive TUI that
self-kills after 24h idle — and no diagnostic, because `onDiagnostic` was dropped too.

**Why not fixed in the same session**: the correct fix is `reconfigure()` on both controllers so
state survives, which for the watchdog means re-arming live timers in a library whose job is
killing the process. That deserves its own change with tests, not a tail-end patch. Note the naive
fix (dispose + recreate) is exactly what causes 14a, and would break `onMemorySample` subscribers
the same way.

**Also fix while in there**: the singleton convenience API is entirely untested — which is why
these survived. See #15.

</details>

---

## 15. Published-kit quality gaps found in the pre-adoption sweep (2026-08-09)

**Status**: ✅ **DONE 2026-08-09** — coverage infrastructure (PR #18) and the API-shape items
(PR #19; released as robustness 0.4.0 / cli-kit 0.2.0 / tui-kit 0.2.0). Two residuals live
elsewhere: `installShutdownHandlers`'s process-wide `unhandledRejection` suppression (16a
territory), and the v8 function/branch inflation note below (provider swap is an open option).

- ~~**Coverage gates are fiction.**~~ **RESOLVED.** `@vitest/coverage-v8` is installed in all nine
  test-running workspaces, `test:coverage` exists everywhere, `pnpm verify` runs it instead of
  plain `test`, and CI's test step is now the coverage step. `.tsx` is included in both the test
  and coverage globs.

  What the first-ever run found, beyond "they never executed":

  | workspace | stmts | branch | funcs | lines | vs target |
  |---|---|---|---|---|---|
  | robustness | 78.29 | 81.25 | 79.59 | 78.29 | short 1.7 on stmts |
  | cli-kit | 25.47 | 82.35 | 64.28 | 25.47 | far short |
  | tui-kit | 31.49 | 86.30 | 81.57 | 31.49 | far short (19.57 before MemoryCache tests) |
  | mcp-kit | 83.43 | 75.53 | 95.23 | 83.43 | meets 80/70/70/70 |
  | shared-types | 100 | 100 | 100 | 100 | meets |
  | secret-store | 85.53 | 79.01 | 91.30 | 85.53 | meets |
  | example-repo-mcp | 29.83 | 79.59 | 92.85 | 29.83 | short of 50/40/40/40 |
  | mcpsync | 53.44 | 86.45 | 78.67 | 53.44 | meets |
  | scaffolder | 86.63 | 80.76 | 85.45 | 86.63 | meets, by a wide margin |

  Two of those numbers were wrong for structural reasons, and both are fixed:

  - **`shared-types` measured 0/0/0/0.** The preset excluded `src/**/index.ts` as "a barrel", but
    that package's entire implementation lives there. The file set was empty, so it reported zero
    with no rows and no threshold error. Barrel exclusions are gone — including a real barrel
    costs ~nothing, excluding a real implementation removes it from the gate.
  - **The scaffolder measured ~50%, and is actually 86.6%.** `src/phases/**/lib/**` — the template
    payload, byte copies of the golden output that the scaffolder never executes — was in the
    coverage denominator at 0%. It was excluded from test discovery but not from coverage.

  Workspaces below target now carry an explicit `withCoverageFloor()` set to what they measure.
  A floor is a ratchet, not a target: it fails on regression, and the distance to the preset above
  it is the visible debt. Raising 80/70/70/70 everywhere would have meant a red build; deleting it
  would have meant no gate. `ink-testing-library` remains an unreferenced devDependency of tui-kit.

  Verified the gate discriminates: a 200-line uncovered file dropped secret-store to 46.83% and
  exited 1; removing it returned exit 0.
- **Test-to-export coverage of the published surface**: cli-kit 4/16, tui-kit 6/25,
  robustness 21/40. The untested robustness region was precisely the singleton API where #14 lived
  — `installShutdownHandlers` / `installWatchdog` and the `reconfigure()` paths are now covered
  (2026-08-09), but the rest of the singleton surface still is not.
  `runRepl` (85 lines, hand-rolled tokenizer) and `useVimKeys` have no tests at all — deliberately,
  since 16a replaces both and tests written today would be deleted with the code they cover.
  `MemoryCache` now has 12 (2026-08-09), taking that file to 93%; the uncovered remainder is the
  `pressureMb` branch, which needs `installWatchdog()` and therefore a `_resetForTests()` the
  robustness barrel does not export.
- ~~**API-shape items that are a major bump after adoption**~~ **RESOLVED 2026-08-09** (cli-kit
  0.2.0, tui-kit 0.2.0 — `feat:` minor, because a caret on a `0.x` pins the MINOR, so nobody on
  `^0.1.0` auto-upgrades). `commander` is a peerDependency of cli-kit; `FullScreenHandle` is
  exported; `MouseEvent` is renamed `TuiMouseEvent` (it shadowed the DOM global for any consumer
  compiling with `lib: ["dom"]`); dead `FullScreenInkProps` is gone; `brighten` is fixed.

  **Correction to the original finding**: it said tui-kit's `export *` barrels "widen the public
  API with no review". Only `src/index.ts` uses `export *`, and it re-exports three *curated*
  sub-barrels that are all explicit named exports — so nothing is ever auto-exported from a source
  file. The hazard is narrower than recorded: adding to a sub-barrel widens the surface silently.

  **`brighten` was a behaviour bug, not a shape nit.** It computed
  `withL(hex, 0.5 + stops * 0.05)` — an absolute lightness from `stops` alone, discarding the
  input colour. Every hover state in a palette came back the same lightness, and anything above
  L=0.55 got *darker* from a function called "brighten". Now relative. Six tests pin it; three of
  them fail against the old implementation.
- **Module-load-time env reads** in `retry.ts`, `rate-limit.ts`, `logger.ts` defeat cli-kit's
  `applyEnvFromFlags` contract — 9 documented knobs silently ignore their CLI flags.
- ~~**`_resetForTests()` is in the published `.d.ts`**~~ **RESOLVED** — `stripInternal: true` in
  `packages/tsconfig/base.json`. All three already carried `@internal`, so nothing else was needed;
  the runtime export remains, only the declaration is gone. **Still open**:
  `installShutdownHandlers` installs a process-wide `unhandledRejection` handler that suppresses
  Node's default throw behaviour for the whole consumer app.
- ~~Source maps ship but `src` does not~~ **RESOLVED** — all four published packages now list
  `src` in `files` with test files excluded. Verified via `npm pack --dry-run`: robustness 48
  files / 9 src, cli-kit 38 / 7, tui-kit 88 / 17, secret-store 28 / 5, zero test files leaked.
- **Module-load-time env reads** — ~~9 knobs silently ignore their CLI flags~~ **RESOLVED**. See
  the entry above; `retry.ts`, `rate-limit.ts` and `logger.ts` now read on use.
- **NEW, found while building the gate: v8 inflates function/branch coverage for files it never
  loads.** An untouched file reports 0% statements but **100% functions** — visible in tui-kit's
  per-file table for `useMouse.ts`, `useVimKeys.ts` and `glyphs.ts`. So on a package with large
  untouched regions the statements and lines figures are honest while branches and functions are
  optimistic, and they FALL toward the truth as files get tested: covering `palette.ts` replaced
  its notional 100% functions with its real 33%, dropping the package total from 81.57% to 77.5%
  *while coverage genuinely improved*. Consequence: a function/branch floor on a sparsely-tested
  package will fight the very changes that improve it. Worth evaluating the istanbul provider,
  which instruments ahead of time and does not have this blind spot.

---

## 16. SPLIT 2026-08-09 → 16a (kit-side, ours) / 16b (EQStack adoption, theirs)

Originally "EQStack migration is BLOCKED on upstream work in the kits" — one item conflating
changes to our published kits with work that belongs on EQStack's backlog, executed by EQStack's
agent, in EQStack's repo. We never touch that repo. EQStack's `apps/imsg-mcp` is the only real
consumer (`analysis` is a 13-line shell; `voice-mcp` overlaps only weakly).

### 16a — kit-side upstreaming (OURS)

**Executed 2026-08-09** (`feat/16a-kit-hardening`; ships as robustness minor + tui-kit minor):

1. ✅ **Logger file-write opt-out** (old gap 1). `MCP_LOG_TO_FILE=0` or `setFileLogging(false)`;
   default stays ON so generated servers keep their post-mortem trail. Programmatic override
   beats env; both read at call time (the `applyEnvFromFlags` contract).
2. ✅ **Sync `writeStderrLine` + stderr mirror** (old gap 2). `writeSync(2, ...)` so a crash
   microseconds later still leaves the line in the MCP host's connection log; `setStderrMirror(true)`
   mirrors info/warn/error (perf excluded). Wired in the example app's stdio branch — never the TUI.
3. ✅ **Redaction** (from the "worth upstreaming" list). `redactString`/`redactValue`/`lastFour`
   lifted from voice-mcp's `domain/redact.ts` with a cycle guard added (logger hot path must never
   throw). Logger redacts msg+data in every sink **by default**; `MCP_LOG_REDACT=0` or
   `setLogRedaction(false)` opts out. Also hardened emit with `safeStringify` — circular or BigInt
   data used to throw straight through `info()`.
4. ✅ **Default shutdown diagnostics** (old gap 3). When `onDiagnostic` is not wired, a default
   sink logs every event and writes error-level events to stderr synchronously. Before this,
   installing handlers made crashes *completely* silent: an `uncaughtException` listener suppresses
   Node's own stderr report, so an unwired consumer lost the trail entirely.
5. ✅ **`unhandledRejection` exits by default** (the #15 residual, now closed).
   `exitOnUnhandledRejection?: boolean`, default true — merely installing the observer listener
   used to suppress Node's platform default of treating unhandled rejections as fatal, for the
   whole consumer app. TUIs disable it alongside `exitOnUncaughtException`.
6. ✅ **`useDevStats(visible)`** (old gap 5 — kit-side, so it belongs here, not in 16b).
   Hidden mode rides the watchdog's 60s `onMemorySample` instead of a 2s interval — the 2s
   setState on a hidden panel re-rendered the whole Ink app 30×/min forever, measured at
   ~17-20MB/min heap churn in two real `rss_exceeded` kills (2026-07-12). Also fixed a per-render
   effect re-init defect, and threaded `visible` through `DevStatsPanel`, which shipped the exact
   OOM pattern itself.

**REOPENED AND FIXED 2026-08-09 — this entry previously closed a real bug on a false claim**:
- **Replace `runRepl` with a queue-based loop** (old gap 4). This was closed with the sentence
  *"20 contract tests drive the loop over piped multi-command input, which would fail on
  truncation."* **That claim was false.** All eleven `runScript(...)` calls in
  `packages/cli-kit/src/repl.test.ts` passed exactly ONE line
  (`repl.test.ts:119,125,133,139,146,159,167,174,180,189,194`). The multi-command piped case was
  never tested at any point. EQStack's original report of an EOF race truncating piped input was
  correct, and it was dismissed on the strength of evidence that was never checked.
- **The bug was real and a second consumer hit it.** `rl.question()` arms a ONE-SHOT listener, so
  while an async command was awaited no listener existed and every line readline had already
  buffered from a pipe was emitted into nothing. `printf 'help\ntools\nquit\n' | <bin> console`
  ran only `help`; EOF then closed cleanly, hiding the loss. up-bank-mcp hit it against the
  published tarball and carried a skipped test waiting on the fix.
- **Why the suite passed anyway**: `fakeDispatcher.listTools` was synchronous and `callTool`
  resolved immediately, so every `await` settled on the microtask queue before readline could emit
  another line. See #26 — the general lesson, which this shares with #24 one day earlier.
- **Fixed** (PR #26, ships as a cli-kit minor): serial line queue, a deliberately hostile
  `slowDispatcher` that yields to the macrotask queue, six multi-command cases, and a real-pipe
  end-to-end test in the example app. Every new test was observed FAILING against the old loop
  before the fix was trusted — the step skipped the first time.
- **The rule this earns**: a closure that cites tests as evidence must name the test file and
  line. "N tests cover this" is not evidence; it is a claim that costs one `grep` to check and, in
  this case, was wrong.

**Still open in 16a — needs EQStack-side agreement, not just our decision**:
- Theme model (old gap 6): imsg's flat `Theme extends Palette` (~30 domain keys derived from the
  accent hue) vs tui-kit's nested `{palette,glyphs,preset,accent}` with hard-coded neutrals; ~19
  components read `theme.<domainKey>` directly.
- `useVimKeys` double-dispatch (old gap 7): it registers its own `useInput` and would fight imsg's
  mode-aware handler; `StatusBar`/`HelpBar`/`DevStatsPanel` are same-name-different-component.
- Remaining upstream candidates (ranked): log-level filtering; a Prometheus metrics module;
  `--yaml` output; grapheme-aware `visual-width.ts`; `detectNerdFont()`, which complements
  `GLYPH_PRESETS.powerline` (today it can silently render blanks).

**Trigger**: EQStack's agent proposes concrete contracts (see 16b), or the next tui-kit consumer
hits the theme model.

### 16b — EQStack adoption (THEIRS)

Belongs on EQStack's backlog, in EQStack's repo. **The handoff brief now exists**:
[`docs/agent-handoff/EQSTACK-16B-BRIEF.md`](docs/agent-handoff/EQSTACK-16B-BRIEF.md) plus the
paste-able [`EQSTACK-16B-MESSAGE.md`](docs/agent-handoff/EQSTACK-16B-MESSAGE.md), mirroring the
convention `browser-tab-mcp` used to reach us. Recording 16b only in this file was a gap: an
EQStack agent never reads our backlog.

**Re-verified against EQStack's tree 2026-08-09, and FIVE earlier claims here were wrong.** The
corrections matter because acting on the old numbers wastes their time:

1. **Version floors** — said "bump `ink@7.0.1`/`react@19.2.5` to our `^7.1.1`/`^19.2.8`". Their
   *declared* carets already admit our floors; only the resolved lockfile violates them. It is
   `pnpm up ink react -r`, not a manifest edit.
2. **Theme model** — said "~19 components". It is **21 files and 391 `theme.<key>` read sites**,
   with 26 flat keys (many nested objects) vs our 18. Also missed: three keys collide with
   DIFFERENT types (`info`, `pending`), and both `ThemeProvider` and `GlyphSet` are incompatible.
3. **`DevStatsPanel` collides** — it does not exist in EQStack at all. Theirs is `DevStats`, a
   presentational component taking `stats` as a prop; ours calls the hook itself. Unnoticed
   before: `useDevStats` DOES collide, and our `DevStats` *interface* collides with their
   `DevStats` *component*.
4. **"imsg logs failure payloads verbatim" / imsg's `redact.ts`** — `apps/imsg-mcp` has **no
   redaction at all** (zero matches). The `redact.ts` we lifted is voice-mcp's, and ours is now a
   strict superset (cycle guard). Adopting ours loses them nothing.
5. **Log-level filtering** — attributed to imsg; it is voice-mcp's only.

**Watchdog parity CONFIRMED**: all 12 env names and all 12 defaults match, parsing helper
behaviourally identical, and no imsg capability the kit lacks. `IMSG_HEAP_GROWTH_MIN_MB` is a new
env surface over their hardcoded 25 (same effective default).

**A kit bug their code found** — see #24. Our `dispose()` cleared the watchdog's force-exit timer,
and `dispose` IS the registered shutdown cleanup, so a kill disarmed its own last-resort net.
Fixed in robustness 0.5.2; on 0.5.1 the trap is live.

**Blockers removed by 16a**: file logging is now opt-out (`setFileLogging(false)` replaces the
`IMSG_DEV` gate); `writeStderrLine`/`setStderrMirror` replace imsg's local writer; shutdown keeps
a crash trail without wiring `onDiagnostic`; redaction ships in the kit.

**Two migration traps to flag, both in the brief**: the kit's watchdog logs through OUR logger
(`MCP_LOG_*`), so `watchdog_kill` and the RSS forensics vanish from their ring buffer unless
`onDiagnostic` is wired in the same commit; and their `tests/watchdog-sleep-skew.test.ts` is a
source-TEXT test (`readFileSync` + regex on our literal) that cannot survive a re-export.

**Recommended order**: lockfile → watchdog (wire `onDiagnostic`) → shutdown (`exitOnUnhandledRejection: false`
+ `exitOnUncaughtException: false` for the TUI; decide which module owns the force-exit net) →
color.ts + useMouse → withTimeout/withRetry/TokenBucket → logger. Stop before theme/`useVimKeys`.

**Wanted FROM them** (verified present there, absent here): grapheme-aware `visual-width.ts`,
`detectNerdFont()` (complements `GLYPH_PRESETS.powerline`, which can silently render blanks),
`--yaml` output, voice-mcp's Prometheus metrics, voice-mcp's log-level filtering.

---

## 17. RESOLVED — `regen:example` was defined twice

**Status**: fixed 2026-08-09. One definition now lives in `scripts/regen-example.mjs`, called by
`package.json`'s `regen:example`, by `ci.yml`'s sync check, and by the release workflow's resync
(#22). Verified the extraction is behaviour-preserving: `pnpm regen:example` against the new
script produced a byte-identical `example/` (zero diff).

The residual half is still open and deliberately so: **`pnpm verify` does not run the `example/`
sync check**, so a green local `verify` is still not evidence for this class of failure. Adding it
costs a full scaffolder build on every local run, which is a real tax on the inner loop. #22's
automation removes most of the need — the release now resyncs itself, so the common trigger for
local drift is gone.

**Original finding:**

`package.json`'s `regen:example` writes into the repo. `.github/workflows/ci.yml`'s "Example/
output stays in sync" step re-implements the same sequence against a tempdir, because the
script cannot be reused as-is. Adding the scaffolder's install step to one and not the other
made CI's tempdir grow a `pnpm-lock.yaml` the committed snapshot lacks — CI failed on a repo
that was genuinely in sync, while `pnpm regen:example` locally showed zero drift.

Compounding it: **`pnpm verify` does not include the `example/` sync check** — it is CI-only.
That means a green local `verify` is not evidence for this class of failure, and it bit twice
in one session.

**Fix**: extract one parameterised script (`scripts/regen-example.mjs <target>`) that both the
package script and the workflow call. Optionally add the comparison to `verify`; the reason it
was not done unilaterally is that it costs a full scaffolder build on every local run, which is
a real tax on the inner loop and the owner's call.

**Trigger**: next time either definition changes, or the next time CI disagrees with a local
`regen:example`.

---

## Out-of-scope (don't lift)

These are imsg-mcp-specific items from `glowing-percolating-key.md`. They stay in imsg-mcp:

- iMessage → SMS auto-fallback
- thefuzz-style fuzzy search
- chat_analytics consolidated tool with cache
- URL-scheme integration (sms://, imessage://, etc.)
- contact:N disambiguation selector
- HEIC → PNG conversion for attachments

---

## mcpsync — issues found in downstream use (life-stack, 2026-08-05) — ALL RESOLVED

Surfaced while using `mcpsync -c ./.mcp.json apply --scope project --to opencode`
to reconcile a repo's `opencode.json` after removing a server from its
`.mcp.json` (replacing the retired `~/dotfiles/mcp/render.js`). **The core
reconcile was correct**: the written server set matched the manifest, `env`
`${VAR}` was converted to opencode's `{env:VAR}`, and no secret values were
inlined. All three minor items fixed on `fix/mcpsync-deferred-items` (2026-08-05):

1. **`apply --scope project` help text omits `opencode`.** ✓ RESOLVED — the
   `--scope` option help on `apply`/`sync` now reads
   `project (repo .mcp.json + .cursor/.warp/opencode)` and the `cli.ts` header
   comment lists `opencode.json`. (`README.md` already named it.)

2. **`opencode.json.bak.<timestamp>` backups accumulate.** ✓ RESOLVED — `backup()`
   now calls `pruneBackups(path, keep = 5)` after each copy (single choke point, so
   every host benefits), keeping only the 5 newest `.bak.<epoch>` siblings;
   `.gitignore` gained `*.bak.[0-9]*`. Proven live: 8 stale + 1 write → 5 survive.

3. **`${VAR}` inside `command`/`args` passed through verbatim.** ✓ RESOLVED —
   confirmed against opencode docs that `{env:VAR}` substitution applies to *all*
   config values (incl. the `command[]` array) and `${VAR}` is NOT understood, so
   the verbatim passthrough was a latent bug. `toOpencode`/`fromOpencode` now
   convert command/args like the env block; a `${SID}/${KEY}:${SECRET}` arg now
   resolves. (render.js behaved the same, but it's retired — no coexistence risk.)

---

## `imsg-mcp` → `EQStack` rename — doc references intentionally retained (2026-08-05)

The repo was renamed (on disk `~/repos/imsg-mcp` is now a symlink → `~/repos/EQStack`).
Only the one live "a server you'd retrofit" example in `README.md` was switched to the
current name. Every other `imsg-mcp` mention in this repo is deliberately kept — it is
**provenance** ("ported from imsg-mcp"), **dated history** (the 2026-07 retrofit
evaluation `docs/scaffolder-cli/evaluations/imsg-mcp-2026-07.md`, the rename record in the
plan docs), or a **test fixture** (an arbitrary unmanaged-server name in
`json-adapter.test.ts`). Renaming those would falsify the record, so they stand.

---

## Status snapshot at last update

Measured 2026-08-09 (previous snapshot was ~3 months stale and disagreed with
HANDOFF.md and PROJECT_STATE.md three different ways — see field-note 35).

**The counts below are ALSO stale and were never re-measured** — coverage now
runs, the scaffolder has more tests than listed, and `env-loader`/`secrets` were
retired (#11). Re-measure before quoting any of it; the note above about
disagreeing files applied to this block too, one round later.

- Published packages: **do not read a version number from this file.** This block
  said `robustness@0.2.1`, `cli-kit@0.1.0`, `tui-kit@0.1.1` for six days after
  robustness alone had shipped five more releases. Run:
  `for p in robustness cli-kit tui-kit secret-store; do npm view @george43g/$p version; done`
  `@george43g/mcpsync` is bootstrap-pending (`workflow_dispatch`-only) — that
  fact is stable, the numbers are not.
- Workspaces: 14 (excludes `example/**`)
- Scaffolder: 10 phases, 21 migrations, 13 test files (136 tests)
- Stress: 13 assertions
- Test files by workspace: scaffolder 12, mcpsync 17, robustness 8, mcp-kit 5,
  cli-kit 2, tui-kit 2, shared-types 2, env-loader 1, secrets 1,
  example-repo-mcp 1; `apps/rust-accel` has no `test` script at all.
- Coverage: thresholds declared but **never executed** — see item 15.
- CI gates: lint, docs integrity, publishable-manifest shape, typecheck, test,
  test:no-native, usage(1) freshness, npm pack dry-run, scaffolder E2E smoke,
  example/ sync, stress.

Counts that appear in HANDOFF.md / PROJECT_STATE.md / README.md are known to
disagree with each other; trust this block or re-measure.

---

## 18. RESOLVED — Build identity — every build between two releases is indistinguishable

**Status**: ✅ **RESOLVED 2026-08-10** per `docs/plans/2026-08-build-identity.md`, which was
followed as written. `--version`, the REPL banner and the TUI header now report
`<semver>+<count>.<sha>[.dirty.<MMDDTHHmm>]`.

**One improvement on the design.** The plan's prerequisite was `fetch-depth: 0` on the three
shallow workflows, because a depth-1 checkout makes `git rev-list --count HEAD` return `1`. That is
done — but the stamp ALSO probes `git rev-parse --is-shallow-repository` and reports `0` when the
checkout is shallow. Reproduced against a real `git clone --depth 1`: naive counting says `1`, the
stamp says `0`. A visible zero beats a believable lie, and it means a consumer who misses the
workflow fix gets an obviously-degraded stamp rather than a plausible wrong one.

**The open decision is settled**: the MCP handshake `version` (`index.ts`) stays **bare semver**. It
is a protocol field advertised to clients, which may compare or parse it, and `+build` metadata
means nothing to them. Diagnostics carry the stamp instead.

**Verified against the built artifact, not just the source:**
- the stamp appears as a string literal in `dist/`;
- it is stable across re-runs, so it describes the BUILD and not the current checkout;
- `dist/` contains no `execFileSync` reachable on the define path — no runtime recomputation.

`packages/build-config` is `private: true` and stays that way: Vite `define` is compile-time
substitution over BUNDLED modules, and the apps mark the kits external, so a published reader would
be permanently unsubstituted — degrading to a plausible fallback rather than erroring.

**Original entry follows.**

## 18 (original). Build identity — every build between two releases is indistinguishable

**Status**: designed, not started. Full design: [`docs/plans/2026-08-build-identity.md`](docs/plans/2026-08-build-identity.md).

Semver only moves on release, so there is no way to confirm that the artifact running is
the one you just built. It bites hardest with long-lived processes — a rebuilt-but-not-
reloaded bundle keeps reporting a perfectly plausible version. Downstream this happened
twice in one session, once to an agent that had just written the code.

Format `<semver>+<count>.<sha>[.dirty.<MMDDTHHmm>]`, e.g. `0.9.0+412.a1b2c3d`. Count comes
from `git rev-list --count HEAD` so it is monotonic and derived from history rather than a
committed counter — it survives clean checkouts and agrees between a laptop and CI.

**The reader cannot live in a published package.** Vite's `define` is textual substitution
over bundled modules only; anything `external` never passes through it. `@george43g/*` is
in `apps/example-repo-mcp/vite.config.ts`'s `external` list, and since PR #15 generated
repos install the kits from npm as real externals — so a `buildStamp()` exported from
`robustness` would read a `__BUILD_STAMP__` that is never replaced, and degrade to a
plausible-looking fallback rather than erroring. Build-time half goes in a new unpublished
`@george43g/build-config`; the reader stays in `src/meta.ts` as template code.

**Trigger to action**: any repo that ships a long-lived process alongside a separately
deployed client. Also worth doing before the next downstream adoption, since the value is
highest where two artifacts are built together and deployed apart.

**Blocking sub-task, do it in the same PR**: `.github/workflows/ci.yml:23`,
`cli-artifacts-drift.yml:35` and `screenshots.yml:26` check out at the default
`fetch-depth: 1`. `git rev-list --count HEAD` returns `1` on a shallow clone, so the first
CI build would ship a wrong-but-plausible count — precisely the failure this feature
exists to prevent. `release-packages.yml`, `release.yml` and `readme-check.yml` already
set `fetch-depth: 0`.

**Cost**: ~half a day including the four-surface sync (canonical → `lib/` → `example/`)
and a `03-configs` migration for the new package.

---

## 19. DECIDED — Revisit the generated release tooling: semantic-release vs release-please

**Status**: ✅ **DECIDED 2026-08-10 — switch the GENERATED default to release-please.** Implementation
ticketed as #36. This repo's own `release-packages.yml` stays on `semantic-release` and is out of
scope, exactly as the original entry insisted.

Its stated trigger was "pair it with #18", and #18 landed today.

**Two reasons, one of which is new evidence rather than preference:**

1. **The generated default carries a plugin most cloned tools never use.** `@semantic-release/npm`
   is in the shipped chain, while the common generated case is "I want releases and changelogs but
   I am not publishing to npm". release-please treats publishing as a job you simply never add.

2. **release-please makes the computed version visible BEFORE it is cut, and that is not a
   theoretical benefit here.** semantic-release publishes on merge, deriving the bump from commit
   text with no reviewable intermediate. That mechanism produced two unplanned majors in this repo
   on 2026-08-10 — `cli-kit@1.0.0` (a `!` whose 0.x consequence was unchecked, #34) and
   `cli-kit@2.0.0` (a `docs:` commit whose PROSE spelled the footer token, #35). A rolling Release
   PR shows "this will publish 2.0.0" as a diff someone can look at. Both incidents would have been
   caught by reading it.

   #35's guard now blocks the specific token, and #34 is a documented rule. But those are patches
   over a shape where the version is only observable after it is immutable, and a generated repo
   inherits that shape without inheriting the guards' history.

**Not changed**: this repo publishes four real packages over npm OIDC and is proven end-to-end.
Nothing here argues for touching it, and the `@anolilab/multi-semantic-release` `tagFormat` trap
recorded below remains the reason not to migrate it casually.

**Original entry follows.**

## 19 (original). Revisit the generated release tooling: semantic-release vs release-please

**Status**: open question, no decision. Raised 2026-08-09.

The scaffold ships `semantic-release` scaffolding for generated repos (disabled by
default; see [`docs/RELEASE.md`](docs/RELEASE.md)), which is npm-coupled through
`@semantic-release/npm`. Downstream has since chosen **release-please** instead:
conventional commits → a rolling Release PR → versions, changelog, tags and GitHub
Releases, with publishing as a job you simply never add.

**The distinction that matters, and that the question can easily blur:** this repo's own
`release-packages.yml` publishes four real packages to npm over OIDC and is proven
end-to-end — nothing here argues for changing that. The question is only about what the
scaffolder *generates* for a cloned tool, where "I want releases and changelogs but I am
not publishing to npm" is the common case and the current default carries an npm plugin
it will never use.

**A trap to avoid if this ever migrates to `@anolilab/multi-semantic-release`** (reported by
the EQStack agent 2026-08-09, who hit it in anger): msr **always overrides** a per-package
`.releaserc` `tagFormat`, defaulting to `${name}@${version}`. Their per-package tagFormat was
silently ignored, so the first real release run could not see their existing
`imsg-mcp-v1.19.2` tag baseline and computed **v1.0.0** — a wrong publish that was stopped only
by an unrelated `EUNSUPPORTEDPROTOCOL` failure in `@semantic-release/npm` (EQStack run
31304184401). They fixed it with a global `--tag-format '${name}-v${version}'` plus
`@anolilab/semantic-release-pnpm`.

We use `semantic-release-monorepo`, so **we are not affected today**. It is recorded here
because this item is exactly where a tooling migration would be decided, and the failure mode
is invisible until it publishes something wrong.

**Trigger to action**: pair it with DEFERRED #18 — both concern build/release identity,
and a reader comparing them will want one answer, not two. Independent otherwise: semver
answers "which release", the stamp answers "which build".

**Cost**: ~2h to swap the generated workflow + docs, most of it in `12-ci-release` and its
`lib/` mirror. Zero risk to this repo's own publishing.

---

## 20. RESOLVED — `check-publishable-manifests` cannot model comparator ranges, so the honest fix silences it

**Status**: ✅ **RESOLVED 2026-08-10.** `satisfiesLoose` is gone; the check now delegates to
`semver` via `scripts/lib/semver-range.mjs`, and both manifests carry `>=0.1.1 <1`.

Three things worth keeping from the fix:

- **The escape hatch hid a second defect nobody had noticed.** `if (!m) return true` was known to
  wave comparator ranges through. It also hid that the caret branch ignored the range's LOWER
  bound — `^1.2.0` compared only the major, so it admitted `1.1.9`. Found by the new test, not
  predicted by this entry.
- **The dependency call went the other way than this entry guessed.** "Roughly 30 lines" was
  wrong: a correct desugar (carets, tildes, comparators, hyphen ranges, partials, wildcards) is
  ~120 lines of exactly the logic that develops quiet bugs, in a checker whose failure mode is a
  silent false-pass. `semver` is now a root devDependency. Nothing ships in a tarball, so the
  no-dependency rule for published packages is untouched.
- **An unparseable range is now a failure, not an admission.** That is the actual repair — the old
  behaviour reported success without checking.

The script had no test at all, which is why the gap survived. `scripts/check-publishable-manifests.test.mjs`
is the first; all 33 cases were observed failing against the old implementation first (8 did). It
runs via node's built-in runner as `pnpm test:scripts`, wired into `pnpm verify` and CI ahead of
the check that depends on it.

**Original entry follows.**

**Status**: open. Found 2026-08-09 while fixing the fallout from an accidental `robustness@0.3.0`.

Every first-party sibling range is an explicit caret chain — `apps/mcpsync` and `packages/tui-kit`
currently declare `^0.1.1 || ^0.2.0 || ^0.3.0 || ^0.4.0` for `@george43g/robustness`. That chain
grows by one clause on every minor, forever, because a caret on a `0.x` pins the MINOR.

The natural fix is `>=0.1.1 <1` — these packages are released in lockstep from one repo, so "any
0.x" is the true contract. But `satisfiesLoose()` in `scripts/check-publishable-manifests.mjs`
returns `true` for any range it does not model (`>=`, `*`, `x`, `-`), deliberately, so as not to
guess. So switching would make the check *pass by opting out of itself* — it would stop verifying
the one thing it exists to verify.

**Fix**: teach `satisfiesLoose` to evaluate comparator ranges (`>=`, `>`, `<`, `<=`, and
hyphen/space-joined pairs), then switch first-party siblings to `>=<min> <1`. Roughly 30 lines plus
tests, or adopt a real semver dependency for that script — it is currently dependency-free by
design, which is worth preserving if the hand-rolled version stays small.

**Trigger to action**: the next time a robustness minor forces another manual `|| ^0.x` edit. That
edit is itself a commit inside published package directories, so it also risks tripping the
release trigger — see field notes 52 and 53.

**Cost**: ~1h including tests. Low risk: the check is advisory-at-worst today for these ranges.

---

## 21. Downstream kit defects reported by `browser-tab-mcp` (2026-08-09)

**Status**: Class A ✅ **DONE** (cli-kit + tui-kit, shipping in the same release as #15's API-shape
work). Class B partly done, partly open — see below.

A consumer scaffolded from this template dogfooded the published kits and reported six items. All
were re-verified against this repo's source before acting; three needed correcting.

**Class A — published packages, was blocking the consumer**

1. ✅ `cli-kit` `parseConsoleInput` consumed every quote character as shell quoting, so
   `raw {"name":"x"}` reached `JSON.parse` as `{name:x}`. No backslash handling either, so there
   was no escape hatch. Fixed by separating the two jobs the function was conflating: it now
   returns `{ cmd, rest, args }`, where `rest` is the remainder verbatim (read JSON from it) and
   `args` is the shell-style split (for positional shortcuts).
2. ✅ `runRepl` never implemented the `<tool> <json>` dispatch its own docblock promised, while
   `help` listed every tool under "Available MCP tools:". Rather than trim the advertisement, the
   dispatch is now real, so `raw` is a fallback instead of the only route.
3. ✅ `tui-kit` had no terminal-size hook, so every consumer slicing a scroll window hardcoded a
   height. Added `useTerminalSize()` plus a pure `viewport.ts` (`viewportRows`, `visibleWindow`).

   **Corrections to the report**: (a) the unknown-command throw is at `repl.ts:169`, not 173;
   (b) a *third* bug nobody had spotted — the parser lowercased the command word, so any tool with
   an uppercase letter was permanently unreachable; (c) the "18 advertised vs 3 callable" figure is
   the consumer's own tool count — in this repo it was 3 listed / 2 callable, with `get_logs`
   unreachable. Also fixed while in there: `runRepl` never resolved on EOF, so piped input hung the
   process — which is also what made it untestable.

   The tests are written against the **contract**, not the readline loop — at the time #16a still
   planned to replace that loop. The replacement has since been re-evaluated and closed (see #16a);
   the contract tests are what made that closure safe to decide, and they still bind any future
   swap. That supersedes #15's note that repl tests were deliberately skipped pending the rewrite:
   a blocked consumer outranks a rewrite with no date.

**Class B — template source**

4. Build identity — see [`docs/plans/2026-08-build-identity.md`](docs/plans/2026-08-build-identity.md)
   and **#18**. The consumer independently confirmed the "never put the reader in a published
   package" constraint and supplied the injection-shaped alternative
   (`formatBuildStamp` / `setBuildStamp`).
5. **OPEN — `turbo.json` can replay a stale build stamp.** Verified accurate but currently *latent*:
   no git stamp exists in this repo yet, so there is nothing to go stale. Two independent holes.
   (a) `tasks.build.inputs` has no git state, so a docs-only commit replays a cached `dist/`.
   (b) `globalDependencies` is `[".env.example", "tsconfig.json", "biome.json"]` — no `scripts/**`,
   so editing a root generator invalidates nothing. Note the two `scripts` entries already in
   `turbo.json` are *package-relative* (`tasks.lint.inputs`, `tasks.stress.inputs`), not the root
   directory. **Fix (b) unconditionally; fix (a) in the same PR as #18**, or the first stamped CI
   build ships a wrong-but-plausible sha. Options for (a), cheapest first: export
   `BUILD_STAMP=$(node scripts/build-stamp.mjs --print)` and list `"env": ["BUILD_STAMP"]` on the
   build task (every commit busts the build cache — that is the point, but it is not free);
   key on sha only and accept two dirty builds sharing an entry; or `"cache": false` on `build`,
   which throws the speed win away. The reference `build-stamp.mjs` has **no `--print` flag yet** —
   the first option needs one added.
6. ✅ **Already fixed before the report arrived.** `vitest.shared.ts` was said to read
   `include: [..., "tests/**/*.test.ts"]`, dropping `tests/**/*.test.tsx`. PR #18 had already
   changed it to `tests/**/*.test.{ts,tsx}`, which covers both. No action.

7. ✅ **`resolveOutputMode` had no way to force human output** — DONE 2026-08-09.
   **This item was mis-recorded here and nearly lost.** The line below used to read "Explicitly
   NOT wanted: `output.ts` and `env-flag-binder.ts` were reviewed and declared correct… No API
   change there." That conflated two different sections of the consumer's brief: their §4 said no
   change was wanted *to adopt* those helpers, but their §5 was an explicit **"Asked for:"** — an
   opt-in that outranks the implicit signals. Reading only the summary message (not the full
   brief) is how the request went missing; it was found later by opening
   `UPSTREAM-KIT-BRIEF.md` itself.

   The gap: `resolveOutputMode` returned `"json"` for `--json`, a non-TTY stdout, **or** `CI=true`,
   with no inverse — so the human view was unreachable the moment stdout was not a terminal.
   `mytool list | less` was impossible, and the consumer had to run their CLI under a pty
   (`script -q /dev/null …`) just to see their own renderer.

   Fixed additively: `human?: boolean` on `OutputFlags` plus a `FORCE_HUMAN` env opt-in, both
   ranking above the inferred TTY/CI signals and below an explicit `json`. Existing behaviour is
   unchanged when neither is set. 14 tests; 4 of them fail if the feature line is removed.

**Versioning constraint (their §4, PR #26 update)**: `resolveOutputMode`, `printJson`,
`bindEnvFlags` and `applyEnvFromFlags` are now on browser-tab's hot path for every read command.
Treat them as **load-bearing**: a behaviour change to output-mode precedence or to flag-name
derivation (strip prefix → lowercase → `_`→`-`) is a BREAKING change for that consumer, not a
patch. `env-flag-binder.ts` itself was reviewed and needs no change.

**Trigger for the rest**: #18 lands → do turbo (a) with it. (b) can go any time.

---

## 22. RESOLVED — every release made `example/` stale, and nothing caught it until the next push

**Status**: fixed 2026-08-09 (PR #29). The release workflow now regenerates and commits `example/`
itself; proven on its first two real runs. The resolution detail is at the end of this entry — the
analysis above it is kept because it is why the chosen option was chosen.

Generated dependency ranges are DERIVED from `packages/*/package.json` at build time (that was the
fix for field-note 43 — hand-written ranges rot silently). So the moment semantic-release bumps a
package, `apps/scaffolder/src/generated/published-versions.ts` yields a new range and the committed
`example/` snapshot — which pins the OLD one — no longer matches what the scaffolder emits.

The gap is a timing one. Release jobs push their version bump with `[skip ci]`, deliberately, to
avoid a release loop. That also means CI never runs on the bump commit, so the stale `example/` is
not detected then. It surfaces on the *next* unrelated PR, as an `example/ is stale` failure with
nothing in that PR to explain it — a confusing signal pointing at innocent work.

Worked around by hand each time (`pnpm regen:example` + a resync PR). Real fixes, cheapest first:

- Have the last release job run `pnpm regen:example` and include `example/` in its `[skip ci]`
  commit. Keeps one source of truth; adds a scaffolder build to every release.
- Stop pinning derived ranges in `example/` at all — emit `workspace:*` there and let the sync
  check ignore the range line. Loses fidelity: `example/` is supposed to be byte-identical to real
  output.
- Accept it and make the failure self-explaining: have the sync check detect that the only diff is
  a derived range and print "a release bumped a package — run `pnpm regen:example`".

**Trigger to action**: the next release. This will recur every single time until fixed.

**Cost**: ~1h for the first option, which is the one that actually removes the manual step.

**Evidence update (2026-08-09)**: paid by hand **three times in a single session** — after PR #19's
four release bumps, after 16a's robustness 0.5.0 + tui-kit 0.3.0, and after the exports patch's
four `.1` bumps. Each time it is a `pnpm regen:example` plus a PR that exists only to carry
generated churn. That makes this the highest-frequency manual step in the repo. It was still not
fixed unilaterally because the first option edits the release pipeline, and a broken release
workflow blocks publishing — the owner's call. But nothing about the analysis is open any more.

**RESOLVED 2026-08-09.** The `secret-store` release job now regenerates `example/` and commits it
(`chore(example): resync generated output after release`). Notes for whoever reads the workflow:

- It hangs off **secret-store**, the last job to run on a push (`mcpsync` is
  `workflow_dispatch`-only), so by then the tree holds every bump from the run. A new job depending
  on `mcpsync` would be *skipped* on push — exactly when it is needed.
- The regen passes `--build`. `pnpm verify` builds the scaffolder BEFORE semantic-release bumps
  anything, so that dist embeds the old ranges; skipping the rebuild would commit stale output and
  look like it worked.
- It uses `git pull --rebase origin main` before pushing, which the `screenshots.yml` pattern it is
  otherwise modelled on lacks. `main` is unprotected and a human merge can land between checkout
  and push.
- A `git status --porcelain` guard means a no-op run commits nothing.
- No loop: `example/**` is absent from the workflow's `paths:` filter, and `GITHUB_TOKEN` pushes do
  not re-trigger workflows.
- `example/` is NOT added to `@semantic-release/git`'s assets — those are package-relative and
  would break monorepo path scoping. It has to be a separate commit step.

---

## 23. RESOLVED — Generated-app source cannot use a kit API in the same PR that adds it

**Status**: ✅ **RESOLVED 2026-08-10.** `pnpm check:registry-boundary` compares every named
`@george43g/*` import under `apps/example-repo-mcp/src/**` against the package's surface **at its
release tag**, and fails with a message that names the split-the-PR fix.

**Why tags rather than the registry or the store.** semantic-release commits the version bump back
and tags `<pkg>-v<version>`, so the tree at that tag IS the published source — it answers exactly
"does the released version export this?" with no network call. The first attempt read the pnpm
store instead and silently skipped everything, because the workspace uses `workspace:*` links and
holds no published tarballs. That version "passed" while checking nothing, which is the same
failure this repo fixed in the manifest checker.

**One subtlety worth keeping**: a flat text match on the barrel reports every re-exported symbol as
unpublished, because `tui-kit/src/index.ts` is mostly `export * from "./components/index.js"`. The
check follows those wildcards. Without that it produced 7 false positives on the first run.

Verified both directions: passes on the current tree, and fails on an injected import of a
nonexistent export.

**Original entry follows.**

## 23 (original). Generated-app source cannot use a kit API in the same PR that adds it

**Status**: discovered 2026-08-09 by CI failing PR #21 (the 16a kit hardening) on both matrix legs.

The registry-only runtime boundary (decided 2026-08-09) means the scaffolder E2E smoke installs
`@george43g/robustness` **from npm**, not from the workspace. So `apps/example-repo-mcp/src/` —
which is mirrored into `08-app/lib/` and becomes the generated app's source — may only call kit
APIs that are **already published**. Adding `setStderrMirror` to robustness and calling it from
the example app in the same PR typechecks locally (workspace resolution) and fails in the smoke
with `TS2305: Module '@george43g/robustness' has no exported member 'setStderrMirror'`.

`pnpm verify` cannot catch this: it resolves everything through the workspace. Only the E2E smoke,
which installs from the registry, sees the real dependency graph a generated repo gets.

**The rule**: a new kit API and its generated-app call site are **two PRs**, in that order —
publish first, wire second.

**Updated 2026-08-09**: this used to add "landing the call site in the post-release `example/`
resync PR (see #22) is free, since that PR has to happen anyway." **That is no longer true.** #22
is automated, so there is no longer a human-authored resync PR to piggyback on — the release
commits `example/` itself. A deferred call site now needs its own follow-up PR, which means it
needs to be *recorded* rather than remembered.

**Deferred call site**: `setStderrMirror(true)` in the stdio branch of
`apps/example-repo-mcp/src/index.ts` (mirror `08-app/lib/src/index.ts`, then `regen:example`).
It was written, reverted from PR #21, and is waiting on robustness `0.5.0` reaching npm.

**Fix options** (the rule works, but it is currently only enforced by a slow remote check):
- Add a fast local check that typechecks the app's imports against the *published* `.d.ts` of each
  kit rather than the workspace copy. Cheap version: grep the app's `@george43g/*` named imports
  and assert each appears in the published package's type exports.
- Or accept the smoke as the enforcement point and make its failure self-explaining — the message
  above is accurate but does not say "you are calling an unpublished API; split the PR."

**Trigger**: the next time a kit API is added with a generated-app consumer in mind. It will recur.

---

## 24. RESOLVED — the watchdog's force-exit net disarmed itself during a kill

**Status**: fixed 2026-08-09 in `@george43g/robustness@0.5.2`. Recorded because the *way* it was
found is the reusable part.

`triggerKill` arms a 5s `setTimeout` → `exit(137)` as the last-resort net for a shutdown that
wedges, then calls `shutdownController.shutdown(1)`. But `dispose()` cleared that timer, and
`dispose` is itself the cleanup registered with the shutdown controller. So the sequence was:
kill → shutdown → run cleanups → `dispose` → **clear the force-exit timer**, disarming the guard
during the exact hang it exists to escape. With our own controller the 3s `forceExitAfterMs` net
still caught it, which is why no test noticed. With a consumer-supplied controller that has no net
— EQStack's `shutdown.ts` runs cleanups in an unbounded `for … await` and only arms its own timer
on a second, concurrent call — a wedged cleanup would hang forever with nothing to kill it.

Fixed by having `dispose()` leave the timer armed whenever `state.killReason` is set, while
`reset()` tears it down unconditionally so a test cannot leak one. Three regression tests; the
kill-path one fails against the old behaviour.

**How it was found, which is the point**: not by a test and not by a bug report, but by diffing
our implementation against EQStack's equivalent while writing an adoption brief *for them*. Their
`watchdog.ts` deliberately never cancels its force-exit timer, with a comment explaining why.
Reading someone else's solution to the same problem is what made our divergence visible — the
handoff brief paid for itself before anyone read it.

**Generalisable**: when a safety net's correctness depends on an INJECTED dependency
(`shutdownController`), in-repo tests that all inject the friendly implementation cannot see the
defect. Test guards against a hostile injection — here, a controller that runs its cleanups and
then never resolves.

---

## 25. `mcp-kit` IS PUBLISHED at 0.1.0 (2026-08-22); `shared-types` stays deferred

**Status**: **mcp-kit — DECIDED to publish**, by George on 2026-08-22, against a measurement rather
than a request. `shared-types` — still deferred, reasons unchanged and below.

**What changed is that the criterion was MEASURED instead of argued.** George's rule for when a
package earns extraction:

> you publish a package when you notice that the code within it is being duplicated, and not
> customised, and any customisation is either minor or would make sense refactored around as a
> wrapper

Three copies of the same ~840 LOC exist on this machine — here, `up-bank-mcp/packages/mcp-kit`,
`browser-tab-mcp/packages/mcp-kit`. Per-file changed-line counts, `diff` against ours 2026-08-22:

| file | ours (LOC) | up-bank Δ | browser-tab Δ |
|---|---|---|---|
| `dispatch.ts` | 141 | 2 | 40 |
| `tool-registry.ts` | 81 | 1 | 17 |
| `sanitize.ts` | 37 | 1 | 15 |
| `prompt-injection.ts` | 56 | **0** | **0** |
| `resources.ts` | 120 | **0** | **0** |
| `index.ts` | 29 | 0 | 11 |
| `transports/http.ts` | 188 | 25 | **0** |
| `transports/stdio.ts` | 70 | 28 | 31 |
| `transports/http.test.ts` | 116 | **0** | **0** |

Duplicated, and barely customised: two files are byte-identical in all three trees, and up-bank's
core is 0–2 lines off. Where browser-tab does differ it is **two additive features**, not local
policy — `ContentBlock`/`toContent` (image blocks ahead of the JSON summary) and `devOnlyEnabled`
(a per-dispatch dev gate). Both are now in the shared surface.

**The argument the measurement produced that nobody had made**: our `transports/stdio.ts` carries a
shutdown-marker block that NEITHER vendored copy has. Vendoring does not merely duplicate — it
**guarantees** the copies miss our fixes, with no mechanism that could ever tell them. That is
DEFERRED #41's starvation problem in structural form, and unlike #41 no version range can fix it.

**Sequenced deliberately into three PRs, because they are three different decisions:**

1. **Fold the two seams in** (done 2026-08-22) — canonical + `06-mcp-kit/lib/` + `example/`, with
   the generated app's three `content[0].text` read sites narrowed. That is the compile error
   browser-tab explicitly asked for: no catch-all union member, so a new block type fails at the
   render site where the decision belongs.
2. **Publish shape** (done 2026-08-22) — manifest (`private` off, 0.1.0, repository metadata,
   `publishConfig`, `engines`, `files`, LICENSE), `PUBLISHABLE` in `check-publishable-manifests.mjs`,
   a `.releaserc.json`, a release job chained after secret-store, and `packages/mcp-kit/**` in the
   workflow's `paths`. mcp-kit's only workspace runtime dep is `@george43g/robustness`, already
   published, so it needs no companion release — `shared-types` is NOT a dependency of it. **The
   one-time npm bootstrap publish is George's own manual step** — **done 2026-08-22, and the job is
   now ungated.**

   **BOOTSTRAPPING A PACKAGE NEEDS THREE THINGS, AND THE THIRD IS THE ONE THAT IS EASY TO MISS.**

   1. The package on npm. `@george43g/mcp-kit@0.1.0`, published manually because trusted publishing
      requires the package to already exist. Two attempts failed first: a granular token without the
      bypass-2FA flag returned `E403`, and a plain `npm publish` returned `EOTP`. The web-auth flow
      in an interactive terminal is what worked.
   2. Its Trusted Publisher. **`npm trust github` is a real CLI as of npm 11.19** — this is no longer
      a website-only step:
      `npm trust github @george43g/mcp-kit --file release-packages.yml --repo george43g/mcp-cli-starter-template --allow-publish`
      → `id: 8bf00f47-fb66-47e6-a0d5-ba99ee4b4df2`, verifiable with `npm trust list`.
   3. **The git tag `mcp-kit-v0.1.0`.** semantic-release resolves `lastRelease` from **git tags**
      matching `tagFormat`, **not from the registry**. So publishing 0.1.0 to npm did NOT close the
      1.0.0 hazard this entry recorded — removing the gate without the tag would still have produced
      a first release and cut **1.0.0**, skipping 0.1.x entirely. Found by checking every package's
      tags before arming the job: robustness/cli-kit/tui-kit/secret-store each had one, mcp-kit had
      none. Tagged at `d0219ae`, the last commit touching `packages/mcp-kit` and the tree the
      published tarball was built from.

   **A CORRECTION TO OUR OWN VERIFICATION METHOD, worth more than the item.** After the successful
   publish, `npm view` and a direct `registry.npmjs.org` GET both returned **404** for several
   minutes. We concluded the publish had failed — with what looked like a negative control, since
   `@george43g/robustness` returned 200 from the identical query. **The control was mis-specified**:
   an established package answering 200 proves the QUERY works, not that a BRAND-NEW name propagates
   instantly to the read replicas. First-publish propagation lag is real and the control did not test
   for it. `npm trust` succeeded against the package while reads were still 404ing, which is the
   evidence that settled it. **A control must vary the thing under test** — here, newness — not
   merely demonstrate that the instrument works.

   **The gate is not cosmetic, and the first version of this entry got it wrong.** It said the job
   would "run, verify, and find nothing to do". False: **semantic-release's first release for a
   package is 1.0.0** — it does not read the manifest's version — so an unguarded job on a
   never-published package would try to publish `mcp-kit@1.0.0` off the `feat(mcp-kit)` commits, not
   the declared 0.1.0. It would fail at the npm step (trusted publishing requires the package to
   already exist, and there is no `NPM_TOKEN` here by design), but *"it fails safely"* is not
   something to rely on for a version number that is immutable once taken — this repo has published
   two unintended majors already. The in-flight release run was CANCELLED before the job reached it
   and the gate added; `npm view @george43g/mcp-kit` still returns 404, confirming nothing escaped.
   `resync-example` deliberately does NOT list mcp-kit in `needs` while the gate is on, because a job
   hung off a `workflow_dispatch`-only job is skipped on every push — DEFERRED #38's original bug.

   **The `publishConfig` trap this entry predicted fired immediately, and needed a real gate.**
   `build-templates.mjs` selects published packages by `publishConfig.access` alone, so merely adding
   it flips `applyPublishedRanges()` into rewriting `"@george43g/mcp-kit": "workspace:*"` to a
   registry range in every generated repo — **while phase 06 still copies the source in**. That is a
   repo which both vendors the package and depends on a version that 404s, and the E2E smoke installs
   from the real registry, so it fails. The two facts arrive in the wrong order: the manifest needs
   `publishConfig` BEFORE the bootstrap publish can happen. Gated with `PENDING_BOOTSTRAP` in
   `build-templates.mjs`, one name, with the removal trigger written next to it.

   **It also surfaced mechanism 5 in #41**: switching robustness from `workspace:*` to `>=0.1.1 <1`
   resolved **0.1.1**, because `apps/mcpsync` had that exact stale entry in the lockfile and pnpm
   reused it. `TS2305: has no exported member 'getShutdownCause'`. Both are fixed to `>=0.11.0 <1`
   with the resolved version verified in the lockfile.

   **up-bank's `stdio.ts` request is already satisfied, and by a stronger version.** They asked that
   the shutdown-marker `registerCleanup` be in the published copy or every consumer inherits the bug
   they fixed. Ours has it plus a write-once guard theirs lacks. Their fork is one guard behind the
   shared copy, not ahead of it — they withdrew the request on reading ours. Their
   `transports/http.ts` is zero commits past baseline, so nothing of theirs is at risk there.

   **The guard is STILL LOAD-BEARING on robustness 0.11.0 — re-measured 2026-08-22, because up-bank
   challenged the 0.8.1 number rather than absorbing it into a green build.** They could not
   reproduce the duplicate and asked, correctly, whether something between 0.8.1 and 0.11.0 had
   closed the path. It has not:

   ```
   GUARD=0 -> 2 shutdown marker(s), cleanup_timeout seen: 1
   GUARD=1 -> 1 shutdown marker(s), cleanup_timeout seen: 1
   ```

   **Their negative was correct and consistent with this: they never armed the net.** Their run
   exited in 6ms with no `cleanup_timeout`, because `handle.close()` on a live keep-alive socket
   returns promptly. The duplicate is a property of the FORCE-EXIT path, not of shutdown — it needs a
   cleanup registered AFTER the marker that hangs past `forceExitAfterMs` (3s) and **never settles**.
   A slow-but-settling cleanup does not do it: `runCleanup()` reaches `registry.clear()` and the
   sweep finds an empty registry.

   The mechanism is unchanged and is documented in `packages/robustness/src/shutdown.ts:64-67` as a
   corollary rather than an accident — `runCleanup()` clears the registry only after the loop, so a
   hang leaves it populated for `syncCleanup()` to re-run on `exit`.

   **CONFIRMED INDEPENDENTLY** by up-bank on a second machine and workspace once they had the shape:
   `GUARD=0 -> 2 markers, exit after 3007ms; GUARD=1 -> 1 marker, exit after 3002ms`. **The ~3s is
   the tell** — it is `forceExitAfterMs` arming, and its absence is what made their first attempt a
   null result. They corrected the "NOT reproduced on 0.11.0" comment in their own source rather than
   annotating it, on the grounds that a wrong claim in the source is worse than no claim: the next
   reader takes it as evidence the guard is unnecessary and deletes it.

   **The transferable part is about evidence, not shutdown**: a negative result from a shape that
   cannot reach the code under test is not weak evidence, **it is no evidence**. up-bank's own
   sharpening of this, which is better than the original: hedging such a result as "weak" is still an
   overclaim, because it invites someone to average it against a positive.

   **AND THE PROBE ITSELF FAILS SILENTLY TOWARD A CLEAN-LOOKING NULL.** Both of us hit this before
   getting a number. A probe placed outside the workspace produces:

   ```
   GUARD=0 -> 0 shutdown marker(s), exit=TIMEOUT
   GUARD=1 -> 0 shutdown marker(s), exit=TIMEOUT
   ```

   Symmetric zeros, which read as "the handlers never installed on this version". The real cause is
   that **Node resolves ESM bare specifiers from the SCRIPT's location, not cwd**, so
   `import ... from "@george43g/robustness"` throws `ERR_MODULE_NOT_FOUND` before anything runs — and
   a harness that counts lines in a log directory that was never written to cannot distinguish that
   from a genuine null. **If a reproduction reports symmetric zeros, read stderr before concluding
   anything about the version.** Keep the probe inside the workspace, or import via an absolute
   `file://` URL to the resolved package.

   That is the second time in one session a wrong answer came from the harness rather than the code
   under test — the other being the tsx-CLI SIGKILL — and both times the harness failed silently
   toward a result that looked clean. Same family as the standing trap: *an operation that succeeded
   because it had nothing to do.*
3. **Whether the SCAFFOLDER should stop vendoring** and emit an npm dependency instead.
   **DECIDED 2026-08-22 by George — verbatim: *"yes stop vendoring mcp-kit - repos move to depending
   on the npm lib."*** Phase `06-mcp-kit` is deleted (gone, not renumbered, matching how
   04-robustness and 05-utility-pkgs went), `PENDING_BOOTSTRAP` is emptied, and generated repos now
   resolve `@george43g/mcp-kit` from the registry via `applyPublishedRanges()` exactly as robustness
   does. `shared-types` stays vendored: still unpublished, and meant to be edited alongside the
   consuming repo's Rust structs.

   The cost recorded above is real and is now being paid: a vendored copy is customisable and a
   dependency is not. **Measured at the moment of the change**, both vendoring consumers had already
   diverged, in opposite directions — up-bank purely stale (no `ContentBlock`, no `toContent`),
   browser-tab carrying one addition of its own (`sanitizeContent`) plus a stricter dev gate. So
   de-vendoring is a pure upgrade for one and a blocked migration for the other. See #44.

   **Blast radius that only the deletion revealed**: phase 06 was the last caller of
   `standardNodeTsconfig` and `standardVitestConfig` in `core/package-port.ts`, and
   `standardReactTsconfig` had had no caller for longer. All three were removed as dead code — which
   is also what restored the scaffolder's function-coverage floor, since deleting a fully-covered
   file had dropped the average to 84.33% against an 85% gate.

**TWO SEAMS WERE DESIGNED AND DELIBERATELY NOT BUILT**: `ToolDefinition.scopes?` +
`BuildDispatcherOptions.scopeCheck?`, and an async `onErrorResponse?`. They came out of the design
round, not out of any consumer's code — **neither is duplicated anywhere**, which is the same
criterion that justified publishing failing in the other direction. Shipping unused public API in a
first release means that if the shape is wrong, correcting it is a breaking change on a package just
published, and on a 0.x package a breaking marker cuts 1.0.0 (#34). **Trigger**: the first consumer
with a real call site. Additive later costs nothing; wrong-and-published costs a major.

**The `against` case below is now the cost being accepted, not a reason not to.** It is kept
verbatim because it remains true and someone will hit it.

---

**Original entry (2026-08-09), kept for its reasoning:**

**Status**: deferred 2026-08-09 by explicit decision. Requested by the up-bank-mcp agent, who
forked both to consume them. Recorded because the request will come back and the reasons are
substantive rather than scheduling.

**Decide the two separately.** `mcp-kit`'s case is much stronger than `shared-types`'.

**Against publishing `mcp-kit`**: it would slow every mcp-kit change, permanently. Per #23, a
generated-app call site may only use an ALREADY-PUBLISHED API. `apps/example-repo-mcp/src/**` has
nine files importing mcp-kit and is its primary consumer, so every mcp-kit API change becomes two
PRs a release cycle apart. None of the four already-published packages is this tightly coupled to
the example app — that coupling is the cost, and it does not go away.

**Against publishing `shared-types`**: near-zero independent value, and publishing inverts its
stated design intent. Its entire surface is three demo tools' schemas plus a two-entry
`MIRRORED_SCHEMAS`. `docs/SHARED_RUNTIME.md:38-39` says its job is to be *edited alongside* the
consuming repo's Rust structs — which a downstream repo cannot do to a registry dependency.

**Mechanical cost if revisited**: roughly ten manifest failures each (no README/LICENSE/engines/
repository/publishConfig, `private: true`, `version 0.0.0`), two manual npm bootstrap publishes,
and one real design choice — mcp-kit's `workspace:*` on robustness becomes either a caret chain
that grows a `|| ^0.x` clause forever (#20) or a peer range like tui-kit's.

**Trap to flag if it is ever done**: `build-templates.mjs:68` selects published packages by
`publishConfig.access` alone and ignores `private`. Merely ADDING `publishConfig` flips the
scaffolder into rewriting ranges and churning `example/` before any phase is deleted. The manifest
change and `pnpm regen:example` must land in one commit.

**Already fine**: both pass the exports-condition check — `default` is last in every condition map,
so the defect that broke secret-store's first consumer is not present here, and both now carry the
`./package.json` entry.

**Trigger to reopen**: a second independent consumer asking for the same package (one asked for
both together, which is weaker evidence than it looks), or the example app ceasing to be mcp-kit's
primary consumer.

---

## 26. Fast test doubles hide async defects — test against a HOSTILE injection

**Status**: standing rule, earned by three findings in two days. Generalises #24 and the reopened
#16a REPL bug.

When a guard or a loop depends on INJECTED behaviour, a friendly double proves nothing. All three
of these shipped with passing suites:

| Defect | Injected dependency | Why the double hid it |
|---|---|---|
| Watchdog force-exit disarmed itself (#24) | `shutdownController` | Ours has its own 3s net, so the disarmed timer never mattered. A consumer-supplied controller with no net would hang forever. |
| REPL dropped piped input (#16a) | `dispatcher` | `listTools` synchronous, `callTool` resolving immediately — every `await` settled on the microtask queue before readline could emit a second line. |
| Watchdog sleep-skew guard | — (no test at all) | Not a friendly double; simply never exercised. Found by a downstream consumer who wrote the test for us. |

**The rule**: inject the hostile version.

- A dispatcher that actually yields to the MACROTASK queue (`await new Promise(r => setImmediate(r))`),
  not one that resolves on the microtask queue.
- A shutdown controller that runs its cleanups and then never resolves.
- A clock that jumps, not one that ticks.

**And prove the test discriminates.** Every one of these fixes was verified by reverting the fix
and watching the new tests fail — six for the REPL, one for the eager env read, one for the
sleep-skew guard. The first time round that step was skipped, and a bug was closed as fixed on a
claim about tests that turned out to be false.

**Where a unit harness is not enough at all**: the REPL needed a real child process with a real
pipe (`apps/example-repo-mcp/tests/repl-pipe.test.ts`). A unit harness with an in-memory stream
is what produced the false confidence in the first place.

---

## 27. PARTIALLY RESOLVED — Four capabilities approved for lift from EQStack, not yet taken

**Status**: ⏳ **2 of 4 LIFTED 2026-08-10** into tui-kit. `toYaml` and the Prometheus metrics module
stay parked — still no warm consumer, which was the whole trigger condition.

**Lifted**: `clusterWidth` / `visualWidth` / `truncateToWidth` (`visual-width.ts`) and
`detectNerdFont` / `_resetDetectNerdFontCache` (`font-detect.ts`).

Taken **verbatim from source, not reimplemented from the brief.** That was a deliberate ask: the
brief gave signatures and semantics but not the cluster-segmentation body, and rebuilding that from
a description is precisely how the surrogate-splitting bug the file exists to prevent comes back.
Their test suites were ported nearly verbatim for the same reason — they are the acceptance oracle,
so rewriting them would discard the only evidence the semantics survived the move. Verified: 5 of
them reject a naive `slice`-based implementation, including the headline surrogate case.

**The one thing the brief could not convey, which had to be asked:** `truncateToWidth`'s ellipsis
counts AGAINST `maxCols`, so `visualWidth(result) <= maxCols` always. Guessing the other way puts a
one-column overflow into every truncated row, which a flexbox parent wraps or clips — and it
presents as a tui-kit layout bug, not a width bug. Two further contract points came with it: a
string that already fits is returned unmodified, and `ellipsisW >= maxCols` returns clusters-only
with no ellipsis.

Both deliberate semantics preserved and now pinned by tests: the coarse width model, and
`0x2600`–`0x27BF` dingbats at width 1 despite UAX #11 calling them ambiguous.

`_resetDetectNerdFontCache` ships `@internal` with no options param — confirmed with the source as
test-only. `detectNerdFont` keeps the three-variant `FontDetectResult`; **`null` is never collapsed
to `false`**, because default macOS has no fontconfig and those users routinely do have a patched
font.

Coverage floor moved 42 → 47 on statements/lines only. Branches and functions were left alone
despite measuring higher: `font-detect` coverage is environment-dependent (macOS and Linux take
different fc-list branches), and pinning a floor to a runner-dependent number is how a green local
suite fails in CI.

**Original entry follows.**

## 27 (original). Four capabilities approved for lift from EQStack, not yet taken

**Status**: open, approved by the source, deliberately not in the 2026-08-09 batch. All MIT, same
author; a header credit is appreciated but not required. Pointers supplied by the EQStack agent so
the approval is not lost when the briefs age out.

| Capability | Source | Notes |
|---|---|---|
| Grapheme-aware `visualWidth` | `EQStack/apps/imsg-mcp/src/visual-width.ts` (101 lines) | Pure, zero-dep, `Intl.Segmenter`-based with East-Asian-width + emoji/ZWJ handling. Tests at `tests/visual-width.test.ts`. We have nothing like it, and tui-kit's table/truncation code is where it belongs. |
| `detectNerdFont()` | `EQStack/apps/imsg-mcp/src/font-detect.ts` (64 lines) | `spawnSync("fc-list")`, 1s timeout, tri-state `boolean \| null`. Pairs with `GLYPH_PRESETS.powerline`, which today can silently render blanks. |
| `--yaml` output (`toYaml`) | `EQStack/apps/imsg-mcp/src/analytics-render.ts:177` | Zero-dep, phone-safe (no anchors/flow). Extract `toYaml` only — the rest of that file is imsg-domain. Belongs beside cli-kit's `printJson`/`printTable`. |
| Prometheus metrics | `EQStack/apps/voice-mcp/src/gateway/metrics.ts` (88 lines) | Zero-dep `Counter`/`Histogram` + `renderProm()` exposition. |

The fifth offered lift, **log-level filtering**, was taken in the 2026-08-09 robustness minor.

**Why deferred**: each is additive new public surface with exactly one consumer, and that batch was
already two releases deep on the packages EQStack is actively adopting. New public surface is
permanent; a lift with one consumer has not yet shown which shape it should have.

**Trigger to action**: any of them becoming blocking for a consumer (one blocked consumer outranks
four nice-to-haves), or a second consumer wanting the same one — the cross-consumer signal that
drove the whole 2026-08-09 batch.

---

## 28. Deferred generated-app call sites waiting on a published kit release

**Status**: open, populated 2026-08-09. This list exists because #23's escape hatch closed: the
`example/` resync is automated now (#22), so there is no human-authored post-release PR to
piggyback a deferred call site onto. Anything parked here needs its own follow-up PR.

| Waiting on | Call site to wire | Status |
|---|---|---|
| `cli-kit` (REPL serial queue) | Mirror `apps/example-repo-mcp/tests/repl-pipe.test.ts` into `08-app/lib/tests/`, rebuild templates, `pnpm regen:example`. Held back deliberately: the scaffolder E2E smoke installs cli-kit **from npm**, so shipping the test to generated repos before the release would fail the smoke against the published (broken) loop — #23 exactly. | ✅ cleared once `cli-kit@0.3.1` published |
| `robustness` minor (logger level gate) | Add `MCP_LOG_LEVEL` to `apps/example-repo-mcp/.env.example` and its `08-app/lib/` mirror. | ✅ cleared once `robustness@0.6.0` published |

**The table works — keep using it.** Both rows cleared within an hour of their release, which is
the point: the alternative was remembering two reverted call sites across four PRs and two release
runs.

**Rule for adding a row**: record it the moment the call site is reverted, not later. The one time
this was left to memory it survived only because CI failed loudly.

**Related lesson from the same batch, recorded in `AGENTS.md`**: `cli-kit@0.3.1` shipped four new
public APIs under a `fix:` commit, because the headline was the REPL bug and semantic-release reads
the commit TYPE rather than the diff. Additive, so nothing broke — but the version under-signals
and there is no honest correction after the fact. The existing convention note covered
under-*scoping* (a `feat(vitest-config)` publishing robustness); this is the opposite direction and
now has its own bullet.

**Trigger**: each row clears when its package publishes. Check this table after every release.

---

## 29. RESOLVED — the screenshots workflow ships two CI traps into every generated repo

**Status**: ✅ **RESOLVED 2026-08-10.** It was not two traps, it was four — and the pipeline had
never produced a single screenshot. `docs/screenshots/` contained only `.gitkeep` while the
workflow reported success on every run.

Each of these alone is enough to yield zero output, and every one of them exits 0:

1. **`Output` is resolved against the process cwd, not the tape's directory.** The workflow ran
   `vhs apps/.../overview.tape` from the repo root, so the tape's `../../../../docs/screenshots/`
   prefix pointed four levels ABOVE the root — `/docs/screenshots/`, which is not writable. vhs
   wrote nothing and exited 0. Tapes now run from their own directory.
2. **The bin the tapes typed does not exist.** They typed `example-repo-cli`; the bin is
   `example-repo` (generated: `example-cli` vs the real `example`). Nothing links workspace bins
   into `node_modules/.bin` either, so even the right name would not resolve. The tapes now define
   a shell function over the built entrypoint in a `Hide` block.
3. **`Output foo.png` writes a 210-file frame directory**, not a still. GIFs are the committed
   artifact — `docs/screenshots/*.png` is gitignored, which is the fourth defect: the workflow's
   commit step was filtering for files git had been told to ignore.
4. **The `for` loop returned only the last tape's status** (the known trap), and there was no TUI
   tape at all, so ink's CI gate (the other known trap) was never exercised.

**What actually makes a tape fail is `Wait+Screen@<timeout> /regex/`.** vhs exits 0 for a command
that does not exist, a blank TUI render, and an unwritable output path. Assert on a string from the
command's *output*, never one echoed in the command line itself. The workflow additionally verifies
that every artifact a tape declares exists AND resolved inside `docs/screenshots/` — the exit code
is not sufficient, and vhs silently creates parent directories, so a wrong path can also "succeed"
into the wrong place.

Verified by reproduction at each step, on vhs 0.11.0:

| Check | Before | After |
|---|---|---|
| `CI=true vhs tui.tape` | exit 1, blank, no artifact | exit 0, TUI rendered |
| Output path outside the repo | exit 0, silent | exit 1, names the resolved path |
| Non-last tape fails | exit 0 | exit 1, and later tapes still run |

EQStack's report was accurate on both traps it named; it just could not see from outside that the
pipeline underneath them had never worked. Their `Wait+Screen`-not-`Sleep` advice turned out to be
the load-bearing part, for a reason neither of us stated at the time: it is the only assertion
mechanism vhs has.

**Original entry follows.**

## 29 (original). The screenshots workflow ships two CI traps into every generated repo

**Status**: open, found 2026-08-09 by the EQStack agent over cross-session messaging, then verified
against this tree. `screenshots.yml` exists both here and at
`apps/scaffolder/src/phases/12-ci-release/lib/.github/workflows/screenshots.yml`, so a generated
repo inherits both traps pre-armed.

**Trap 1 — a fullscreen ink TUI renders BLANK under CI, forever, silently.** GitHub Actions exports
`CI=true`; ink then suppresses interactive frame rendering:

```js
// ink/build/ink.js:707
return interactive ?? (!isInCi && Boolean(this.options.stdout.isTTY));
```

So a `vhs` capture of an ink TUI on a runner produces a permanently blank screen. Repro without a
runner: `CI=true vhs <any-tui-tape>`. Fix (EQStack PR #76): prefix the tape's boot command with
`CI=false CONTINUOUS_INTEGRATION=false` — `is-in-ci` treats the literal string `"false"` as not-CI.

**This is LATENT here, not live**, and the distinction is the useful part. Our only tape
(`apps/example-repo-mcp/scripts/screenshots/overview.tape`) never launches the TUI — it types
`example-repo-cli health`, `noop --input …` and `--help`, all plain CLI. So nothing is broken
today; the trap fires the first time anyone adds a TUI tape, in this repo or in any repo scaffolded
from it. EQStack shipped blank screenshots for their project's entire history before noticing.

**Trap 2 — the tape loop swallows every failure but the last.** Live in both copies:

```sh
for f in apps/*/scripts/screenshots/*.tape; do echo "▶ $f"; vhs "$f"; done
```

A `for` loop exits with the LAST iteration's status, so tape 1 failing and tape 3 succeeding is a
green step. Harmless at one tape, wrong at two — and it is the thing that would hide trap 1 once
someone adds the TUI tape. Fix independently of trap 1.

**Checked and NOT applicable**: EQStack also warned that job-level `continue-on-error: true` turns
job failures into run-level "success", so conclusions must be read per-job
(`gh run view --json jobs`). `grep -rn continue-on-error` over our workflows and the template's
returns nothing, so this repo is unaffected. Recorded because verifying it cost one grep and acting
on it would have cost an afternoon.

**Fix in one PR**, touching canonical + `lib/` mirror + `pnpm regen:example`: set the CI vars in the
tape, replace the loop with one that accumulates a failure status, and add a TUI tape so trap 1 is
actually exercised rather than merely avoided.

---

## 30. RESOLVED — `TokenBucket` has no non-blocking acquire

**Status**: ✅ **RESOLVED 2026-08-10**, shipping in the next robustness minor. `tryAcquire(n = 1):
RateLimitDecision` matches the requested shape exactly; browser-tab's two tests were used as the
acceptance oracle and their semantics are reproduced against our own bucket.

Three things beyond the requested shape:

- **The real contract is that `retryMs` is SUFFICIENT, not merely positive.** Their
  refill-then-retry test pins it — advance the clock by exactly `retryMs` and the next call must
  succeed. A hint that is only positive passes a "deny with a hint" test while still starving a
  caller that believes it. Covered here across six bucket shapes, not just the one.
- **`n > capacity` now throws, on both methods.** Refill caps at `capacity`, so such a request can
  never be granted: `acquire` spun on it forever (confirmed — the new test's guard tripped at 50
  iterations against the old code) and the reference `tryAcquire` returns a retry hint that can
  never come true. Only reachable while the limiter is active, so a deliberately-disabled
  `new TokenBucket(0, 0)` still never throws. **This is a deviation from browser-tab's reference
  implementation** — flagged to them, since it is an edge case their callers never hit (`n` is
  always 1).
- **rps=0 means different things to the two methods**, which is surprising enough to be documented
  rather than smoothed over: `acquire` treats it as "limiter off" and returns without deducting,
  while `tryAcquire` treats it as a fixed budget. Following the reference here was deliberate —
  browser-tab already runs that semantic in production, and deviating would break their migration.

`rate-limit.ts` went from partly-covered to 100% on all four metrics: the module-level `acquire`,
`defaultLimiterAvailable`, and the shipped unref sleep path had never been executed by any test.
Package floor ratcheted 84/85/86/84 → 85/85/88/85.

**Original entry follows.**

## 30 (original). `TokenBucket` has no non-blocking acquire

**Status**: open, requested 2026-08-09 by the browser-tab-mcp agent over cross-session messaging;
verified. `packages/robustness/src/rate-limit.ts:59` exposes only
`async acquire(n = 1): Promise<void>`, which waits. There is no way to express fail-fast-with-hint,
so a caller that must never queue has to reimplement the bucket.

**Requested shape**: `tryAcquire(n = 1): { ok: boolean; retryMs: number }` — refill, deduct if
tokens suffice, else report `max(1, ceil((n - tokens) / rps * 1000))`. With `rps <= 0` an exhausted
bucket reports `{ ok: false, retryMs: 0 }`: the bucket can never refill, so the caller decides what
to do rather than being told to wait forever.

**Consumer**: browser-tab's screenshot rate limiter, which must reject with a hint rather than
queue. It carries an app-local copy until this ships.

| What | Where |
|---|---|
| Reference implementation + docblock | browser-tab-mcp at tag `v1.0.0`, `packages/robustness/src/rate-limit.ts:56-74` (`tryAcquire`), refill helper at `:42-48` |
| Live app-local copy to delete | `apps/browser-tab-mcp/src/daemon/screenshot.ts` (`class ShotBucket`), branch `chore/consume-published-kits` |
| Equivalence tests that must still pass | `screenshot.test.ts:115` (deny-with-hint), `:128` (refill-then-retry) |

Additive, so a minor. Read their docblock before implementing; their two tests are the acceptance
criteria for the swap, so the shape has an existing oracle rather than needing one invented.

---

## 31. RESOLVED — `ToolCallResult.content` is text-only, but MCP results carry image/audio/resource blocks

**Status**: ✅ **RESOLVED 2026-08-10**, shipped as **cli-kit 1.0.0** — planned as 0.4.0; see #34 for
why the number differs. The only breaking change in this batch. Shape (B) as browser-tab chose it: a closed union, no catch-all, `data` raw base64.
The renderer ships WITH the type, which was their condition — type-without-renderer "just relocates
my 20-line adapter into every consumer's compile-error fixup".

**One correction to the brief, found by reading our tree rather than trusting the reference.** The
entry said to mirror "mcp-kit's own `ContentBlock` at `tool-registry.ts:16-24`". That describes
browser-tab's *evolved fork*. In this repo `tool-registry.ts:16-24` is `ToolDefinition`, there is no
`ContentBlock`, and `dispatch.ts:34` declares `content: Array<{ type: "text"; text: string }>` —
our dispatcher emits exactly one text block and never an image. So the union went into cli-kit,
which is dispatcher-agnostic by design, and mcp-kit was left alone: its text-only `ToolResult`
stays assignable to `ContentBlock[]`, so nothing in this repo needed migrating.

Renderer contract, verified against their stated preference: one line per non-text block, **in
dispatcher order** (a dispatcher appending text last means a screenshot arrives as `[image, text]`,
and reordering would misreport it), sizes in **decoded bytes** not base64 characters, meta footer
last.

**Deliberately more defensive than the type:** the union is closed so that adding `resource` is a
compile error where a decision is needed, but the renderer degrades to a `[resource]` placeholder
at runtime. A real MCP server can send blocks this version does not model, and taking the REPL
down over one would be the wrong trade.

Also non-breaking in the same release: optionals declared `?: T | undefined` so
`exactOptionalPropertyTypes` consumers can pass results through verbatim instead of rebuilding them
with conditional spreads — this collapses their `cli.ts:541-561` to `return callMcpTool(...)`.

Verified: 4 of the new tests observed failing against the old `content[0].text` renderer, and a
type probe confirms `r.content?.[0]?.text` now raises `TS2339: Property 'text' does not exist on
type 'ContentBlock'` — the compile error they asked for, landing at the render site.

**Original entry follows.**

## 31 (original). `ToolCallResult.content` is text-only, but MCP results carry image/audio/resource blocks

**Status**: open, requested 2026-08-09 by the browser-tab-mcp agent; verified. This is the SECOND
consumer in one day to find this interface under-modelled, which is the signal that the type is
wrong rather than the usage.

Current shape (`packages/cli-kit/src/repl.ts`):

```ts
content?: Array<{ type: string; text: string }>;
```

`type` is already `string` rather than a literal union, so an image block is *structurally*
representable — but `text` is REQUIRED, which is exactly wrong for
`{ type: "image", data, mimeType }`. browser-tab's screenshot tool returns image blocks and adapts
them to summary text in its own REPL wiring; up-bank hit the same interface from the other
direction this morning and needed `structuredContent` + `_meta` (shipped in 0.3.1).

**Do it properly rather than widening a third time**: a discriminated union with the renderer
summarising non-text blocks to one line (browser-tab's suggestion, and what their adapter already
does).

Scope correction from browser-tab after reviewing the plan: **`mcp-kit`'s own `ContentBlock` is
`text | image` only** (`{type:"image", data, mimeType}`), so those two are the required cases and
`audio` / `resource` are future-proofing rather than parity. Do not model the union off a
half-remembered reading of the MCP spec — match `mcp-kit` first, then extend.

**Drop-the-shim trigger for the consumer**: their REPL adapter
(`apps/browser-tab-mcp/src/cli.ts`, the `callTool` wiring) already narrows on `type === "text"` and
summarises the rest, so their migration is *deleting* the adapter rather than rewriting it. They
pin caret ranges, so they will not absorb the break silently — but they have asked to be told the
version when it ships.

**This is a breaking change to a published interface** — a required property becomes conditional on
the discriminant, so any consumer reading `content[0].text` unguarded stops typechecking. Needs a
minor plus a migration note in the README's upgrade section, NOT a patch. Recorded explicitly
because `cli-kit@0.3.1` shipped four new APIs under a `fix:` commit this morning and published as a
patch when it should have been a minor; that mistake is not worth repeating on a change that
actually breaks callers.

---

## 32. RESOLVED — Announce that `_resetForTests` now resets the logger's prefixes

**Status**: ✅ **RESOLVED 2026-08-10.** Documented in the robustness README's logging section, under
its own heading rather than as a bullet, with EQStack's `configureKitLogger()` shape as the
recommended fix and the reason it matters stated plainly: call it in `beforeEach` and your logger
configuration is gone from that point on. Ships with the same robustness minor as #30.

**Original entry follows.**

## 32 (original). Announce that `_resetForTests` now resets the logger's prefixes

**Status**: open, raised 2026-08-09 by the EQStack agent after adopting `robustness@0.6.0`.

`_resetForTests()` now also clears `logFilePrefixOverride`, `envPrefix` and `logLevelOverride`, so a
consumer calling it in test setup must RE-APPLY its prefixes afterwards or silently fall back to the
`MCP_` vocabulary mid-suite. EQStack wraps this in a `configureKitLogger()` helper, which is the
right shape.

The reset itself is correct and deliberate: before 0.6.0 `logFilePrefix` was NOT reset, so one test
calling `setLogFilePrefix` leaked into every later test in the same file. Fixing that leak is what
created the announcement gap — the behaviour changed for consumers with nothing in the changelog
saying so.

**Fix**: a line in the robustness README's logging section and in the 0.6.0 changelog entry. Cheap,
and it is the kind of thing only a real adopter finds.

---

## 33. RESOLVED — `readme-check` counted test files as source

**Status**: ✅ **RESOLVED 2026-08-16.** The trigger fired exactly as written — a test-only PR
(the `useDevStats` deflake, #55) tripped the check — so it was fixed rather than tagged around.

The selector now drops test files alongside the existing `lib/` exclusion, on all three surfaces:

```sh
SRC_CHANGED=$(git diff --name-only "$DIFF_RANGE" \
  | grep -E '^(apps|packages)/[^/]+/src/' \
  | grep -v '/lib/' \
  | grep -cvE '\.(test|spec)\.(ts|tsx|mts|js|jsx)$' || true)
```

Verified against six cases before trusting it, including the two that must NOT regress:
a **mixed** test+src PR still counts as 1 (a real docs gap is still gated), and a lib-mirror-only
change still counts as 0. Also covers `.spec.` and the empty-input path, where `grep -c` prints `0`
and exits non-zero — hence the `|| true`.

**Original entry below.**

**Status (original)**: open, hit 2026-08-10 on a PR that changed only `rate-limit.test.ts`.

`.github/workflows/readme-check.yml:52` selects changed source with
`grep -E '^(apps|packages)/[^/]+/src/' | grep -cv '/lib/'`. Test files live under `src/`, so a
test-only change trips the check and has to carry `[skip-readme]` — which is the mechanism working
as written, but the tag then means "no README needed" for two quite different reasons, and a real
missing-docs case is one habituated tag away from slipping through.

The workflow already excludes `lib/` for exactly this reason: its header explains that counting the
byte-mirror "produces false positives". Test files are the same class.

**Fix**: add `| grep -cv '\.test\.'` alongside the existing `lib/` exclusion. One line, but
`readme-check.yml` exists on THREE surfaces (`.github/`, `12-ci-release/lib/`, `example/`) under
golden byte-equality, so it is a mirror-and-regen change rather than a one-line edit.

**Trigger to action**: the next test-only PR that needs the tag. Bundle it with any other
`12-ci-release/lib` work rather than spending a three-surface sync on it alone.

**Cost**: ~20 min including the regen.

---

## 34. DECIDED — A breaking marker on a 0.x package publishes 1.0.0

**Status**: ✅ **DECIDED 2026-08-10 — option A. No config change. This is working as intended.**

A breaking change to `robustness`, `tui-kit` or `secret-store` will cut that package's 1.0.0, the
same way it did for cli-kit. The analyzer config stays stock.

**The framing in the original entry below was wrong, and the correction is the reason for the
decision.** It implied that staying on `0.x` protects consumers from breaking changes. It does not
add any such protection:

| | breaking change reaches a caret consumer? | additive minor reaches them? |
|---|---|---|
| `^0.3.1` on 0.x | **no** — caret locks the minor | no |
| `^1.0.0` on 1.x | **no** — a breaking change is a major, and caret does not cross majors | yes |

The insulation against breaking changes is IDENTICAL. The only thing `0.x` adds is blocking
*additive* minors — protection against the case that does not need it, and the case a consumer
(up-bank) explicitly said they want automatic: "the accidental 1.0.0 actually helps consumers like
us (additive-by-contract minors via plain `pnpm update`)".

Two consequences worth keeping:

- **Reaching 1.0 because a package needed a breaking change is a legitimate trigger**, not an
  accident to be engineered around. The original entry called that "decided by accident of what
  broke first"; on reflection, "this package's API was wrong enough to break" is exactly the
  evidence that its surface has stopped moving arbitrarily.
- **Do not renumber cli-kit.** up-bank raised this unprompted and they are right: a 2.0.0 to "fix"
  the 1.0.0 would be a second breaking bump for zero API change, which is strictly worse for every
  consumer than the number being unplanned.

What remains true and is now an AGENTS.md rule: `!` or a `BREAKING CHANGE:` footer on a 0.x package
means you are cutting its 1.0.0. That is now a deliberate choice rather than a surprise.

**Original entry follows, retained for the mechanism.**

## 34 (original). A breaking marker on a 0.x package publishes 1.0.0 — decide whether that is wanted

**Status**: open, and it already fired once. Recorded 2026-08-10.

`packages/cli-kit/.releaserc.json` lists `@semantic-release/commit-analyzer` with no
`releaseRules` override, so the default `conventionalcommits` mapping applies: any breaking change
is a **major**, with no clamp for `0.x`. `feat(cli-kit)!:` carrying a `BREAKING CHANGE:` footer was
planned as `0.4.0` and published as **`cli-kit@1.0.0`**. npm publishes are immutable; that number
stands.

**This is live for the other three.** `robustness` (0.7.0), `tui-kit` (0.3.4) and `secret-store`
(0.2.2) all use the same stock analyzer config and will each jump straight to 1.0.0 on their first
breaking commit.

**Why the number is not cosmetic.** On `0.x` a caret range locks the MINOR — `^0.3.1` resolves as
`>=0.3.1 <0.4.0` — so every minor is an explicit opt-in and a breaking minor cannot reach a
consumer accidentally. On `^1.x` minors and patches arrive on a plain `pnpm update`. Crossing 1.0.0
therefore changes the upgrade contract for every consumer, and from then on a breaking change
*must* be a major.

**The decision, which is the user's, not an implementation detail:**

| Option | Effect |
|---|---|
| **A. Accept 1.0.0 for cli-kit, leave the config alone** | The other three each cut their own 1.0.0 whenever they first break. Simple, honest, but the 1.0 timing for each package is decided by accident of "what broke first" rather than by readiness. |
| **B. Add `releaseRules` mapping breaking → `minor`** | Keeps 0.x packages in 0.x, so breaking minors stay opt-in. Deviates from strict semver, which is exactly what 0.x licenses. Needs the rule in each `.releaserc.json`. |
| **C. B, plus a deliberate 1.0.0 per package when it is ready** | Most control, most bookkeeping. |

**Trigger to action**: before the next breaking change to any 0.x package here. Whichever way it
goes, the analyzer config should stop being an accident.

**Cost**: ~20 min for the config change (B), plus whatever the 1.0 conversation costs.

---

## 35. RESOLVED — commit PROSE published two unplanned majors

**Status**: ✅ **RESOLVED 2026-08-10** with a mechanical guard, after it fired twice in one session.

`@semantic-release/commit-analyzer` treats the breaking-change footer token as breaking wherever it
appears in a commit body — including inside a sentence *describing* an incident rather than
declaring one. It does not require a footer position.

| Publish | Cause |
|---|---|
| `cli-kit@1.0.0` (planned 0.4.0) | A genuine `!` marker whose consequence on a 0.x package was not checked — see #34 |
| `cli-kit@2.0.0` | A **`docs:`** commit whose body explained the 1.0.0 mishap and spelled the token while doing so |

`2.0.0`'s `dist/` is **byte-identical to `1.0.0`** — verified by unpacking both tarballs; only
`README.md` and the version field differ. A pure no-op major.

**The guard**: `scripts/lib/release-tokens.mjs` + `scripts/check-release-tokens.mjs`, tested in
`scripts/check-release-tokens.test.mjs` — whose first case is the real 2.0.0 commit message
verbatim. The rule is symmetric:

- The token without `!` in the subject → **rejected**. Prose cannot cut a release.
- `!` in the subject without the token → **rejected**. A major must say what broke.

**Where it runs — and this took two corrections, both prompted by consumer questions rather than by
our own review:**

1. `ci.yml`, on `pull_request`. Squash-merging makes the PR title and body the commit message, so
   the check has to happen BEFORE the merge; afterwards the package is published and npm versions
   are immutable. Shipped to the generated template too — same semantic-release setup, same trap.
2. `release-packages.yml`, as a gate every release job `needs:`, checking the REAL commit messages
   over the pushed range. **This is the load-bearing copy.** The `pull_request` job alone was not on
   the publishing path: `main` is **not a protected branch** (`gh api …/branches/main/protection`
   returns 404), so a direct push never opens a PR and never met the check — and a merger can edit a
   squash commit's message at merge time, which makes the PR body a *prediction* of the commit
   message rather than the message.

Bot-authored bump commits are skipped, keyed on `semantic-release-bot`'s **authorship**. The first
version keyed on the subject text, which anyone can type — a second hole, found by the same session
asking whether quoting inside a `chore(release):` subject had become the new bypass. The subject
markers are kept as a second condition so a future change of bot identity fails CLOSED.

Worth knowing: **no bump commit in this repo's history has ever contained the token**, because
conventional-changelog's heading is the plural form and the regex ends in a word boundary. The skip
is belt-and-braces, not load-bearing — the right posture for a bypass, and pinned by a test against
the real 1.0.0 bump body so a future "simplification" of the regex cannot silently break it.

**What this guard does NOT cover, and structurally cannot**: an under-classified breaking change
published as a minor or patch. No commit-message linter catches a break the author did not know
about. See **#37**.

**Not renumbered.** Publishing a 3.0.0 to "undo" 2.0.0 would be a third breaking bump for zero API
change. Consumers on `^1.0.0` are unaffected — caret does not cross a major — and the next real
cli-kit release will simply be 2.x.

**What generalises**: this repo already had a rule against writing skip-CI markers in commit prose.
The same hazard class covers every token a CI or release tool greps for out of a commit message.
Treat commit messages as machine input, not only as prose.

---

## 36. Implement the release-please switch for generated repos (from #19)

**Status**: open, decided in #19 on 2026-08-10 but deliberately not implemented in the same change.

Swap what the scaffolder GENERATES from `semantic-release` to `release-please`. This repo's own
`release-packages.yml` is untouched.

**Scope**, all in `12-ci-release` plus its `lib/` mirror and `example/`:

- Replace the generated `.github/workflows/release.yml` with a release-please workflow, still
  shipping disabled by default (the `on:` trigger commented), matching current behaviour.
- Drop the generated `.releaserc.json` and its `@semantic-release/*` devDependencies.
- Add a `release-please-config.json` + `.release-please-manifest.json`.
- Update `docs/RELEASE.md` — the generated copy, not this repo's.
- Keep the changelog format (Keep a Changelog) so existing generated repos are not disrupted.

**Two things not to lose in the swap:**

- The **npm-publish path must remain documented but opt-in**, for the minority of generated repos
  that do publish. release-please makes this a job you add rather than a plugin you remove.
- The `release-tokens` CI guard (#35) stays regardless. release-please reads conventional commits
  too, so prose spelling the footer token is still hazardous — the Release PR makes it *visible*,
  not impossible.

**Cost**: ~2h, most of it in the lib mirror and regen. Zero risk to this repo's own publishing.

---

## 37. A consumer-side canary for under-classified breaking changes

**Status**: open, proposed by the up-bank-mcp session 2026-08-10. Not built, and deliberately not
volunteered — it costs the user compute and is the user's call.

**The gap it addresses.** The `release-tokens` guard (#35, hardened 2026-08-10) constrains a
release-control token in a commit message, so it prevents **spurious majors** — the class that
actually bit us twice. It does nothing about the mirror image, which is the dangerous one: **a
breaking change the author did not know was breaking, published as a minor or patch**, which every
consumer's caret range pulls in silently on their next install.

up-bank's argument, which is correct and which I could not counter: *no commit-message linter can
catch a change the author did not know was breaking — that is the definition of the class.* So this
cannot be fixed on the publishing side. It needs a consumer running real code against a new version.

**What it would be.** One downstream repo installs the newest kit versions its carets admit and runs
its full suite **on a schedule**, not only on its own PRs — so a bad release is caught within a day
rather than whenever that repo next happens to touch its lockfile.

**Why up-bank is the natural candidate** (their own case, recorded as offered rather than accepted):
205 tests, a committed REPL transcript suite, and a TUI PTY check, all fixture-backed and
credential-free. They already caught the pipe-safety snapshot break by measurement rather than
impression, which is exactly the behaviour a canary needs.

**Evidence this class is not hypothetical.** `cli-kit@2.0.1` shipped as a PATCH and broke 8 of
up-bank's 12 snapshot tests — no API change, no type error, no runtime error. That was a
*deliberate* output fix and the right call, but it demonstrates that a patch can reach consumers
with real behavioural consequences that nothing on the publishing side would flag. An *accidental*
one would look identical from here.

**Trigger to act**: the first under-classified breaking release that reaches a consumer, or the user
deciding the standing round-trip is too manual to keep repeating. Ask up-bank's user before
assuming their compute.

---

## 38. RESOLVED — the `example/` resync is skipped exactly when a release goes wrong

**Status**: **RESOLVED 2026-08-21**, and PROVEN in anger rather than merely merged. Lifted into its
own `resync-example` job in `release-packages.yml`, guarded by
`!cancelled() && github.event_name == 'push'` and needing all four push jobs.

Two deliberate deviations from the fix recorded below. `!cancelled()` rather than `always()`: any
`if:` that does not call `success()` already breaks the skip-cascade, so both forms fix the bug, but
this one additionally declines to push a commit into a run somebody cancelled. And the job carries
its own checkout at `ref: main` with `fetch-depth: 0` plus its own mise install, because the entry
below warns that a relocated job needs its own checkout/build ordering rather than a copied step.
`--build` stays, for the reason it was there.

`needs` deliberately OMITS `mcpsync` — it is `workflow_dispatch`-only, and a job hung off it would
be skipped on every push, which is this bug wearing a different hat. The entry below flagged exactly
that trap.

**Evidence it works**: the `robustness@0.10.0` release run (`32404112566`, `completed/success`) shows
`Resync example/ whatever the release jobs did` as a separate successful job, and it committed
`chore(example): resync generated output after release [skip ci]`, taking `example/` to `^0.10.0`.

**What was NOT done**: the entry asked for a deliberate failed-chain observation to confirm the fix.
That was not simulated — the evidence is three organic occurrences plus one successful real run, not
an induced failure. If someone wants certainty, forcing one release job to fail and watching this one
still run is the test.

**Original entry follows.**

**Status**: open. **Observed TWICE — 2026-08-16 and again 2026-08-18, the second time with real
cost.** On 2026-08-18 `robustness@0.9.0` published, then the `cli-kit` job failed at the RUNNER
level (`steps: []`, `conclusion: failure`, log already expired — not a test failure), skipping
`tui-kit`, `secret-store` and `mcpsync`. `secret-store` carries the resync, so `example/` kept
claiming `"@george43g/robustness": "^0.8.1"` against a published `0.9.0`. Fixed by hand in a
follow-up PR. The 2026-08-16 occurrence was harmless only by luck; this one was not.

**The predicted consequence then happened, to THIS ENTRY'S OWN PR.** The line above originally read
that it "was avoided only because CI was itself down at the time" — that was wrong within the hour.
Once CI came back, PR #63 — the docs-only change that adds this very paragraph, touching no code at
all — failed with:

```
##[error]example/ is stale vs scaffolder output. Run `pnpm regen:example` and commit.
```

On both OS legs, for a reason with nothing to do with its diff, blocking it behind an unrelated
fix. The entry predicted "the next unrelated PR fails CI's sync check and its author debugs someone
else's release" and then became that PR.

**Three occurrences in three days, the third one actively blocking unrelated work, moves this from
a design smell to a recurring fault.**

**What happened**: `tui-kit`'s `useDevStats` test flaked on the runner during the release run for
`8bd953f`. Because the release jobs are a strict chain —
`release-tokens → robustness → cli-kit → tui-kit → secret-store`, each `needs:` the previous —
GitHub skipped `secret-store` entirely. That job carries the `example/` resync
(`release-packages.yml:342`), so the resync never ran.

**Why it is worse than a skipped step**: the resync exists (DEFERRED #22) so a release cannot leave
the tracked `example/` output stale. `needs:` makes it skip on ANY upstream failure — so the safety
net is removed precisely in the runs where something already went wrong and a release may be
half-finished.

**The concrete bad case**, which did NOT happen this time only by luck: `robustness` publishes,
then a later job flakes. npm now serves the new version, `example/` still embeds the old range, and
nothing refreshes it. The next unrelated PR fails CI's `example/` sync check, and its author debugs
a failure that has nothing to do with their change. On 2026-08-16 `example/` was already in sync
because PR #54 had regenerated it in-PR — luck, not design.

**Fix**: lift the resync out of `secret-store` into its own job that depends on all four and runs
regardless of their outcome:

```yaml
resync-example:
  needs: [robustness, cli-kit, tui-kit, secret-store]
  if: always() && github.event_name == 'push'
```

`if: always()` is the load-bearing part — it is what breaks the skip-cascade. Without it, `needs:`
on a failed job skips this one too and nothing changes.

**Two things to verify when doing it**, neither obvious:
- The job must still run AFTER semantic-release has pushed its bump commits, and must check out
  the post-bump tree — the existing step's `--build` flag exists because `pnpm verify` builds the
  scaffolder BEFORE the bump, so `dist` embeds stale ranges. A relocated job needs its own
  checkout/build ordering, not just a copied step.
- Confirm it is genuinely last. The current placement is deliberate: the workflow comment at
  `:336-341` explains that a job hung off `mcpsync` would be skipped on push, since mcpsync is
  `workflow_dispatch`-only. Any new job must not reintroduce that.

**Trigger to action**: the next release run that fails partway, or bundle it with other
`release-packages.yml` work. Cheap on its own but it edits the pipeline that publishes everything,
so it wants its own PR and a real (not simulated) failed-chain observation to confirm the fix.

**Cost**: ~30 min plus one deliberate failed-chain test.


---

## 39. RESOLVED — the logger rotates but never reaps, so long-lived processes grow $TMPDIR without bound

**Status**: RESOLVED 2026-08-22 in `packages/robustness/src/logger.ts` — `pruneLogs(dir, keep)`,
exported, called from `ensureLogFile()` on every open. Found 2026-08-18 while assessing the log
volume of the watchdog's new observe-only mode. Pre-existing — not caused by that feature, but that
feature is the first thing that makes a process log steadily, forever, unattended.

**What shipped, and the two decisions the entry asked to be made deliberately:**

1. **A file count (`MCP_LOG_KEEP_FILES`, default 5), not a byte budget.** Rotation already caps
   every file at `MCP_LOG_MAX_BYTES`, so `keep x maxBytes` IS the byte budget (~50MB at the
   defaults), and a count needs no `stat()` — matching the name-only ordering the module already
   relies on. `pruneBackups`'s shape was mirrored as the entry asked, including its best-effort
   never-throw posture.
2. **A live process's open file is never deleted**, which the entry did not anticipate and which a
   naive newest-N prune gets wrong. One directory is shared by every instance with the same prefix
   — the exact server-plus-TUI case `getFileLogLines` already documents — and a peer whose log is
   deleted does not even crash, because `appendFileSync` reopens by path. It silently loses its
   history. Only the newest file per live pid is protected, so that process's own rotated files are
   still reapable; the effective cap is `keep` + one file per live instance.

**A second defect found while writing it**: ordering by a reverse lexical sort of the whole filename
orders by **pid first** — `mcp-9999-<old>` sorts ahead of `mcp-101-<new>` — so "newest" meant
"highest pid" whenever two instances shared the directory. `getFileLogLines`'s fallback branch had
this too and its docblock asserted the opposite. Both now use `listLogFiles`, which orders by the
timestamp segment. Fixed in the same release; noted in the README because it changes which file
`get_logs` answers with.

**Red-drilled**, per the entry's own warning that a prune with an off-by-one looks identical to no
prune: four deliberate breakages (prune call removed, lexical sort restored, live-pid protection
removed, `slice(keep + 1)`), each observed failing the specific test that names it, then reverted.

**The defect**: `packages/robustness/src/logger.ts` rotates at `MCP_LOG_MAX_BYTES` (10MB) by
**opening a new file** — `ensureLogFile()` builds a fresh `<prefix>-<pid>-<timestamp>.ndjson`
when the current one is full. Nothing ever deletes the old one. Verified: no `unlink`, no prune,
and the only `readdirSync` in the file (`:436`) belongs to `getFileLogLines`, a reader.

So rotation bounds FILE size, not DISK usage. A long-lived server accumulates 10MB files
indefinitely.

**Why it is easy to miss**: the stdio path calls `setStderrMirror(true)`, so an operator sees the
lines. The HTTP path deliberately does not (a TUI would be garbled by stray stderr), so on an HTTP
server these accumulate silently in `$TMPDIR` where nobody is watching.

**This repo already knows the pattern it is missing.** `apps/mcpsync/src/core/backup.ts:28`:
```ts
export function pruneBackups(path: string, keep = 5): void
```
Backups are reaped to the newest 5. Logs are not reaped at all.

**Volume context, measured 2026-08-18** — an observed (non-killed) breach logs one line per
breaching sample, and the two samplers differ by 12x:
- memory conditions (`rss_exceeded`, `memory_leak_suspected`) ride `memorySampleMs`, default 60s
  → ~1,440 lines/day, ~215 KB/day
- `event_loop_sustained_lag` rides `eventLoopSampleMs`, default 5s → ~17,280 lines/day, ~4 MB/day

**Fix**: a `pruneLogs(dir, keep)` alongside the existing rotation, called from `ensureLogFile()`
when it rolls. Mirror `pruneBackups`'s shape rather than inventing a second convention. Decide
deliberately whether the default is a file count or a total-bytes budget — a count is simpler, a
byte budget is what an operator actually cares about.

**Deliberately NOT bundled** into the observe-only wiring PR that surfaced it: it is unrelated to
that call site, and smuggling a backlog entry into a wiring PR is the kind of scope creep that
makes a diff hard to review and a revert hard to scope.

**Trigger to action**: any report of `$TMPDIR` growth, or the first consumer that runs an
observe-only watchdog on a long-lived HTTP service with file logging on. Bundle with other logger
work if any appears first.

**Cost**: ~1h including a test that proves old files are removed, which is the assertion that
matters — a prune with an off-by-one that keeps everything looks identical to no prune at all.

## 40. RESOLVED — "13-assertion stress harness" is wrong in 19 places — it is 15

**Status**: RESOLVED 2026-08-22, and mechanically, which is why it took the durable route rather
than a `sed`. Measured 2026-08-21. Not a defect; a label that stopped matching the thing it labels,
in a repo whose whole thesis is that agents trust the docs.

**What shipped — a three-link chain, so breaking any link fails a check:**

1. `EXPECTED_ASSERTIONS = 15` in `apps/example-repo-mcp/scripts/stress-mcp.ts`, asserted against
   `results.length` at the end of `main()`. Add or remove a case and `pnpm stress` fails with the
   count, naming the next step.
2. `scripts/check-stress-count.mjs` (`pnpm check:stress-count`, in `pnpm verify` and its own CI
   step) reads that constant and scans the tree for `N-assertion` / `N assertions`, failing with
   `file:line` for each that disagrees.
3. The sweep itself — 45 references now agree, across canonical, the scaffolder `lib/` copies,
   `example/`, the workflows, `mise.toml` and the skills.

**19 was an undercount**: 45 references across 25 files, once the generated `templates.ts` and the
symlinked `CLAUDE.md`/`.cursorrules` are resolved. The entry's own number was measured with a grep
that missed the mirrored surfaces — the same class of error as the label it was reporting.

**The exemption is BY FILE and it is the interesting decision.** `docs/PROJECT_STATE.md` is exempt
because "13 of 13 assertions passed" is a true statement about a run that really had 13; rewriting
it would falsify history to fix a label. But the PROJECT_STATE **template** under
`10-docs-readme/lib/` and its `example/` regeneration are NOT exempt — same filename, opposite
meaning, because a generated repo reads them as a live label. That distinction is tested.

**Two floors guard the checker against the trap this repo keeps meeting** — an operation that
reports success because it had nothing to do. It fails if the walk reaches fewer than 50 files, or
finds fewer than 10 references. Both are asserted in `scripts/check-stress-count.test.mjs` (11 new
cases) by scanning a fixture tree small enough to trip them.

**Red-drilled**: setting the constant to 14 made `pnpm stress` exit 1 with the count message, and
made `check:stress-count` name 59 sites — proving the prose is checked against the constant rather
than against a literal 15 hidden in the checker.

**What it is**: `pnpm stress` prints `15 passed, 0 failed.` Every prose reference says 13. The
count was correct when written; two cases were added since (`caseShutdownMarker` contributes two
assertions from one loop, which is also why a naive `grep -c record(` returns 14 rather than 15).

**Where** — `grep -rn "13-assertion\|13 assertions"`, excluding `node_modules`:

| Surface | Files |
|---|---|
| repo-facing | `README.md:73`, `AGENTS.md:87`, `AGENTS.md:183`, `DEFERRED.md:858` |
| workflows | `.github/workflows/ci.yml`, `.github/workflows/release-packages.yml:173` |
| skills | `skills/mcp-starter-architect/SKILL.md:200`, `:255` |
| docs | `docs/scaffolder-cli/retrofit-findings.md:145`, `docs/scaffolder-cli/field-notes.md:653` |
| shipped into every generated repo | `packages/mcp-kit/src/transports/http.test.ts:6`, the `08-app/lib` copies, and their `example/` regenerations |

**One site must NOT be changed**: `docs/PROJECT_STATE.md:287` reads "13 of 13 assertions passed".
That is a dated record of a run that really did have 13, not a claim about today. Editing it would
falsify a history entry to fix a label — the opposite of the point.

**Why it was not fixed on sight**: it surfaced while fixing the tsx-CLI signal defect, and sweeping
19 files across four mirrored surfaces into that PR would have buried a load-bearing change under
mechanical churn. It is also not the durable fix.

**The durable fix**, which is why this is an entry rather than a one-line `sed`: stop hardcoding the
number. Either drop the count from prose ("the stress harness") and let `pnpm stress` be the source
of truth, or have the harness assert its own case count against a constant so the next added case
fails until the docs move with it. The second buys mechanical enforcement, which is this repo's
stated preference over documentation discipline.

**Trigger to action**: the next PR that adds or removes a stress case, or any docs sweep that is
already touching these files.

**Cost**: ~20 min for the sweep; ~40 min if the count becomes mechanically enforced.

## 41. Three of five consumers are frozen on old kits, so the extraction's whole benefit is not reaching them

**Status**: OPEN but nearly closed — re-measured 2026-08-22 (evening). Four of five consumers are
now current; **browser-tab-mcp's `main` is the only starved tree left**, and its fix already exists,
split across two unmerged branches (see "Where it stands now"). Not a bug in any package — a
systemic failure of the thing publishing is FOR.

**The premise this violates** is George's own, and it is the reason these packages exist at all:

> instead of only one of them getting a cool feature, all the consumers *benefit* because ... we
> wouldnt have bothered writing a vim style navigation (for example) just for the up-bank-mcp alone,
> but since we share the libs - everyone benefits from it

**Measured 2026-08-22 (morning), by reading every consumer manifest on this machine against
`npm view`. Kept as the dated measurement; the current state is the second table below.**

| repo | manifest | declares | reaches | behind |
|---|---|---|---|---|
| EQStack | `apps/voice-mcp/package.json` | robustness `^0.7.0` | `<0.8.0` | **3 minors** |
| EQStack | `apps/imsg-mcp/package.json` | robustness `^0.8.1` | `<0.9.0` | **2 minors** |
| browser-tab-mcp | `apps/browser-tab-mcp/package.json` | robustness `^0.7.0` | `<0.8.0` | **3 minors** |
| browser-tab-mcp | `packages/mcp-kit/package.json` | robustness `^0.7.0` | `<0.8.0` | **3 minors** |
| browser-tab-mcp | `apps/browser-tab-mcp/package.json` | tui-kit `^0.4.1` | `<0.5.0` | **1 minor** |
| life-stack | `packages/os-fork-core/package.json` | robustness `^0.7.0` | `<0.8.0` | **3 minors** |
| life-stack | `apps/os-fork-control/package.json` | robustness `^0.7.0` | `<0.8.0` | **3 minors** |
| life-stack | `apps/os-fork-ctl/package.json` | robustness `^0.7.0` | `<0.8.0` | **3 minors** |

Current: up-bank-mcp (all four, after fixing it the same day) and Gmail-MCP-Server (both, via
`">=0.x <1"`).

**THREE INDEPENDENT MECHANISMS, and fixing one leaves the others.** All three were found in one
day, each in a different consumer, and each would have been "fixed" by the wrong check:

1. **A caret on 0.x locks the MINOR.** `^0.7.0` is `>=0.7.0 <0.8.0` and can never reach 0.8, 0.9 or
   0.10, however often you install. `pnpm install` reports "up to date" throughout. (All three
   starved repos.)
2. **A version-PINNED `minimumReleaseAgeExclude`.** life-stack's read
   `'@george43g/robustness@0.5.2 || 0.6.0 || 0.7.0'` and **stopped covering robustness the day 0.8.0
   shipped**. They had this stacked on top of mechanism 1, so correcting the caret alone would have
   let the range reach 0.10.0 while the release-age quarantine still refused it. Verified live rather
   than assumed: 0.7.0 was 11 days old, 0.10.0 was 0 days old. **A caret and a hand-maintained
   version allow-list fail identically — both silently stop covering the next release. A wildcard
   cannot go stale; a version list provably does.**
3. **A LOCKFILE pinned below a correct specifier.** browser-tab-mcp's `pnpm-lock.yaml` held
   `'@george43g/tui-kit@0.5.0'` under a `specifier: ^0.5.0` that permitted 0.5.1. The manifest was
   already right and they were still on the fail-open. This is the one that survives fixing both
   others, because a lockfile holding a version steady is what a lockfile is FOR — nothing about it
   looks wrong.

**MECHANISM 5, found 2026-08-22 in THIS repo, and it inverts the recommendation this entry made.**
**A comparator range takes the newest version only on FIRST resolution.** An existing lockfile entry
that still satisfies the range is retained indefinitely, and `pnpm install` reports nothing.
Reproduced from scratch, twice:

```
A) existing satisfying entry, plain `pnpm install`:
     specifier: '>=0.1.1 <1'
     version: 0.1.1          <-- stays. forever.
B) then `pnpm update`:
     specifier: ^0.11.0      <-- MANIFEST REWRITTEN
     version: 0.11.0
```

**MECHANISM 6, found the same hour by life-stack and confirmed here: `pnpm update` silently
normalises a comparator range into a caret.** So 5 and 6 are locked together — `pnpm update` is the
only escape from 5 and is exactly what causes 6, re-arming mechanism 1.

**The proof is in this repo, which is the damning part.** `apps/mcpsync/package.json` carried
`">=0.1.1 <1"` for months. From the committed lockfile before the fix:

```
  apps/mcpsync:
    dependencies:
      '@george43g/robustness':
        specifier: '>=0.1.1 <1'
        version: 0.1.1
```

**0.1.1 — the first version ever published. Ten minors behind, in the PUBLISHER'S OWN TREE, on the
range this entry recommended to five consumers.** It was found only because it poisoned a new
package: pnpm reused that stale entry for `packages/mcp-kit`'s identical new specifier, and the
typecheck failed `TS2305: has no exported member 'getShutdownCause'`.

**Corrected scoreboard for 0.11.0, from LOCKFILES rather than manifests** — the earlier
"comparator repos: 2 of 2" in this entry was read off specifiers and was wrong:

| repo | specifier | lockfile holds | current? |
|---|---|---|---|
| life-stack | `>=0.10.0 <1`, now `^0.11.0` | 0.11.0 | yes — via `pnpm update`, which destroyed the range |
| Gmail-MCP-Server | `>=0.9.0 <1` | **0.10.0** | **no** |
| this repo (mcpsync) | `>=0.1.1 <1` | **0.1.1** | **no, by ten minors** |

**THAT FLIP IS WITHDRAWN — see the correction at the end of this entry.** It stood for one day, was
given to four consumer sessions, and was wrong. The observation below is accurate; the conclusion
drawn from it is not.

~~So the recommendation flips: a hand-bumped caret is the BETTER option, not merely the defensible
one.~~ A caret starves **visibly** — the manifest says `^0.10.0`, anyone can read it, and it gets
fixed. A comparator range starves **invisibly**, with a manifest that looks correct and an install
that reports success. up-bank and EQStack both declined the floating range on gate-coverage grounds
and were right for a reason neither of them needed.

**up-bank's generalisation, in their words, and it is better than the one this entry had:**

> "do you have a gate" is the wrong question; "does your gate cover the surface that changes" is the
> right one

Their stress cases 8–16 gate the lifecycle surface on both transports; **nothing** gates the logging
surface — and both 0.11.0 fixes landed in the ungated half. Record their lag as *"explicit bumps;
gate covers lifecycle only, logging surface ungated"*, never as "starved by design", which loses the
reason.

### CORRECTION 2026-08-23 — the caret flip is withdrawn, and this repo already knew

Rejected by **life-stack**, and the deciding evidence is in this repo's own `verify` chain.

**Their argument, which is not a cost trade but a category difference:**

> Starvation is a **recoverable** state — one command, at any later date, from any version, once
> anything notices; what's published is still on the registry. A forced floor assertion is an
> **irrecoverable erasure** — once a manifest reads `^0.12.0`, the fact that the consumer never
> needed 0.12.0 is gone, with no registry to re-derive it from and no way for the next reader to
> distinguish "we require this" from "this is how you move a caret".

A staleness check can restore a stale version. **Nothing restores a distinction every manifest has
been forced to erase.** So it dominates rather than trades, regardless of whether a check runs.

**The related trap:** a caret on a 0.x pins the MINOR, so `^0.11.0` resolves `>=0.11.0 <0.12.0` and
**no `pnpm update` can ever cross it**. Every bump is therefore a manual edit that asserts a floor
nobody chose. A comparator bump is a pure lockfile fact — life-stack's fix for four consumers touched
**no `package.json` at all**. Hence their refinement to the two-step above: **restore the range that
was there; do not raise the floor.** The bump is a lockfile fact; the floor is a statement of need.

**And this repo had already settled it, executably.** `scripts/check-publishable-manifests.mjs:170-200`
reads every published package's declared sibling range and fails the build when it stops admitting the
sibling's current version — so **floors here are load-bearing, not decorative**. Its own remediation
text, verbatim:

```
Fix: widen it. A caret on a 0.x pins the MINOR, so a sibling bump strands this consumer with
ERESOLVE. Prefer a comparator range that survives future bumps — ">=<current> <<nextMajor>" —
over appending another "|| ^<current>" clause, which has to be re-edited every release.
```

`check:publishable-manifests` runs inside `pnpm verify`. **The repo has been telling every reader to
prefer comparator ranges, in a message that fails the build, throughout the day this entry
recommended the opposite.** Same failure family as the mis-relayed anchors: the evidence was present,
local, and load-bearing, and a fresh inference was substituted for it.

Under carets that rule would keep **passing while reading floors that are artefacts of the last
bump** — a check that passes on noise, which is worse than no check.

**Standing recommendation, restored and now grounded — scoped to FIRST-PARTY SIBLINGS, deliberately:**
comparator ranges (`>=X <NEXT_MAJOR`) between packages this repo publishes and for the consumers it
serves, with currency enforced at the **lockfile**, never at the specifier. The narrow cell where a
caret is genuinely free — a single consumer with nothing reading floors — does not describe this repo,
which publishes five packages with sibling ranges among them and has four external consumers.

**It does NOT generalise to a third-party 0.x dependency**, and life-stack's reason for the scoping is
the right one: `>=0.11.0 <1` in a published manifest is a forward-compatibility *promise* — every
future 0.x of that sibling will work with me — which is exactly the promise 0.x semver exists to
decline. It is enforceable here only because **one party controls both ends**: both sides of every
sibling range are released together by tooling that checks them against each other, which is why
`check-publishable-manifests.mjs` can exist at all. Stated as a universal range policy it would
replace one over-general rule with another.

**Why `<1` is safe here, and precisely where it isn't.** `rangeAdmits` is a *version-range* check; it
is blind to semantic breakage and cannot tell that a sibling's new minor broke a consumer. The reason
`<1` still contains the damage is a convention, not the check: **a breaking marker on a 0.x publishes
1.0.0, not the next minor** (#34), so a deliberate breaking change lands outside `<1` by construction.
The residual is an **accidentally** breaking minor — which is already the recorded open gap (#37), and
which carets would not fix either. A caret merely defers the same break to whoever bumps next, and
buys that delay by erasing the floor signal permanently.

### ~~THE LIVE INSTANCE IS NOT IN `packages/*` — IT IS WHAT THE SCAFFOLDER MINTS~~ — WITHDRAWN, see below

Both published sibling ranges are already comparator, verified 2026-08-23:
`packages/mcp-kit` → `@george43g/robustness: >=0.11.0 <1`, `packages/tui-kit` → `>=0.1.1 <1`. **There
are no carets left to convert here.**

But `apps/scaffolder/scripts/build-templates.mjs:207` computes every generated repo's dependency range
as a caret:

```js
`version: ${JSON.stringify(p.version)}, range: ${JSON.stringify(`^${p.version}`)} },`,
```

so the tracked example — and therefore **every repo the scaffolder has ever produced** — is born with:

```
@george43g/cli-kit      ^2.0.1
@george43g/mcp-kit      ^0.1.0     ← cannot reach 0.2.0
@george43g/robustness   ^0.12.0    ← cannot reach 0.13.0
@george43g/secret-store ^0.2.2     ← cannot reach 0.3.0
@george43g/tui-kit      ^0.5.1     ← cannot reach 0.6.0
```

**Four of five are 0.x, where a caret pins the MINOR.** So the scaffolder mints, into every new repo,
the exact defect that starved three of four consumers — permanently unreachable by `pnpm update`, with
a floor assertion nobody chose. This is #41's own mechanism, generated at scale, by the tool this repo
exists to ship.

**WITHDRAWN 2026-08-23, before it was built — the scaffolder's carets are CORRECT.** Cancelled by
life-stack's invited counter-argument, on a question of fact about this repo I had not asked:
**who are the generated repos for?**

Measured: `README.md:25` is `npx @george43g/mcp-scaffold init my-tool --name foo`, and the GitHub repo
is **PUBLIC** (`gh repo view` → `visibility=PUBLIC private=false`). **Generated repos leave the
fleet.** Anyone can produce one.

That inverts the rule, and for exactly the reason the first-party scoping exists. A comparator range
in generated output would make George promise forward-compatibility across **every future 0.x** of
five packages, to strangers who have none of what makes that promise keepable here: no
`check-publishable-manifests`, no shared release tooling, no 1.0.0 convention, no lockfile discipline
anyone can see. `>=0.12.0 <1` handed to a third party is a promise nobody can keep.

**For a stranger a caret on a 0.x is the right default, and it is what caret semantics are for**:
patches arrive automatically, a minor is a deliberate reviewed act. The starvation documented in this
entry is a **first-party** problem — *we* want our own consumers tracking our minors — and that
expectation does not transfer to someone who merely installed our template.

**So the rule is two-sided, and `build-templates.mjs:207` already implements the correct half:**

| range site | correct form | why |
|---|---|---|
| first-party siblings + fleet consumers | **comparator** `>=X <NEXT_MAJOR` | one party controls both ends, releases them together, and a check reads the floors |
| **generated output for third parties** | **caret** `^X` | recipient controls neither end, inherits no convention, and a 0.x minor from a stranger should be an opt-in |

**Nothing to change.** The one-line "fix" would have converted a correct default into a promise this
repo cannot honour, in the output of the tool it exists to ship — and it would have looked like a
tidy mechanical improvement in review.

**The generalisable lesson, which outranks the range decision:** the withdrawn finding was produced by
applying a rule that was correct in its own scope to a surface outside that scope, one message after
scoping it. The counter-argument that killed it was invited, not volunteered, and it turned on a fact
about my own repo that neither of us had looked up.

**Deferred, not done:** life-stack's `scripts/check-deps-stale.mjs` (138 lines, no dependencies,
`npm view` per package, **exit 2** on an unreachable registry because an unanswered question is not a
clean answer) is the missing piece — `verify` deliberately never touches the network, so nothing here
detects a stale lockfile. **Trigger:** George's call. If taken, port theirs rather than write a second.
Their own caveat applies: it had never once been executed before the day it caught this, and *a
correct check nobody runs fails exactly like a broken one*.

**MECHANISM 5 IS NOT PNPM-SPECIFIC.** gmail-cli-mcp measured the same retained-entry behaviour from
npm under `npm install --package-lock-only`: a comparator range kept 0.10.0/0.5.0 exactly as pnpm
did. One asymmetry, and it matters for the fix: **`npm update` does NOT rewrite the manifest range
to a caret; `pnpm update` does.** So a dual-lockfile repo needs the two-step on both sides, and the
hand-restore on pnpm's side only. Measured in their tree, not by us.

**So the check is: specifier, quarantine allow-list, AND resolved version in the lockfile — and the
last one is not a merge-time check, it is the ONLY valid check, always.** The stable fix is two
steps and reverts if either is skipped: `pnpm update <pkg>`, then restore the range by hand, then
`pnpm install`, then confirm with `--frozen-lockfile`.

**life-stack built the durable form** — `scripts/check-dep-ranges.mjs`, failing the build on any
first-party range that pins a 0.x minor, naming `pnpm update` as the likely cause, tested against a
real violation, and failing loudly on scanning zero manifests. It immediately caught a manifest this
entry's table called current: `apps/tapo` on `secret-store ^0.2.2` — correct today, armed to starve
the day 0.3.0 ships. **That gap between "is current" and "will stay current" is the argument for a
check over a report**, and it extends up-bank's rule: per-package beats per-name, per-mechanism beats
per-package. A check here must also catch mechanism 5, which no range-shape test can see: assert the
RESOLVED version, not the range.

**What is not being received**: the observe-only `WatchdogOptions.onBreach` (0.9.0) and the
`snapshotHealth` test seam (0.10.0).

**CORRECTED 2026-08-22 by EQStack, and the correction deletes the only exception in this entry.**
This paragraph used to also list `getShutdownCause`/`noteShutdownCause` and
`WatchdogState.memorySampled` (0.8.0/0.8.1) and call EQStack "two minors behind their own feature".
They were not. imsg adopted those APIs **at `^0.8.1`**, during the adoption arc that shipped them,
and its `shutdown.ts` / `watchdog.ts` have been thin delegates over the kit ever since — verified in
their tree rather than taken on their word: `apps/imsg-mcp/src/shutdown.ts:29` imports
`createShutdownController`, `src/watchdog.ts:28` imports `createWatchdog`, `src/tui/App.tsx:709`
calls `noteShutdownCause`, and `src/watchdog.ts:65` documents the `memorySampled` lift. The caret
starved them of 0.9/0.10 only — neither of which came from their brief. So browser-tab's *"adopting
an API to justify a bump inverts the dependency"* applies **uniformly, with no carve-out**: the
pure-starvation argument was the whole argument, and the exception I kept for EQStack never existed.
They also asked that `voice-mcp`'s `^0.7.0` stop being described as deliberate — it simply predated
the 0.8.x arc, which only ever touched imsg.

**The reporting lesson, from up-bank-mcp, and it is the transferable part.** I told them they were
starved on tui-kit. They checked all four kits rather than the one named, and found robustness
starved in **two** manifests — the worse problem, which I had missed:

> a starvation report scoped to one package teaches the recipient to check that package. The failure
> is per-range, so the check has to be per-package across every manifest.

EQStack is the exact case they predicted: bumped tui-kit, left robustness frozen.

**What was done**: each affected session was sent its own per-package table with file paths, rather
than a package name. Not fixed by us — **peer repos are read-only.**

**Not proposed: a blanket "use `>=0.x <1`" mandate.** up-bank declined it with a good reason —
it conflicts with a policy they recorded after an accidental major, and reversing a recorded
decision silently because an upstream README changed is how two sessions start fighting through a
document. They bumped carets explicitly instead. Either resolution is fine; the frozen state is not.
Their second point is sharper still: floating ranges assume a gate pinning **exact behaviour**, and
their PTY check covers tui-kit while nothing equivalent watches robustness.

**Trigger to action**: the next kit release. Sweep the consumer manifests and send tables, or accept
that a release reaches two of five repos.

**The durable fix, if someone wants one**: this cannot be a CI check here — the consumers are other
repos on one developer machine, and a script that greps `~/repos/*` has no place in a template that
gets scaffolded elsewhere. The honest options are (a) a local, uncommitted sweep script run at
release time, or (b) accept the manual sweep and keep the guidance in each kit's README, where it
now is. Neither is mechanical enforcement, which is this repo's stated preference — so this entry is
the record that the preference could not be satisfied here, not an oversight.

**Verification the consumers used, worth copying** — three of them independently refused to trust a
green build, because this is the fourth costume of a trap collected four times in one day (an
operation that reports success because it had nothing to do):

- life-stack ran `turbo --force typecheck` and `--force test`, because **turbo caches and a cache hit
  is indistinguishable from a passing build**, then confirmed the five APIs were present in the
  shipped `.d.ts`. Three minors of a pre-1.0 package is a real API risk.
- browser-tab-mcp ran `pnpm verify` fully uncached in a fresh worktree.
- up-bank-mcp ran their PTY check, capturing the pane and grepping for the accent background, because
  a unit test would not have shown the cursor scrolling out of view.

**A framing correction I owe, from browser-tab-mcp**: an earlier version of this entry said "what
you are not receiving", which reads as a pitch to ADOPT those APIs.

> adopting an API to justify a bump inverts the dependency. The bump ships on starvation grounds
> alone; adoption is a separate, future decision.

Right. Being three minors behind is itself the defect — it means the next fix you actually need is
also unreachable, and you discover that on the day you need it. Whether any given API earns a call
site is unrelated. The one genuine exception is EQStack, who are two minors behind
`getShutdownCause`/`memorySampled` — **features built from their own brief, at their request.**

**Where it stands now — re-read from every consumer tree on this machine, 2026-08-22 evening:**

| repo | tree read | robustness | tui-kit | state |
|---|---|---|---|---|
| EQStack | `main` @ `594d23f` | `^0.10.0` (both apps) | `^0.5.1` | **current** |
| up-bank-mcp | `main` | `^0.10.0` (app + vendored mcp-kit) | `^0.5.1` | **current** |
| life-stack | `main` | `>=0.10.0 <1` (×3) | — | **current** |
| Gmail-MCP-Server | `main` @ `66986bf` | `>=0.9.0 <1` | `>=0.4.1 <1` | **current** — was lockfile-stale at 0.10.0/0.5.0; fixed 2026-08-22 |
| browser-tab-mcp | `main` @ `d9eb157` | `^0.11.0` (app + `packages/mcp-kit`) | `^0.5.1` | **current** (was starved; PRs #87 + #88 landed 2026-08-22) |

EQStack verified resolution **from disk** rather than from the specifier, and their lockfile agrees
(`pnpm-lock.yaml:650,654` → `robustness@0.10.0`, `tui-kit@0.5.1`), so all three mechanisms are clear
there. Their `minimumReleaseAgeExclude` was already the wildcard `@george43g/*` form — mechanism 2
never applied — on pnpm 11.1.1, where the quarantine is live and the config therefore load-bearing.

**RESOLVED 2026-08-22 — both browser-tab PRs landed and the split-branch hazard was navigated.**
Verified from their `origin/main` rather than taken on their word: both manifests read `^0.11.0`,
tui-kit `^0.5.1`, and `pnpm-lock.yaml:718,722` resolve `robustness@0.11.0` and `tui-kit@0.5.1`. The
floor-bump property they identified is what made the merge safe — `^0.11.0` cannot admit 0.10.0, so
a wholesale lockfile take would have failed `--frozen-lockfile` loudly. **The hazard below stays
recorded, because the property that saved them is an accident of that pair, not a policy.**

**A FOURTH HAZARD, found by reading browser-tab's tree rather than by being told: a fix split across
two branches, with the lockfile as the conflict surface.** Their `main` is starved on both kits and
both halves of the fix exist — but on different branches, and each branch's lockfile pins the OTHER
kit at the old version:

| branch | manifest says | lockfile holds |
|---|---|---|
| `chore/deps-robustness-010` | robustness `^0.10.0`, tui-kit `^0.4.1` | `robustness@0.10.0`, `tui-kit@0.4.1` |
| `feat/tui-primitives-port` | robustness `^0.7.0`, tui-kit `^0.5.1` | `robustness@0.7.0`, `tui-kit@0.5.1` |

Whichever merges second hits a `pnpm-lock.yaml` conflict, and resolving it by taking one side
wholesale — the ordinary reflex for a generated file — reverts the other kit to the starved version
**while both manifests still read correctly**. This is mechanism 3 again (a lockfile below a correct
specifier), except manufactured by the merge rather than inherited.

**REFINED by browser-tab-mcp the same day, and the refinement moves where the silence actually is.**
They confirmed the table verbatim against both refs and then supplied two properties not visible
from outside their repo. Both verified here rather than taken on their word:

1. **Both bumps raise the specifier FLOOR above the old resolution** — `^0.10.0` rejects `0.7.0`,
   `^0.5.1` rejects both `0.4.1` and `0.5.0`. So on the LOCKFILE side the wholesale take is *not*
   silent: a plain `pnpm install` re-resolves upward because the old resolution no longer satisfies
   the spec, and skipping the install fails loudly — their `.github/workflows/ci.yml:70` and `:185`
   both run `pnpm install --frozen-lockfile`, which refuses a lockfile out of sync with the
   manifests (a third site, `screenshots.yml:40`, does too).
2. **The silent path is the `package.json` hunk, not the lockfile.** The two lines sit four apart
   (`apps/browser-tab-mcp/package.json:65` robustness, `:69` tui-kit, on `main`), so one conflict
   hunk can span both, and taking a side there reverts a bump **consistently** — manifest and
   lockfile agree, install green, `--frozen-lockfile` green.

**So the accurate rule, and it keeps the general form on purpose**: a wholesale lockfile take is
silent **only when the surviving specifier still ADMITS the old version**. A floor bump plus
frozen-lockfile CI closes that side — *when both are true*. The manifest-hunk path stays open
regardless. And per their own counter-argument to their own refinement, which is why the general
form stays: **the floor-bump property is an accident of this pair, not a policy anyone recorded.** A
future pair where one side is a lockfile-only refresh under an unchanged caret reproduces the
original hazard exactly as first written.

**The catch that covers both paths** is the one EQStack used: read the resolved version out of
`node_modules/@george43g/<kit>/package.json` after installing **on the merge result**, for every
kit — not the specifier out of the manifest. Adopted downstream: their PR #88 now carries a
"Merge-order procedure" section with that check, and #87 a cross-link, so it is visible whichever
merges first.

**Why the fix was split, since the answer changes the advice** (asked, answered, deliberate — with
one honest unknown they volunteered): tui-kit rides the port branch because *the port is what
consumes 0.5.x*, and whether 0.4.1-era code runs against 0.5.x unmodified is **unknown, never
tested** — the port was written against the 0.5.0 API rather than migrated incrementally, and that
uncertainty is itself why the bump could not land on `main` alone. robustness got its own branch
because it arrived after the feature branch had finished review, and folding a three-minor
lifecycle-dep change into an already-reviewed PR widens its review surface retroactively. So the
rule is not "never split a dep bump":

> a dep bump rides the branch whose code requires it; an unrelated bump gets its own branch; the
> second merge REGENERATES the lockfile from the merged manifests and verifies both resolved
> versions.

The cost of the road not taken (one combined branch) is theirs, and it is real: the robustness bump
would then be gated behind George's TUI live-drive, and a tui-kit-only revert would drag robustness
with it. Peer repos are read-only — the fix is theirs.

**A DIAGNOSTIC TRAP worth more than the starvation itself, from browser-tab 2026-08-22.** Their
`^0.11.0` PR went red three times, and the obvious story — a three-minor robustness jump broke
something — was wrong. They cleared the dep by reading the 0.7.0→0.10.0 source diff for a MECHANISM
(shutdown/watchdog/health/index, all additive, all inert for sockets) and by observing the same
failures on 0.7.0 trees. The real cause was six integration files drawing ports from one 500-port
band under parallel forks, with the collision SILENT: a swallowed `EADDRINUSE`, then a foreign
WebSocket server answering an HTTP fetch with `426 Upgrade Required`. Fixed structurally with a
disjoint band per file — 2 of 6 targeted parallel runs failed before, 8 of 8 after, collision
impossible by construction.

> a consumer-side flake that clusters on a dep-bump PR is not evidence against the dep until the
> bump's diff contains a mechanism

This matters to THIS repo specifically: a kit bump is the most conspicuous change in any consumer PR,
so it collects blame for every flake it coincides with. If a consumer reports a kit regression, the
first question is which line of the diff could produce that symptom — and "none" is an answer.

**RE-OPENED WITHIN THE HOUR BY 0.12.0, which is the argument for a check over a report.** All five
consumers reached `robustness@0.11.0` on 2026-08-22 — the first time in this arc — after five
hand-written tables and five sessions acting on them. `0.12.0` published the same evening. Resolved
versions read from consumer lockfiles that night:

| repo | resolves |
|---|---|
| EQStack | **0.12.0** |
| browser-tab-mcp | 0.11.0 |
| life-stack | 0.11.0 |
| up-bank-mcp | 0.11.0 |

One of four current, hours after four of four were. **A state that takes five agents a day to reach
and one publish to undo is not fixed, it is being manually held.** The durable form is life-stack's
`scripts/check-dep-ranges.mjs`, extended to assert the **resolved** version rather than the range's
shape — mechanism 5 is invisible to any test that only reads a manifest.

**Cost**: ~15 min per release to sweep and report; unbounded if it keeps not happening.

---

## 42. Email redaction in robustness — TAKEN AMENDED; the `handle` primitive — REJECTED

**Status**: negotiated 2026-08-22 with the EQStack session, same shape as the TUI-primitives round.
Two kit-shaped items came out of their contacts-factorisation survey. One passes the extraction
criterion, one stopped passing it the same evening. Every claim below was verified against source
before answering — all of theirs held.

### Item 1 — `handle` micro-primitive (`normalizeEmail`/`isLikelyEmail`/`parseAddress`): REJECTED

Not because the duplication is imaginary. It is real and was confirmed:
`apps/imsg-mcp/src/identity.ts:37` (`trim().toLowerCase()`) against
`apps/imsg-mcp/src/contacts-db.ts:92` (`toLowerCase().trim()`), and the byte-identical
`/^[^\s@]+@[^\s@]+\.[^\s@]+$/` in `apps/imsg-mcp/src/recipient.ts:194` and
`apps/gmail-mcp/src/utl.ts:37`.

**It is rejected because the cross-repo case disappeared while the survey was being written.**
`apps/gmail-mcp/` is now INSIDE EQStack — the migration landed the same evening — so imsg and gmail
are one tree. And no other consumer touches email at all; swept read-only for
`normalizeEmail|isLikelyEmail|parseOneAddress|email-addresses` plus email-shaped regexes:

| repo | hits |
|---|---|
| browser-tab-mcp | none |
| up-bank-mcp | none |
| life-stack | none |
| this template's golden output | none — it ships `health_check`/`noop` |

One consumer. George's criterion — *"instead of only one of them getting a cool feature, all the
consumers benefit"* — is not met, and a kit would put an RFC-5322 parser into every scaffolded repo
that will never call it.

**The argument that actually decided it is about THEIR speed, not our charter**: extraction would
make their fix slower and add a failure mode they do not have. Locally, one PR deletes six
implementations. As a kit, it is publish-then-adopt across two PRs a release apart (#23's rule), and
they inherit #41's starvation surface for code only they run — paying the coordination cost of
sharing with nobody.

**A real correctness bug rides along and should be fixed locally today, not blocked on this.**
`apps/gmail-mcp/src/reply-all-helpers.ts:25` unwraps with `/<([^>]+)>/`; run rather than read:

```
input:           "a <b" <c@d.com>
/<([^>]+)>/  →   "b\" <c@d.com"
expected     →   "c@d.com"
```

That value is pushed into a reply-all recipient list. The `parseAddress` SHAPE they proposed —
RFC-first with a never-fail `{name:"", email: raw.trim()}` fallback — is the right fix; it just
belongs in their tree.

**Trigger to reopen**: a second repo growing email handling. Then it is two consumers and the answer
flips. Cost of being wrong in this direction is one duplicate implementation — cheap, and reversible
the easy way.

### Item 2 — an email rule for `redact`: TAKEN, AMENDED, and the amendment is a defect in the proposal

**Their claim is confirmed at source.** `packages/robustness/src/redact.ts:13-18` carries exactly
two rules — `PHONE_RE` (E.164-ish) and `SECRET_RE` (bearer/API-key shapes). Emails are not covered,
so redaction-on does not protect them. Unlike Item 1 this passes cleanly: **all five consumers use
this logger**, and the exposure class (error text quoting an address) is reachable by any of them.

**But the proposed shape would corrupt logs, and it is not a close call.** A redaction rule must be
UNANCHORED to find addresses inside text. Run against realistic lines:

```
MATCH "sending to george.x@gmail.com failed"          -> ["george.x@gmail.com"]        <- the one true positive
MATCH "clone git@github.com:george43g/mcp-cli-...git" -> [whole clone URL]
MATCH "resolved lodash@4.17.21 from registry"         -> ["lodash@4.17.21"]
MATCH "specifier @george43g/robustness@0.11.0"        -> ["george43g/robustness@0.11.0"]
MATCH "postgres://svc@db.internal.corp/main"          -> [whole URL]
clean "image sha256:abc123 pulled"
```

**Five of six match; one is an email.** Default-on would mangle package specifiers and git remotes in
every generated repo's logs — including this one's, where `@george43g/robustness@0.11.0` appears
constantly. **The phone rule earns default-on because `+` then 7–15 digits is unambiguous; `x@y.z` is
also the shape of a version specifier and an SSH remote.** That asymmetry is the whole design.

**Agreed shape, pending their confirmation, as `robustness@0.12.0` (additive, no call-site changes):**

1. `redactEmail(s)` exported — the shared tested rule. `george.x@gmail.com` → `g…x@gmail.com`;
   single-char local part → `g…@gmail.com`; **domain preserved**, being the diagnostically useful
   half and rarely the identifying one.
2. An opt-in global toggle (`MCP_LOG_REDACT_EMAILS` / `setEmailRedaction`), **default OFF**,
   documented with the table above so the default reads as a measurement rather than timidity.
3. **Not in `redactString` by default** — applied at the boundary the consumer knows carries
   addresses (a Gmail API error object), which is a known boundary rather than arbitrary text.

**The counter-argument against our own amendment, recorded because it is strong**: an opt-in
redaction rule is a footgun the other way — "redaction is on" while emails leak is false confidence,
the same class this fleet spent two days on. The judgement is that corrupting five consumers' logs to
protect one is worse, and that a default-on exclusion list would need to cover at minimum `git@`,
`scheme://user@host` and `name@semver` and could not be argued closed. **If EQStack makes the
exclusion-list case, take it seriously.**

**An empirical note from them worth more than either item.** Both gmail and imsg have had phone
redaction all along, purely by using this logger — and **two sessions independently inferred they
had not adopted it, from a missing import.** Default-on design did the work silently and the silence
read as absence. Pair it with life-stack's constructed-env-name near-miss and the rule is:
**inferring behaviour from the absence of a call site is only valid when the behaviour requires a
call site.**

**Sequencing warning already sent**: their explicit-pin policy means `^0.11.0` will not reach 0.12.0.

---

## 43. PARKED — telemetry to the home OpenObserve, pending George's own proposal

**Status**: **PARKED 2026-08-22 by George**, mid-discussion, with *"your assumptions are wrong. I will
propose a way forward."* **Do not resume the design from this entry.** It exists so the measured
facts survive; the conclusions below it are explicitly superseded by whatever he proposes.

**The ask, verbatim**: every tool he builds should store error / status / diagnostic / **performance**
logs on the home server's OpenObserve, spooling while it is unreachable and flushing when it returns
— *"so that i can get the needed feedback to improve all my tools"* — while never running for anyone
else who installs the same tools.

### Measured facts (keep these; they cost two peer sessions real work)

From **g-home-server**, probed live on the server:

- Ingest is **not** OTLP and **not** OpenObserve directly. It is Vector: `POST
  https://ingest.lan.melbournewebco.com.au/`, JSON array body, `http_server` source on `:8687`
  behind Caddy. Vector forwards to `http://openobserve:5080/api/default/wm_stack/_json`.
  **Do not write to `openobserve:5080`** — 127.0.0.1 only on the host.
- Auth is **HTTP Basic**, one credential from a Docker secret. Not mTLS, no bearer.
- **Reachability is LAN-only.** Assume an offline window of **days, not hours**.
- **Nothing tails anything today.** Vector on the server has no `file` source; its disk buffer sits
  between Vector and OpenObserve, i.e. server-side only.
- `remove_after_secs` verified: three closed files, six lines delivered, all three deleted after full
  read. Wiping the checkpoint dir causes **duplicates, not loss** (`A1 A2 A1 A2`) — the benign
  direction. Measured on Linux containers; **not tested on macOS**.
- **A file deleted before the shipper reads it is lost in TOTAL SILENCE** — one of two files removed,
  the survivor delivered, **zero** warnings about the missing one. "The reaper won the race" is
  indistinguishable from "there was nothing to ship".

From **life-stack**, read from source:

- **A governing decision already exists**, `apps/opkeep/lib/otlp.sh:10-16`, George 2026-08-21
  (*"split by encodability"*): shell tools that can only speak JSON go direct; **tools that already
  carry an OTel SDK may route via Vector for its disk buffer.** Measured on Vector 0.44.0: its OTLP
  source accepts **only** `application/x-protobuf`; JSON gets `500 Rejection(InvalidHeader)`.
- life-stack HAS shipping code — `apps/opkeep/lib/otlp.sh`, 131 lines, live — with **five rules worth
  stealing**: off by default (no endpoint ⇒ **not one subprocess spawned**); never the value (the emit
  function is not passed a secret); never blocks and never fails the call; no recursion; and
  `--cached-only` never emits.
- **No spool-and-retry exists anywhere in the tree.** opkeep deliberately does the opposite —
  `README.md:322` states losing a span during a collector restart is *acceptable* because these are
  *"a diagnostic aid, not a record of record"*. That is a stated non-goal, not an unfinished feature.
- launchd is the established pattern, and MCP tools already run that way: `com.george43g.browser-tab`
  and `com.george43g.up-bank` are loaded on this Mac today.
- OpenObserve and Vector live in a **third repo** — `D:\src\workstation-platform`, a different
  session's — so the collector side is neither this repo's nor life-stack's.

Checked here: **Vector is not on Homebrew** (`brew info vector` → no formula) and is not installed.
George says the dotfiles session is building a custom formula, which changes that cost.

### The one defect this surfaced in shipped code

`pruneLogs` (`robustness@0.11.0`, shipped 2026-08-22) reaps by **count** — `MCP_LOG_KEEP_FILES`,
default 5 — and reaps **silently**. Five files is five *rotations*, which a burst crosses in minutes.
The reasoning for a count was sound for the problem it solved (rotation caps each file, so
`keep × maxBytes` IS the byte budget) and became wrong when a delivery requirement appeared under it.
**A retention policy that is right for disk is not automatically right for delivery; the two want
different units.** Whatever ships, this needs revisiting.

### What is explicitly UNRESOLVED

- **Diagnostic aid, or record of record?** Every branch turns on it. opkeep answered it for itself
  (aid). Unanswered for this fleet.
- **Where the spool lives.** g-home-server argues `$TMPDIR` is fatal because macOS deletes it and the
  loss is silent. George argues `$TMPDIR` is *correct* precisely because it guarantees eventual
  deletion — no unbounded growth, no sensitive data lingering on a stranger's disk — with Vector
  picking files up promptly into its own cache. **Both positions are recorded; neither is adopted.**
- Whether an agent is configured (Vector) or written, and where it lives.

---

## 44. De-vendoring mcp-kit is blocked for browser-tab and free for up-bank — measured, opposite directions

Opened 2026-08-22, when the scaffolder stopped vendoring `mcp-kit` (#25 item 3). Both consumers that
carry `packages/mcp-kit/` had already diverged from the published `0.1.0`, and **the divergence runs
in opposite directions**, so one generic "please migrate" message would have been wrong for both.

Measured by diffing each tree against `packages/mcp-kit/src/` at the `mcp-kit-v0.1.0` tag, which is
byte-identical to what is on npm (`git log mcp-kit-v0.1.0..HEAD -- packages/mcp-kit` is empty).

### up-bank-mcp — purely stale; loss-free, but NOT free. ADOPTED 2026-08-22 (their PR #33)

Their copy predates the fold-in. It lacks `ContentBlock`, `ToolDefinition.toContent?` and
`BuildDispatcherOptions.devOnlyEnabled?`; every other difference is the older text of the same file.
They verified rather than trusting the diff, and confirmed it: every "ours-only" line was a comment,
a `biome-ignore` pragma, or reformatting — no unique functionality. Pinned `^0.1.0` off `npm view`.

**CORRECTION TO THIS ENTRY'S OWN ADVICE — "pure upgrade" was wrong, and it was my word.** Nothing of
theirs was lost, which is what I measured; I then reported that as a *free* upgrade, which I had not
measured. Narrowing `content[]` from `{type:"text";text:string}[]` to the `text | image` union is
**not additive at the call site**: it broke **29 type errors across 9 files** in their tree,
including `src/cli.ts` and `src/tui/data/source.ts` — application code, not just tests. About twenty
minutes, resolved once in a `src/tool-content.ts` helper (`firstText`/`textBlocks`) rather than
scattering casts.

That cost is *intended* — this repo's own docblock says the compile error "is wanted here… it lands
exactly at the render site where a decision about the new block type has to be made" — but a
consumer told "free" who then sees their typecheck go red across their app will either revert or
start casting. **Quote the number, not the adjective: ~29 errors, one helper module, one sitting.**
The obvious way to read a tool result is `content[0].text`, so assume every consumer does.

**Second-order effect worth pre-announcing:** the published tarball ships no tests, so de-vendoring
removed mcp-kit's 27 tests from their suite (209 → 184). Correct — one does not run a dependency's
suite — but a repo that treats test count as a regression signal will read it as one. It cost them a
second look to confirm it was the deletion and not a silent skip.

### browser-tab-mcp — two blockers, one of them security-relevant

1. **`sanitizeContent()` exists only in their copy.** Not in published mcp-kit, so de-vendoring
   deletes it. It is a real API, not a tweak: null-safe, returns `""` rather than `null`, strips the
   same ANSI/C0 set as `sanitize` but caps at a 1 MB budget with a `…[truncated]` marker instead of
   truncating to a small default. **Upstreaming it is a mcp-kit minor**, and it is the same shape as
   every other lift: their vendored addition is the work order.

2. **The dev gate's default is inverted between the two copies.** Published `dispatch.ts:92-93`:

   ```ts
   const devGated =
     def?.devOnly === true && opts.devOnlyEnabled !== undefined ? !opts.devOnlyEnabled() : false;
   ```

   `&&` binds tighter than `?:`, so a `devOnly` tool with **no** `devOnlyEnabled` predicate yields
   `false` — **not gated, callable**. Their copy reads
   `def.devOnly && !(opts.devOnlyEnabled?.() ?? false)`, which gates it — **not callable**.

   So published mcp-kit **fails open** and their vendored copy **fails closed**. A browser-tab
   migration that does not also pass `devOnlyEnabled` makes their dev-only tools callable over MCP,
   silently, with no type error and no test failure to catch it.

   **The published default is arguably the wrong one**, and the comment directly above it argues
   against itself: *"A dev-only tool that is not enabled must be INDISTINGUISHABLE from one that does
   not exist."* A gate that defaults to open does nothing unless the caller remembers it — which is
   the failure mode the comment exists to prevent.

   **NOT changed here, deliberately.** Flipping the default is a behaviour change on a 0.x package,
   and per #34 a breaking marker on a 0.x cuts 1.0.0. It also needs checking against the generated
   app, which registers dev-only tools and passes no predicate today — so the flip would change the
   golden output's behaviour too. **Trigger**: decide it with George alongside the `sanitizeContent`
   lift, since both land in the same mcp-kit release.

**Neither consumer was told to migrate before this was measured.** The standing rule is that a
request is usually right about the symptom and often wrong about the mechanism; here the *sender*
would have been wrong about the mechanism, in a way that would have silently opened a tool gate.

---

## The dev gate, after both consumers replied — 2026-08-22

**The exposure is confirmed empirically, not just by reading.** up-bank measured it on their vendored
copy before adopting:

```
MCP_DEV unset -> callMcpTool("get_logs") -> isError: false, real log payload returned
```

Hidden from `tools/list`, executing anyway — **in a repo that fronts a real bank account**. Not
remotely exploitable (a caller already needs the MCP host or the bearer-token HTTP service), but a
dev-only log inspector that runs in production is a defence-in-depth hole, and the vendored copy gave
them no way to close it.

**Our own `apps/example-repo-mcp` is the same shape and still unfixed** — `index.ts:55` filters the
listing, `dispatcher.ts:26-31` passes no `devOnlyEnabled`. So the golden output that ships into every
scaffolded repo has the hole. **browser-tab is the working counter-example**: `index.ts:48` filters
AND `dispatcher.ts:36` passes `devOnlyEnabled: devModeEnabled`, with `scripts/stress-mcp.ts:596-597`
asserting over the real stdio transport, on three OSes, every PR, that `get_logs` answers "unknown
tool name" by direct name with dev off.

So: **the mcp-kit-side option was upstreamed; the app-side wiring was not.** Published
`dispatch.ts:63` carries the rationale verbatim, and the golden app never passes it.

**Both consumers independently asked for the default to be flipped, and both are unaffected by the
flip** (each already passes the predicate) — so neither is arguing self-interest.

up-bank's ordering of the argument, which is better than mine:

1. The failure is **silent and reads as safe**. `devOnly: true` is a declaration of intent; a kit that
   accepts it and ignores it produces a consumer who believes they are gated and is not.
2. The safe default is **cheap** — one predicate at wiring time, and you find out immediately because
   your dev tool stops working. The unsafe one costs nothing at wiring time and everything later.
3. **We already chose fail-closed for every analogous case** — `resolveKey` returning `null`, the
   write-once guard, the tsx `--import` fix. This is the odd one out.

**browser-tab's counter-proposal (D), carried in their name: neither default — validate at
construction.** If the registry contains a `devOnly` tool and no predicate was passed, `buildDispatcher`
**throws**, naming the offending tools. Consumers with no `devOnly` tools are untouched; consumers
with them get a loud startup failure and a one-line fix instead of silent exposure; the ambiguous
state becomes unrepresentable. Their honest statement of the cost: D is breaking for the same set A
breaks, so under #34 it **cuts mcp-kit 1.0.0**, not 0.2.0.

**up-bank's counter-argument, which is the real fork and must be answered first:** the current
default is defensible *if* `devOnly` means "hidden from the listing" and was never an authorisation
boundary. If that is the intent, the bug is the **name**, not the default — `hiddenFromList` would
have told them the truth and they would never have assumed a gate. **So the question to settle is
what `devOnly` MEANS. Flip the default, or rename the field — doing neither is what shipped the
hole.**

**One-line template fix, correct under A, B and D alike, needing no release:** wire
`devOnlyEnabled: devModeEnabled` into `apps/example-repo-mcp/src/dispatcher.ts`. The option already
exists in published 0.1.0, and `tests/integration.test.ts:39-40` asserts only the `tools/list` filter,
so nothing depends on the current behaviour. Acceptance test to copy: browser-tab's
`stress-mcp.ts:596-597` — assert the tool answers "Unknown tool name" **by direct name with dev off**,
not merely that it is absent from `tools/list`.

---

## 45. `setLogFilePrefix` runs after the log file is already open, so two apps share `$TMPDIR/mcp/`

Found 2026-08-22/23 while inventorying log directories for the Vector telemetry design, not by looking
for it. **Two independent instances, in two repos, from one kit-level trap.**

### The mechanism

`packages/robustness/src/logger.ts:360-367` fixes `logFilePath` at the **first write**, using whatever
`logFilePrefix()` returns at that instant:

```js
logFilePath = join(dir, `${logFilePrefix()}-${process.pid}-${date}.ndjson`);
```

and the directory is derived from the same value (`logger.ts:257`):

```js
return envStr(key("LOG_DIR"), join(tmpdir(), logFilePrefix()));
```

`apps/example-repo-mcp/src/index.ts:37-38` calls `setLogFilePrefix(slug)` as the first statement
*inside* `runMcpServer()`. **Anything that logs before that line opens the file under the default
`mcp` prefix, and it stays there for the process's lifetime** — the comment on that line reads
*"Brand the log directory so different tools' logs don't collide"*, and the branding is defeated.

Which entry path logs first is **unknown — not reconstructed.** The `mcp-*` file's own records show
`watchdog_installed` landing before `startup`, which is the symptom, not the cause.

### CORRECTION 2026-08-23 — there are TWO root causes, and one of them is not this one

The first draft of this entry said both emitters "call `setLogFilePrefix` correctly and both also have
their own correctly-named directories", so excluding `$TMPDIR/mcp/` would lose only a partial
duplicate. **Both halves are wrong**, corrected by browser-tab and then reproduced here.

Two distinct defects reach the same bucket:

1. **Late call — the ordering trap described below.** `src/index.ts` sets the prefix, but not before
   something else logs. Real, and the diagnosis stands.
2. **No call at all.** `apps/example-repo-mcp/src/cli.ts` never calls `setLogFilePrefix` on **any**
   path — `grep -c` returns 0 — and neither does browser-tab's `src/cli.ts`. Every CLI subcommand
   that routes the dispatcher logs a perf span, so `$TMPDIR/mcp/` is the CLI's **only** destination,
   not a duplicate of a branded one.

Measured here against the built bin with an isolated `TMPDIR`:

```
$ TMPDIR=/tmp/prefix-drill-w1hhxj node dist/cli.js health
$ find /tmp/prefix-drill-w1hhxj -name '*.ndjson'
  mcp/mcp-97487-2026-08-22T14-05-05.ndjson
  {"ts":"…","level":"perf","msg":"dispatch.health_check","dur_ms":6.14,"data":{"engine":"rust"}}
```

Entry-point audit, `apps/example-repo-mcp/src/`: `index.ts` ✓, `tui/index.tsx` ✓, **`cli.ts` ✗**,
`commands/http.ts` ✗ (harmless — reached via `runMcpServer`, which brands first).

**So excluding `mcp` from telemetry collection is not free: it drops the CLI stream entirely.** The
exclusion is still right — one perf span per invocation, versus a directory nothing can attribute —
but the reason is "loses the CLI stream until the call site is added", never "loses a duplicate". A
future reader who believes the latter will conclude the exclusion costs nothing and leave it.

### The measurement

`$TMPDIR/mcp/` is a **shared sink for at least two applications**, reaching it by the two different
routes above:

```
mcp-9256-2026-08-22T13-57-52.ndjson   {ws_listening, ipc_listening, ws_extension_connected}   browser-tab-mcp
mcp-9811-2026-08-22T13-57-52.ndjson   {ws_disabled, ipc_listening} EADDRINUSE 127.0.0.1:8790  browser-tab-mcp
mcp-11545-2026-08-22T13-57-53.ndjson  {dispatch.list_tabs, dispatch.screenshot, …}            browser-tab-mcp
mcp-12382-2026-08-22T13-57-53.ndjson  {daemon_unreachable_falling_back}                       browser-tab-mcp
mcp-10677-2026-08-22T06-38-00.ndjson  entrypoint: @george43g/example-repo-mcp                 ours
```

browser-tab's four are attributed **by content** — their tool and lifecycle names. **Six of the seven
files carry no `startup` record at all**, so there is no `entrypoint` field to attribute them by.

browser-tab's TUI path gets the ordering right (`src/tui/index.tsx:26-27` sets the prefix before
`installWatchdog` at `:30`), so this is a per-entry-path split, not a misconfiguration.

### Why it matters beyond tidiness

A telemetry shipper deriving `service` from the log path is **categorically unable** to label that
directory: several apps interleaved, and no per-event field identifying the emitter. It cost the
Vector rollout a directory — `$TMPDIR/mcp/` is excluded from collection precisely because nothing
downstream can attribute it (dotfiles `docs/vector-rollout.md` S27, 2026-08-23).

**A measurement hazard worth generalising:** `pruneLogs` churns these directories, so any file count
or attribution for one is a **point-in-time sample, not a standing fact**. My own inventory of
`$TMPDIR/mcp/` went stale within hours — seven files attributed to `example-repo-mcp` on the first
read, six of them browser-tab's on the second.

### The fix, and why the one-liner is the lesser half

Wiring order in `index.ts` is a one-line change. But **an allow-list of entry points is a snapshot of
a runtime decision** — `cli.ts` reached the shared bucket with nothing in either repo to say so.
browser-tab's proposal, which this entry adopts: **a test asserting that every process entry point
sets the prefix before anything can log.**

It belongs in the **template**, not per-repo, so it covers emitters that do not exist yet — that is
the only version that outlives the current list of tools. Two independent instances of one trap is an
argument for the kit making it impossible rather than two call-site patches: e.g. `logStartup()`
warning when it finds the file already opened under the default prefix.

**The runtime-warning idea is dead — browser-tab killed it and the argument is decisive.** A warning
emitted by `logStartup()` when it finds the file already open under the default prefix would be
*written into the mis-located file itself* — `$TMPDIR/mcp/`, the one directory nothing collects — and
for the six files above it would never fire at all, because those processes emit no `startup` record.
**A diagnostic that fails in exactly the configuration it diagnoses is not a diagnostic.**

**The static test-time assertion is dead too — browser-tab withdrew their own proposal.** "Assert every
process entry point calls `setLogFilePrefix`" inherits the exact defect of the prefix allow-list it
replaces: enumerating entry points is a judgement call, and it would have caught `cli.ts` only if
someone had listed `cli.ts` — which is precisely what nobody did. `commands/http.ts` is the same shape
inverted: **0** calls and nonetheless correct, because `runMcpServer` brands before delegating. A
static list has to reason correctly about that false positive to stay useful.

**SETTLED DESIGN, three sessions, 2026-08-23.** Four parts, two of them rejections with reasons:

1. **BUILD — a behavioural test.** Spawn every subcommand the bin dispatches under an isolated
   `TMPDIR`; assert no default-prefix directory appears. The subcommand set comes from the bin's own
   command table, never a hand-written list, so a new subcommand is covered the day it is registered.
   It asserts the **observable outcome**, so it catches the late-call and never-called defects without
   needing to tell them apart. **Belongs in the template, not per-repo.** Accepted gap: library entry
   points imported in-process (vitest workers) are uncovered — **how to cover them is unknown**, and
   was deliberately not invented. The `prefix-drill` reproduction above is this test, run by hand.

2. **REJECTED — runtime warning written through the logger, from an entry-point hook.** Mine,
   rejected by me on browser-tab's argument (above).

3. **REJECTED — a hook at the logger's first file open (`ensureLogFile`, `logger.ts:359`).**
   browser-tab's steelman, rejected on kit evidence: `logFilePrefix()` is
   `logFilePrefixOverride ?? envStr(key("LOG_PREFIX"), "mcp")` (`logger.ts:122`), so **a default nobody
   overrode is indistinguishable from a default nobody meant to override.** It false-positives on
   100% of tools that never brand deliberately, and the signal needed to suppress that does not exist
   in the process. Reopen only if the kit gains a way to *declare* an intent to brand.

4. **OPEN, unbuilt — a late-brand detector at `setLogFilePrefix` (`logger.ts:118`).** Warn via
   `writeStderrLine` (`logger.ts:239`, documented never to throw) when `logFilePath` (`logger.ts:250`)
   is non-null at call time. Both halves are affirmative facts rather than absences, so it is
   **zero-false-positive**, and it survives both failure modes that killed (2) — stderr escapes the
   quarantine, and the trigger *is* the call, so there is no separate site to forget. browser-tab
   attacked it with the one plausible case (a suite that logs, then re-brands, emitting noise every
   run until someone switches the detector off) and it holds: `_resetForTests()` (`logger.ts:639`)
   sets `logFilePath = null`, so an ordinary reset clears the condition the detector reads, and
   module-scope branding never trips it either.

   **Covers the late-call defect only.** Never-called is undetectable in-kit for the same reason (3)
   fails. **A complement to (1), never a substitute** — if only one is built, build (1).

**Anchor note:** line numbers here are this repo's `packages/robustness/src/logger.ts`. browser-tab
cites the published artifact, `@george43g/robustness@0.11.0` `dist/logger.js`, where the same symbols
sit at `setLogFilePrefix` 77-79, `writeStderrLine` 156, `logFilePath` 166, `ensureLogFile` 264,
`_resetForTests` 520-522. Both correct, different trees — a reader with one checkout would otherwise
conclude one of us mis-cited.

**Not proposed as work.** Trigger: George's call, alongside #44's two items — all three are defects in
the same generated app found by doing unrelated work.

**Confirmed, not inferred:** the 13:57:52 burst was browser-tab's own test suite (67 files, 648 tests,
start 23:57:48 AEST = 13:57:48Z, six vitest workers inside 1.6s). The `EADDRINUSE` is their real
launchd daemon holding the extension port; the five `dispatch_error`s are deliberate assertions that
extension-only tools fail cleanly under a fake adapter. My "reads like a suite" was a guess; theirs is
a clock.

### Also owed, from the 0.12.0 round (eqstack, 2026-08-22)

`packages/robustness/README.md` should record that the **per-boundary opt-in is the recommended shape
for email redaction and the global switch is the exception**, because only the consumer knows which of
its surfaces carry addresses. There is already a home for it — `## Logging` at `:169`, the
`MCP_LOG_REDACT_EMAILS` note at `:181`, and `### Email redaction is opt-in…` at `:207`. A `docs:`
change to a published package; unstarted.

---

## 46. mcp-kit and the app resolve DIFFERENT robustness instances, so logger state is split

Found 2026-08-24 while red-drilling the log-branding fix (decision item 2). The fix
looked broken — `TMPDIR=$D node dist/cli.js health` still produced `$TMPDIR/mcp/`
after branding was moved to module scope. It is not broken. **The app cannot brand
the instance that writes that file.**

### Measured

```
app     (apps/example-repo-mcp) -> packages/robustness/dist/index.js
mcp-kit (packages/mcp-kit)      -> node_modules/.pnpm/@george43g+robustness@0.12.0/
                                     node_modules/@george43g/robustness/dist/index.js
```

Two physically distinct modules. `logFilePrefixOverride` and `logFilePath` are
**module-scope** state (`logger.ts:122`, `:250`), therefore **per-instance**.
`setLogFilePrefix` in the app writes the workspace instance; `perf()` inside
`dispatch.ts:126` reads the registry instance, which nobody branded, so it falls
back to `envStr(key("LOG_PREFIX"), "mcp")` — the shared default bucket.

`node dist/cli.js health` emits exactly one record, and it is that span. Hence one
file, in `mcp/`, and **no amount of early branding in the app changes it.**

### Why this matters beyond the log directory

**DEFERRED #45 and Vector O4 attribute `$TMPDIR/mcp/` entirely to call ORDERING —
late-call and never-called. That diagnosis is incomplete.** For dispatch perf
spans, ordering is irrelevant: the app never touches the instance involved. Both
mechanisms are real; the ordering one is not the whole story, and a reader who
fixes only the ordering will see the bucket persist and conclude the fix failed —
which is exactly what happened here.

**This also means decision item 4's behavioural test would go RED in this repo for
a monorepo-only reason.** The test asserts "no default-prefix directory appears";
that assertion is correct for a generated repo and currently unsatisfiable here.
Deciding what the test does about that is part of building it — do not weaken the
assertion to make the monorepo pass.

### The likely durable fix, NOT taken here

`packages/mcp-kit` declares robustness as a regular **`dependency`**; `tui-kit`
declares the same relationship as a **`peerDependency`**:

| package | shape |
|---|---|
| `packages/mcp-kit/package.json` | `dependencies: { "@george43g/robustness": ">=0.11.0 <1" }` |
| `packages/tui-kit/package.json` | `peerDependencies: { "@george43g/robustness": ">=0.1.1 <1" }` + `devDependencies: workspace:*` |
| `packages/cli-kit/package.json` | no robustness dependency of any kind |

**mcp-kit is the ONLY one of the three kits with the plain-dependency shape**
(measured 2026-08-24, prompted by life-stack-e8 offering `apps/mcpsync` as a third
data point). That removes the "maybe a plain dependency is this repo's house
style" reading — it is not a style, it is an outlier. **mcpsync itself turned out
NOT to be a data point**: it declares `cli-kit`, `robustness` and `tui-kit` and
**does not depend on mcp-kit at all**, so the peer change cannot reach it, and
tui-kit already gives it the single-instance arrangement #46 argues for. Recorded
because the offer was reasonable and the refutation is cheap to lose.

A peer dependency is supplied by the consumer, so there is exactly one instance by
construction. tui-kit got this right; mcp-kit did not. **A kit holding module-scope
process state must be a peer dependency of anything that shares that state.**

### UPGRADED FROM THEORY TO RANGE ARITHMETIC — 2026-08-28, by up-bank-mcp

The trigger is no longer hypothetical, and **mcp-kit 1.0.0 is what arms it.**
Verified against the published manifests, not reasoning:

```
$ npm view @george43g/mcp-kit@0.1.0 dependencies.@george43g/robustness
>=0.11.0 <1
$ npm view @george43g/mcp-kit@1.0.0 dependencies.@george43g/robustness
>=0.12.0 <1
```

| app declares | mcp-kit | result |
|---|---|---|
| `^0.12.0` / `^0.13.0` | 1.0.0 | one instance — dedupes |
| **`^0.11.0`** | **1.0.0** | **TWO instances** |

**up-bank's articulation, which is the durable part: a plain dependency with a
WIDE range behaves like a peer — right up until the ranges stop overlapping.**
That is why this never bit before: mcp-kit 0.1.0's `>=0.11.0 <1` was satisfied by
any 0.x caret an app picked, so pnpm deduped onto the app's choice. Raising the
floor to 0.12 is what breaks the overlap, and it was **my** change (#102),
shipped in the same release as the major.

**Two individually safe changes, jointly hazardous.** That is the generalisable
shape, and it is why neither review caught it.

**Mitigation shipped, not just recorded:** mcp-kit's README now says bump
robustness FIRST, with the verifying one-liner
(`grep -oE "@george43g/robustness@[0-9.]+" pnpm-lock.yaml | sort -u`). browser-tab
was warned directly — they were measured at 0.11.0 and I had already told them
the bump was safe, which it was not in that order.

**STILL NOT OBSERVED IN A RESOLVED TREE.** up-bank derived this from range
arithmetic over published manifests plus their current lockfile and stated
plainly they had not run the install; nor have I. **up-bank measured ONE instance
today** (`@george43g/robustness@0.12.0`, single entry) — because they are on
`^0.12.0`, which overlaps. They will report one-versus-two after an authorised
bump. Until then this is arithmetic, not a reproduction.

**This strengthens the peerDependency case concretely**, where previously it
rested on a general principle: the hazard now has a named trigger, an affected
version range, and a consumer sitting in it.

**Is a generated repo affected? UNKNOWN — not measured, and do not assume it is
not.** The reasoning that says "probably fine" is: a generated app pins
`robustness ^X` and mcp-kit asks for `>=X <1`, both resolve to the same version,
pnpm dedupes to one copy. The reasoning that says it can break: **a caret on a 0.x
pins the MINOR**, so once robustness 0.13.0 ships, the app's `^0.12.0` stays on
0.12.x while mcp-kit's `>=0.12.0 <1` is free to take 0.13.0 — **two instances, in a
real user's repo, silently splitting logger state.** That is a shipped hazard, not
a monorepo artifact, and it is created by the same two-sided range rule recorded in
#41. Measuring it needs a real install of a generated repo, not reasoning.

**Trigger:** George's call, and it rides **mcp-kit 1.0.0** (decision item 3) if
taken — moving a dependency to peerDependencies is exactly the kind of change a
major absorbs, and there will not be a cheaper opportunity. Do it in that release
or explicitly decide not to.

---

## 47. This repo's `.codex/config.toml` silently loses all three `MCP_DEV*` vars

Found 2026-08-24, reported into this repo by the dotfiles session while chasing
the same defect in two other trees. **Not fixable here — the file is generated.**

### The defect

`.codex/config.toml` is produced by `mcpsync sync` and carries, verbatim:

```
4:# NOTE: non-passthrough env skipped for example-repo-mcp-dev: MCP_DEV (literal)
5:# NOTE: non-passthrough env skipped for example-repo-mcp-dev: MCP_DEV_ENTRY (literal)
6:# NOTE: non-passthrough env skipped for example-repo-mcp-dev: MCP_DEV_WATCH_DIR (literal)
```

`.mcp.json` declares exactly `MCP_DEV, MCP_DEV_ENTRY, MCP_DEV_WATCH_DIR` for that
server, so **all three are dropped** and the emitted TOML is syntactically valid
and looks complete. The failure mode is silence.

### Two premises that turned out to be false

1. **"Codex has no per-project MCP mechanism."** It does. Measured by up-bank and
   reproduced by dotfiles on the *same* `codex-cli 0.145.0` — `codex mcp list`
   returns four extra servers inside a repo with a `.codex/config.toml`, exactly
   the four that file declares. So these files are **live**, not inert.

2. **"Codex's schema cannot carry literal env for an stdio server."** It can.
   Verified here by execution, same version:

   ```
   $ codex mcp add --help
         --env <KEY=VALUE>
             Environment variables to set when launching the server. Only valid with stdio servers
   ```

   plus `~/.codex/config.toml:195` `[mcp_servers.blender.env]` (user scope) and
   `~/repos/Gmail-MCP-Server.bak/.codex/config.toml:5`
   `[mcp_servers.gmail-mcp-dev.env]` (project scope). **The same server carries
   env at user scope and loses it at project scope** — which refutes the schema
   argument using the adapter's own output format.

### Fleet scope — CORRECTED 2026-08-24 to **11 across 6**, not 13 across 7

My first count (13/7) counted **rewrites, not breakages**. Corrected by
up-bank-mcp's point, re-derived by dotfiles, confirmed by life-stack-e8.

**The mechanism I did not have: Codex MERGES user scope into project scope.** A
server that also exists in `~/.codex/config.toml` has its env filled in from
there, so it is **masked from this defect entirely**. `life-stack` drops out of
the list for exactly that reason — `blender` exists at `~/.codex/config.toml:195`
and resolves `DISABLE_TELEMETRY` fine, measured by life-stack-e8.

**So the real victims are servers that exist ONLY at project scope** — which is
precisely why the damage clusters on `*-dev` servers, including this repo's
`example-repo-mcp-dev`. That explains the shape of the data rather than just
counting it.

`billing-mwc`'s `imessage` losing `PATH` is the only non-`*-dev` casualty, and a
runtime dependency rather than a dev flag.

**Withdrawn: the `blender` phones-home claim.** dotfiles reported it, then
withdrew it at source once life-stack-e8 measured the merged view. It is recorded
here only so nobody re-derives it from the original report.

### Why it matters here specifically

`MCP_DEV` unset is what `devModeEnabled()` reads. Under Codex this repo's dev MCP
server would run **misconfigured** — `mcp-dev-proxy.ts:49` falls back to
`src/index.ts` against `process.cwd()`, which does not exist at a monorepo root.
It is the mirror image of the defect fixed in the same session (dev tools hidden
but callable, PR #103): there the gate was too open, here the dev server does not
start correctly at all. **"Works under Claude Code, broken under Codex."**

### CONFIRMED conservative — the adapter has no reason, and the defect predates the WIP

I inferred "conservative" without reading the file. life-stack-e8 read it (their
repo) and confirmed it, `apps/mcpsync/src/core/hosts/codex-adapter.ts:46-53`:

```ts
      const vs = varsIn(v);
      if (vs.length === 1 && vs[0] === k) passthrough.push(k);
      else
        notes.push(
          `non-passthrough env skipped for ${s.name}: ${k} (${vs.join("+") || "literal"})`,
        );
    }
    if (passthrough.length) table.env_vars = passthrough;
```

A value passes only when it is exactly `${K}` and `K` matches its own key;
everything else — a literal included — falls to `else`. The renderer emits only
`env_vars = [...]` (`:96`, `:118`); **no code path anywhere in the file emits an
`[mcp_servers.<name>.env]` table.** They looked for and did not find: a comment
claiming Codex cannot express literal env, a version guard, or a test asserting
the comment form. **The skip is the absence of an emitter, not a defended
decision.**

**It also predates the in-flight work** — `git show HEAD:…` carries the same line
at `:48`, and the uncommitted changes add `renderProjectTables` without touching
the env decision. So the project-scope work did not cause this; it **exposed** it,
by making these files live where they were previously written and ignored.

### ⚠️ Triage hazard — do not run bare `codex mcp list`

It masks the `Env` column but prints **`Args` verbatim**. Two sessions leaked a
live API key into their transcripts with it. Use the allowlist form, verified
leak-free independently by two sessions:

```sh
codex mcp list 2>&1 | awk '{n=$1; e=""; for(i=2;i<=NF;i++) if ($i ~ /^[A-Za-z_][A-Za-z0-9_]*=\*+,?$/) e=e" "$i; print n "\t" (e==""?"Env: -":e)}'
```

And `Env: -` is **ambiguous three ways**: stripped, never had env, or the
credential lives in `args`.

### Not ours to fix, and the counter-argument that must travel with it

`mcpsync` lives in `life-stack/apps/mcpsync` (DEFERRED #10) and the adapter was
someone's uncommitted WIP at the time of writing, so this repo neither fixed nor
read it. Hand-editing `.codex/config.toml` is pointless — the next `mcpsync sync`
overwrites it.

**Do not let "the schema supports it" become "pass everything through."** The
`env_vars = [...]` passthrough form exists because some values are secrets that
must stay *references* — `billing-mwc:14` `RESEND_API_KEY`,
`blank-canvas:19` `CLOUDFLARE_API_TOKEN`. Turning those into literals would write
credentials into a tracked project file, which is the thing this fleet's rules
exist to prevent. The correct fix passes **literal** env through as literal and
keeps **reference** env on the passthrough form — a distinction the adapter
already draws and then discards.

**Trigger:** life-stack ships the adapter fix; then re-run `mcpsync sync --scope
project --yes` here and confirm the three vars appear.
