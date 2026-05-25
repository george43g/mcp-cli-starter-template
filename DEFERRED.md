# Deferred Work

Items intentionally not done in the current shipping series. Each has a "trigger" — the signal that says "now is the time to action this."

---

## 1. Npm scope rename — `@george43g` → business scope

**Status**: deferred.
**Why**: user wants to publish under their business scope (`@mwc` / `@melbournewebco` / something else TBD). Decision blocked on (a) picking the final name + (b) confirming npm availability — `@mwc` may be squatted.

**Trigger to action**: when the user has picked + verified an npm scope is available.

**Cost**: one regex swap + ~146 file edits, fully automated.

**How to do it**:
1. Pick the scope (e.g. `@melbournewebco`). Verify on npm: `npm view @melbournewebco/foo` should 404.
2. Edit `apps/scaffolder/src/core/templating.ts:26` — change `const SCOPE_RE = /@george43g/g;` to `/@<new-scope>/g`.
3. Search-and-replace across the repo: `rg --files-with-matches '@george43g' | xargs sed -i '' 's/@george43g/@<new-scope>/g'` (macOS) or `sed -i 's/.../.../'` (Linux).
4. Run `pnpm verify` — the golden drift test will catch any place we missed.
5. Rebuild scaffolder templates: `pnpm --filter @<new-scope>/mcp-scaffold build:templates`.
6. Commit, push, publish.

**Considerations**:
- The scaffolder repo can stay at `@george43g/mcp-scaffold` even after the cloned tools move — the substitution engine separates the two concerns. But unifying both under one scope reads cleaner.
- Pre-publish: also run `npm publish --dry-run --filter "<scope>/*"` to confirm tarballs look right.

---

## 2. `{{name}}` placeholder syntax

**Status**: declined (kept as-is). Documented here so the decision doesn't get re-litigated.

**Why double-curly stays**:
- Unambiguous — `{{` never appears in real source content, so substitution can be a dumb regex with zero false positives.
- The substitution engine (`apps/scaffolder/src/core/package-port.ts:62-78`) already handles BOTH file content AND path renames. No alternative gains anything.
- The placeholder only exists during template authoring. After `mcp-scaffold init` runs, the user's repo has fully-substituted paths and content — they never see `{{name}}` in their working tool.

If we ever revisit: a `--placeholder` flag on `mcp-scaffold init` could let users pick a different marker without changing the canonical template. Low priority.

---

## 3. Root `mise.toml` `{{name}}` collides with mise's tera template engine

**Status**: pre-existing bug, non-blocking but noisy.

**Why**: the canonical root `mise.toml` (written by `apps/scaffolder/src/phases/02-toolchain/m1-mise.ts`) contains literal `{{name}}` placeholders in `[tasks.screenshots]` and `[tasks.completions]` so the scaffolder substitution substitutes them at scaffold time. But mise's tera template engine parses run blocks at config load and tries to interpolate `{{name}}` as a tera variable — fails with `Variable 'name' not found in context`.

**Visible symptom**: any `mise <command>` invocation reading the root `mise.toml` prints a `mise ERROR Failed to render '__tera_one_off'` line. Tasks still complete successfully (the error is per-task and non-fatal at the config-load level). `mise tasks` listing is broken.

**Trigger to action**: when noise becomes a friction point for new contributors, OR when mise version-bumps make the parse error fatal.

**Cost**: ~30 minutes.

**Fix options**:
- A. Wrap canonical's `{{name}}` in `{% raw %}{{name}}{% endraw %}` blocks. Update `apps/scaffolder/src/core/templating.ts:25-26` to ALSO strip the raw tags during substitution.
- B. Refactor the `[tasks.screenshots]` + `[tasks.completions]` tasks to discover paths via `find apps/*-mcp -name '.usage.kdl'` instead of hard-coded `{{name}}` filters. Same surface, no placeholder needed.
- C. Pin the canonical mise.toml to a different task name not used in run blocks, and rely on per-app mise.toml (which is what the cloned tool already uses post-`init`).

Recommended: B — refactor the path-discovery so the canonical mise.toml has no `{{name}}` at all. Cleanest UX, no escaping awkwardness in scaffolded output.

---

## 4. Scaffolder's own usage(1) freshness gate in CI

**Status**: missing — only the SCAFFOLDED output has a gate.

**Why deferred**: the scaffolded output's freshness gate (`apps/{{name}}-mcp/scripts/check-usage-freshness.mjs` + the CI step that runs it) is the user-facing value. The scaffolder repo itself uses `usage` via `mise run completions` from `apps/scaffolder/mise.toml` but ships its checked-in artifacts at `completions/scaffolder/` + `docs/scaffolder-cli/` + `man/mcp-scaffold.1` without a CI gate.

**Trigger to action**: if we ever see drift between `apps/scaffolder/.usage.kdl` and the checked-in scaffolder completions land on `main` (which would mean someone edited the spec without regen — visible in PR review for now).

**Cost**: ~30 minutes. Copy the cloned-tool's `check-usage-freshness.mjs` pattern into `apps/scaffolder/scripts/`, point it at `apps/scaffolder/.usage.kdl`, wire into `.github/workflows/ci.yml` before the lint step.

---

## 5. `mise trust` friction on first-run

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

## 6. MCPB bundle size optimization

**Status**: works, but produces ~52 MB artifacts.

**Why**: `scripts/build-mcpb.mjs` currently copies the entire `node_modules/` tree into the bundle. That includes dev-dependencies (typescript, vitest, vite, etc.) that the runtime doesn't need.

**Trigger to action**: when the bundle size matters (someone tries to ship via npm tarball + the 50MB+ size becomes a friction point).

**Cost**: ~1-2 hours. Options:
- A. Add a `pnpm install --omit=dev --prefix <stage>` step before zipping. Requires the user to have pnpm on the build machine. Probably the cleanest.
- B. Switch Vite to bundle dependencies inline (drop them from `external`), producing a self-contained `dist/index.js`. Trade-off: harder to debug, no shared workspace versions.
- C. Walk node_modules with a denylist of dev-only packages. Brittle.

---

## 7. Stress harness JSON-report artifact upload

**Status**: stress runs locally + in CI but doesn't upload a report artifact for non-default cases.

**Why deferred**: the existing CI step `actions/upload-artifact` already grabs `apps/**/stress-*-report.json` — but the harness doesn't currently emit JSON, only a console table. The plan in `glowing-percolating-key.md` (originating imsg-mcp research) had this as a "Phase 3 deferred" item.

**Trigger to action**: when a stress regression is hard to diagnose from CI logs alone (e.g. timing-sensitive HTTP case fails on macOS only).

**Cost**: ~1 hour. Add a `--json` flag to `stress-mcp.ts` that emits `{ case, pass, durationMs, detail }[]` to `stress-mcp-report.json`. Update CI to always pass `--json`.

---

## 8. Semantic / vector search demo for the Resources kit

**Status**: not started.

**Why deferred**: the MCP Resources demo (`apps/{{name}}-mcp/src/resources/registry.ts`) currently exposes `health://` + `logs://recent/{n}`. Adding a `search://embeddings/{query}` example would show a richer pattern (vector index + pluggable embedding model), but it's bespoke and probably belongs in a separate "advanced patterns" doc.

**Trigger to action**: when someone asks "how do I expose search results as MCP Resources?" or when we have a real-world MCP using the kit for semantic search.

**Cost**: ~1 day. Pick a tiny embedding lib (e.g. `@xenova/transformers` for browser-portable models), wire a demo with a sample corpus.

---

## 9. Two-branch `main` + `experimental` SOP

**Status**: declined per spec locked decision #10.

**Why**: the user explicitly chose single-`main` to keep the operational surface small. Don't reintroduce without an explicit reason.

---

## 10. Apple Keychain integration for `packages/secrets/`

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
- Lint: **0 errors, 5 warnings** (4 pre-existing suppressions-unused, 1 from this sweep — addressed)
- CI: green on `main` (push to confirm)

Last reviewed: 2026-05-25.
