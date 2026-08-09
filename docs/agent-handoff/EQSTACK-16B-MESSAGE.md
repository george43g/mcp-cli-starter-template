# Paste-able handoff message — EQStack

Copy everything below the line into the agent working on `EQStack`. It assumes
that agent can read this repo's files if pointed at them; if it cannot, attach
[`EQSTACK-16B-BRIEF.md`](EQSTACK-16B-BRIEF.md).

---

I maintain `mcp-cli-starter-template`, which publishes the `@george43g/*` kits
(`robustness`, `tui-kit`, `cli-kit`, `secret-store`). EQStack's `apps/imsg-mcp`
was the motivating consumer for a chunk of work we just finished, and I want to
hand you the adoption half. Full write-up, with file:line references and
suggested ordering:

**`docs/agent-handoff/EQSTACK-16B-BRIEF.md`** in the mcp-cli-starter-template repo.

**Everything that was blocking you upstream is now published.** In
`@george43g/robustness@0.5.2`: the logger's file writes are opt-out
(`MCP_LOG_TO_FILE` / `setFileLogging`) so you no longer need your `IMSG_DEV`
gate; there is a synchronous `writeStderrLine` plus `setStderrMirror` for the
MCP host connection log; shutdown now emits diagnostics by default, so
migrating without wiring `onDiagnostic` no longer deletes your crash trail; and
`redactString`/`redactValue` ship in the package with the logger redacting every
sink by default. In `@george43g/tui-kit@0.3.1`, `useDevStats` takes the
`visible` parameter whose absence caused your two `rss_exceeded` kills.

**One bug of ours that your code found, before you hit it.** Our watchdog armed
a 5s force-exit as the last-resort net for a wedged shutdown — but our
`dispose()` cleared that timer, and `dispose` is itself the registered shutdown
cleanup. So a kill ran shutdown, shutdown reached `dispose`, and the guard was
disarmed during the exact hang it existed to escape. Yours deliberately never
cancels its timer, which is what made the difference visible. Fixed in
**0.5.2** — take that version, not 0.5.1, where the trap is live.

**Two behaviour changes to plan for.** `installShutdownHandlers` now exits on
`unhandledRejection` by default (installing the observer listener was
suppressing Node's fatal-by-default semantics process-wide) — your TUI wants
`exitOnUnhandledRejection: false` alongside `exitOnUncaughtException: false`.
And the kit's watchdog logs through our logger, not your ring buffer, so wire
`onDiagnostic` back to your `error`/`warn`/`info` in the same commit or
`watchdog_kill` and the RSS forensics vanish from your logs.

**What I'd actually do, in order**: re-resolve your lockfile, then the watchdog
(a verified 1:1 on all twelve env names and defaults — your 368-line
`watchdog.ts` becomes `createWatchdog({ envPrefix: "IMSG" })`), then shutdown,
then `color.ts` and `useMouse`, then the logger when you have time to watch it.

**What I'd skip.** The theme model is a genuine blocker and bigger than we
previously recorded — 21 files and 391 `theme.<key>` read sites, three keys that
collide with *different types*, plus incompatible `ThemeProvider` and `GlyphSet`
shapes. `useVimKeys` would double-dispatch against your mode-aware handler; your
own comment in `App.tsx` documents that exact hazard (the `q`-in-a-recipient-name
bug). Neither is worth it today. If a shared theme model is worth building, I'd
rather change tui-kit to fit a real second consumer than have you contort 391
call sites — tell me what shape you'd want.

**Corrections to things I previously had wrong**, since acting on them would
waste your time: your declared `ink`/`react` carets already satisfy our peer
ranges, so it's a lockfile re-resolution and not a manifest edit; `imsg-mcp` has
no redaction at all (the `redact.ts` we lifted is voice-mcp's, and ours is now a
strict superset with a cycle guard); `DevStatsPanel` doesn't exist in your tree
(yours is `DevStats`, presentational); and log-level filtering is voice-mcp's,
not imsg's.

**Things of yours I'd like upstream** if you're willing — no obligation:
`visual-width.ts` (grapheme-aware widths; we have nothing like it),
`detectNerdFont()` (our `powerline` glyph preset can silently render blanks
without it), `--yaml` output, voice-mcp's Prometheus metrics module, and its
log-level filtering.

Corrections welcome. Five of my own claims were wrong before this brief, and
every one was caught by reading the actual source rather than the notes.
