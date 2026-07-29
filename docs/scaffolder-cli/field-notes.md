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
