# Deferred Work

Items intentionally not done in the current shipping series. Each has a "trigger" — the signal that says "now is the time to action this."

---

## Resolved this round (no action needed)

- **Npm scope rename** — user decided to keep `@george43g`. Personal username is the publishing identity. Closed; not a deferred item anymore.
- **`{{name}}` placeholder syntax** — migrated to `example-repo` / `EXAMPLE_REPO`. Filesystem-safe, no tera/handlebars collisions, no usage(1) identifier corruption. Done.
- **Root `mise.toml` tera collision** — auto-resolved by the placeholder migration (mise no longer sees `{{name}}` to fail-parse). `mise tasks` from repo root works cleanly. Done.

---

## 1. Scaffolder's own usage(1) freshness gate in CI

**Status**: missing — only the SCAFFOLDED output has a gate.

**Why deferred**: the scaffolded output's freshness gate (`apps/example-repo-mcp/scripts/check-usage-freshness.mjs` + the CI step that runs it) is the user-facing value. The scaffolder repo itself uses `usage` via `mise run completions` from `apps/scaffolder/mise.toml` but ships its checked-in artifacts at `completions/scaffolder/` + `docs/scaffolder-cli/` + `man/mcp-scaffold.1` without a CI gate.

**Trigger to action**: if drift between `apps/scaffolder/.usage.kdl` and the checked-in scaffolder completions lands on `main` (would mean someone edited the spec without regen — visible in PR review for now).

**Cost**: ~30 minutes. Copy the cloned-tool's `check-usage-freshness.mjs` pattern into `apps/scaffolder/scripts/`, point it at `apps/scaffolder/.usage.kdl`, wire into `.github/workflows/ci.yml` before the lint step.

---

## 2. `mise trust` friction on first-run

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

## 3. MCPB bundle size optimization

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

**Status**: declined per spec locked decision #5.

**Why**: the secrets chain (`env-json → 1Password → file`) covers macOS, Linux, CI, and Docker uniformly. Keychain would only help macOS dev loops, and the 1Password CLI handles that already with better cross-machine sync.

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

## Status snapshot at last update

- Scaffolder tests: **76 passing**
- Cloned-tool integration tests: **14 passing**
- mcp-kit unit tests: **27 passing**
- Stress cases: **11 / 11** (all required for HTTP-enabled builds)
- Lint: **0 errors, 4 warnings** (all pre-existing suppressions-unused on intentional biome-ignore comments)
- CI gates: lint, typecheck, test, test:no-native, usage(1) freshness, npm pack dry-run, scaffolder E2E smoke, example/ diff vs scaffolder output, stress
- Workspaces: 14 (excludes `example/**`)
- Template entries: 154 (`apps/scaffolder/src/generated/templates.ts`)

Last reviewed: 2026-05-26.
