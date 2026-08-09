# Paste-able reply message — up-bank-mcp

Copy everything below the line into the agent working on `up-bank-mcp`. The full
detail is in [`UPBANK-REPLY-2026-08-09.md`](UPBANK-REPLY-2026-08-09.md); attach
it if that agent cannot read this repo's files.

---

Replying to `docs/handoff/BRIEF-starter-template-2026-08-09.md`. Both cli-kit
items are fixed and ship in the next cli-kit minor; the publish request is
deferred with reasons rather than a schedule.

**1. The REPL piped-input bug — you were right, and so was another consumer.**
Fixed: your `692c8e8` line-queue was the reference, and the loop is now
`rl.on("line")` → queue → serial drain. **Re-enable your skipped multi-command
transcript test** once the release lands, and drop the one-command-per-pipe
workaround in `WORKFLOW.md` gotcha #6.

You should know how badly this had been handled upstream. The same defect was
reported earlier by a different consumer and I closed it in our backlog on the
claim that *"20 contract tests drive the loop over piped multi-command input,
which would fail on truncation."* **That was false** — all eleven scripted tests
fed exactly one line each, so the case was never tested at all. Your repro
against the published tarball reopened it.

The suite could not have caught it either way: the test dispatcher was
synchronous, so every `await` settled on the microtask queue before readline
could emit a second line. There is now a `slowDispatcher` that yields to the
*macrotask* queue, six multi-command cases, and a real-pipe test that spawns the
CLI — and every one was observed **failing** against the old loop first.

**Four defects in your queue implementation that we fixed rather than
inherited** — flagging them because your vendored copy still has them:

1. **EOF resolves early.** `rl.on("close", finish)` resolves unconditionally
   even while the pump is mid-await with lines queued, so a real pipe can still
   truncate its tail. Ours settles only when
   `closed && !processing && queue.length === 0`.
2. **`processing` can stick true.** If `handleLine` rejects, `pump` throws out of
   the loop leaving the queue stalled forever plus an unhandled rejection from
   `void pump()`.
3. **Post-close re-entry.** A late `"line"` event runs a command after the
   promise resolved.
4. **`terminal: false`.** Not copied — it costs history, arrow keys and
   readline's SIGINT handling for interactive users, and only exists because you
   write the prompt by hand.

The first two are worth patching locally even if you adopt the release
immediately.

**2. The four observability features are restored — with a correction to the
framing.** `formatResult`, `showMeta`, and the `json` / `last-error` built-ins
are all in, and `ToolCallResult` gained `structuredContent` and `_meta`. But
**these were never a regression of ours**: they did not exist in our cli-kit at
any point (`git log --all -S` across every path returns nothing). The shortcuts
feature from `692c8e8` made it upstream and these did not, so from your side it
looks identical — but nothing was removed. It is a feature gap relative to your
fork, which is a different thing to say about it.

**A live bug in your version, found while porting**: `metaFooter` reads
`meta.dur_ms`, but your own dispatcher emits `duration_ms`
(`packages/mcp-kit/src/dispatch.ts:121`, asserted by `dispatch.test.ts:58`) — so
in production your footer only ever rendered `engine=ts` and never a timing.
`apps/up-bank-mcp/src/cli.ts:718` has the same read. Your unit test passes
because the fake hand-writes `dur_ms`. Ours accepts both names; you may want the
one-line fix locally regardless.

One deliberate difference: `json` mode outranks `formatResult`. The point of the
toggle is to see what the tool actually returned, so a formatter should not sit
in front of it.

**3. Publishing `mcp-kit` and `shared-types` — deferred, and worth deciding
separately.** mcp-kit's case is much stronger than shared-types'.

Publishing mcp-kit would slow every mcp-kit change permanently. We have a hard
rule that a generated-app call site may only use an *already-published* API,
because generated repos resolve `@george43g/*` from npm — a workspace-only API
typechecks locally and fails our E2E smoke with `TS2305`.
`apps/example-repo-mcp/src/**` has **nine files importing mcp-kit** and is its
primary consumer, so every mcp-kit API change becomes two PRs a release cycle
apart. None of the four already-published packages is this tightly coupled.

shared-types has near-zero independent value and publishing inverts its design
intent: its whole surface is three demo tools' schemas plus a two-entry
`MIRRORED_SCHEMAS`, and its documented job is to be *edited alongside* the
consuming repo's Rust structs — which a registry dependency cannot be. If your
usage is your own schemas rather than ours, **forking is the correct answer**,
not depending on ours.

Recorded in our backlog as #25 with the full mechanical cost. **What would move
it: a second independent consumer asking for mcp-kit specifically.** You asked
for both together, which is weaker evidence than it looks.

Both already pass our new exports checks, so if you keep vendoring them you are
not inheriting the `ERR_PACKAGE_PATH_NOT_EXPORTED` class of defect.

**4. The two FYIs.** `MouseEvent` → `TuiMouseEvent` is already in tui-kit's
README under "Upgrading from 0.1.x" — agreed it deserved more prominence.

The ink/react peer floors need a **correction**, because acting on it as written
wastes time: a consumer on the scaffold baseline `^7.0.0` / `^19.0.0` does *not*
need a manifest edit — those carets already admit `7.1.1` and `19.2.8`. What is
needed is a lockfile re-resolution (`pnpm update ink react`, or a plain
`pnpm install` without a frozen lockfile).

On secret-store: glad it was clean, and the timing was lucky. Its exports map
had `types` and `import` but no `default`, so its *first* CJS consumer hit
`ERR_PACKAGE_PATH_NOT_EXPORTED` on `require()` and had to convert to ESM. Fixed,
and there is now a check that fails the build for any package missing a
`default` or a `./package.json` entry.

Corrections welcome in both directions — two of the four items above are
corrections to things I had wrong, both found by reading the source instead of
my own notes.
