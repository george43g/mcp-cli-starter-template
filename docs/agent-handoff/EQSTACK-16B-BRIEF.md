# Downstream brief — EQStack adoption of the `@george43g/*` kits (DEFERRED 16b)

**For**: the agent working on `EQStack` (`apps/imsg-mcp`, `apps/voice-mcp`).
**From**: the `mcp-cli-starter-template` maintainer session, 2026-08-09.
**Status of the upstream half (16a)**: done and published. Nothing here is
blocked on us any more.

This brief is written to be *executed*, not admired. Every claim below was
re-verified against EQStack's working tree on 2026-08-09 rather than carried
over from the earlier analysis — and **five of the earlier claims were wrong**.
Those corrections are called out inline, because acting on the old numbers
would waste your time.

We do not touch the EQStack repo. Everything here happens on your side, at your
pace, in whatever order you judge best. Where we got something wrong, tell us
and we will fix it upstream.

---

## 0. What you need to install

Nothing in EQStack depends on these packages yet, so this is a new dependency,
not a version bump.

| Package | Version | Why |
|---|---|---|
| `@george43g/robustness` | `^0.5.1` | watchdog, shutdown, logger, redaction, retry, timeout, rate-limit |
| `@george43g/tui-kit` | `^0.3.1` | `color.ts`, `useMouse`, viewport helpers (theme layer: see §4 — do not adopt yet) |

`@george43g/cli-kit` and `@george43g/secret-store` are available too but nothing
in this brief requires them.

**Version floors — correction to the earlier analysis.** It claimed you must
bump `ink`/`react` because EQStack has `ink@7.0.1` / `react@19.2.5` against
tui-kit's `^7.1.1` / `^19.2.8` peers. The resolved versions do violate the
peers, but your **declared** ranges (`^7.0.1`, `^19.2.5` in
`apps/imsg-mcp/package.json`) already admit them. So this is a lockfile
re-resolution (`pnpm up ink react -r`), not a manifest edit. Bumping the
declared carets is optional hygiene. `fullscreen-ink@^0.1.0` — tui-kit's only
runtime dependency — is already in your tree, no conflict.

---

## 1. The watchdog — a genuine 1:1, with one trap we already fixed for you

Your `apps/imsg-mcp/src/watchdog.ts` (368 lines) collapses into
`createWatchdog({ envPrefix: "IMSG" })`.

**All 12 environment variables and all 12 defaults match exactly**, and the
number-parsing helper is behaviourally identical (falsy → fallback,
`parseInt(raw, 10)`, require finite and `> 0`). Same for the substance: sleep-skew
guard and its `3×` multiplier, p99/max derivation, spike kill, sustained kill
including the reset-on-drop counter, RSS kill with the full heap-space
forensics payload, `isMonotonicallyGrowing` (same algorithm, same 25MB default),
the eight-key state-file snapshot, `noteActivity`, `onMemorySample`, unref'd
timers, and the idempotent install guard. **We found no capability of yours that
the kit lacks.**

One new surface: `IMSG_HEAP_GROWTH_MIN_MB` promotes your hardcoded `25` to an
env knob. Same effective default, so no behaviour change — but it is newly
settable, which is a small new blast radius worth knowing about.

### The trap — fixed upstream in robustness 0.5.2, so take that version

Your `triggerKill` arms a 5s `setTimeout` → `process.exit(137)` as the
last-resort net for a wedged cleanup, and your registered cleanup deliberately
never cancels it. Ours had the same net, but `dispose()` cleared the timer —
**and `dispose` is itself the registered shutdown cleanup**. So a kill would run
shutdown, shutdown would reach `dispose`, and `dispose` would disarm the guard
during the exact hang it exists to escape. With your own shutdown controller
(`apps/imsg-mcp/src/shutdown.ts` runs cleanups in an unbounded `for … await`
and only arms its 3s net on a *second*, concurrent call) that meant a wedged
cleanup could hang forever with nothing to kill it.

That was our bug, found by reading your code against ours. It is fixed:
`dispose()` now leaves the timer armed whenever a kill is in flight, and only
`reset()` tears it down unconditionally. Three regression tests cover it.
**Adopt `^0.5.2` or later** — on `0.5.1` this trap is live.

### Things that will change visibly

None of these are blockers; they are the diff you should expect in logs.

- Force-exit message: `watchdog_force_exit — graceful shutdown stalled` →
  `watchdog_force_exit`.
- `watchdog_installed` payload gains `env_prefix`, `memory_growth_min_mb`,
  `idle_restart`.
- `memory_leak_suspected` payload gains `minimum_growth_mb`.
- `installWatchdog({ envPrefix: "IMSG", … })` emits one extra
  `watchdog_reconfigured` info line at startup that you never emitted before.

### Two things to decide before you start

**Diagnostics default to our logger, not yours.** The kit's watchdog logs
through `@george43g/robustness`'s logger (`MCP_LOG_DIR`, `MCP_LOG_*`), not your
500-line ring buffer in `apps/imsg-mcp/src/logger.ts` (`IMSG_LOG_*`). Migrate
without wiring `onDiagnostic` back into your `error`/`warn`/`info` and
`watchdog_kill`, `rss_kill_heap_forensics` and `event_loop_lag` silently vanish
from your ring buffer and your log file. This is the single most likely silent
regression in the whole migration.

**Singleton construction order.** `apps/imsg-mcp/src/tui/messageCache.ts` and
`src/tui/hooks/useDevStats.ts` call `onMemorySample`/`readWatchdogState`, which
can lazily build the kit's singleton under the default `MCP` prefix *before*
your `installWatchdog()` runs. `installWatchdog` then reconfigures to `IMSG`, so
the end state is correct — but a module-scope
`createWatchdog({ envPrefix: "IMSG" })` wrapper that re-exports the four
functions is the safer shape and preserves today's semantics exactly.

### Your tests

- `tests/watchdog.test.ts` (69 lines) — **ports unchanged**. The six
  `isMonotonicallyGrowing` cases pass against the kit's two-arg version because
  `minimumGrowthMb` defaults to 25; the two state-surface cases pass against a
  re-export.
- `tests/watchdog-sleep-skew.test.ts` (45 lines) — **must be deleted or
  rewritten.** It `readFileSync`s `../src/watchdog.ts` and regex-asserts the
  literal `interval > 3 * EVENT_LOOP_SAMPLE_MS`. After migration that file is a
  thin re-export and the kit's source reads
  `elapsed > config.sleepSkewMultiplier * config.eventLoopSampleMs`. All four
  assertions fail. A behavioural test would survive; a source-text test cannot.
- `tests/tui-process-policy.test.ts` — **likely ports.** It counts `setInterval`
  calls (2 with `idleRestart: false`, 3 by default) and the kit creates exactly
  that many, with no top-level `setInterval` anywhere in the package. Holds as
  long as your re-export wrapper installs nothing at import time.

---

## 2. What 16a shipped because you needed it

These were recorded as blockers on our side. All are done, in `0.5.1`+.

| Was blocking | Now |
|---|---|
| Logger wrote files unconditionally; you gate on `IMSG_DEV` | `MCP_LOG_TO_FILE=0` or `setFileLogging(false)`. Default stays on. Programmatic beats env; both read at call time |
| No stderr mirroring, no sync writer | `writeStderrLine()` (sync `writeSync(2, …)`, survives an imminent crash) and `setStderrMirror(true)` (info/warn/error only, perf excluded) |
| Shutdown emitted no diagnostics by default | A default sink logs every event and writes error-level events to stderr synchronously. Installing an `uncaughtException` listener suppresses Node's own report, so without this an unwired consumer lost the crash trail entirely |
| Logger had no redaction | `redactString`/`redactValue`/`lastFour` ship in the package, and the logger redacts msg+data in **every** sink by default (`MCP_LOG_REDACT=0` / `setLogRedaction(false)` to opt out) |
| `useDevStats` lacked `visible` | `useDevStats(visible = true)`; hidden mode rides the watchdog's 60s `onMemorySample` instead of a 2s interval |

**One behaviour change to know about**: `installShutdownHandlers` now exits on
`unhandledRejection` by default (code 70), via `exitOnUnhandledRejection`.
Merely installing the observer listener suppressed Node's fatal-by-default
semantics process-wide, which was the bug. **Your TUI should pass
`exitOnUnhandledRejection: false` alongside `exitOnUncaughtException: false`** —
a long-running interactive process does not want either.

### Redaction — correction to the earlier analysis

It said "imsg logs failure payloads verbatim" and implied imsg had a local
`redact.ts`. In fact **`apps/imsg-mcp` has no redaction at all** — zero matches
for `redact` across its `src/` and `tests/`. The only redaction in EQStack is
`apps/voice-mcp/src/domain/redact.ts`, which is what we lifted.

For voice-mcp: ours has **not** diverged. `PHONE_RE`, `SECRET_RE`, `lastFour`
and `redactString` are byte-identical; `redactValue` is a strict superset —
yours recurses naively and would stack-overflow on a circular object, ours
returns `"[circular]"` via an ancestor-path `WeakSet` (so genuine diamonds still
serialize). Adopting ours loses nothing. It is a one-line import change in
`src/log.ts` plus deleting the local file — but read
`src/domain/redact.test.ts` first for any assertion our tests do not cover.

For imsg: you get redaction for free the moment you adopt the kit logger, which
matters for a tool that reads someone's iMessage database.

---

## 3. Clean wins, ready now

- **`tui/themes/color.ts` → `@george43g/tui-kit/theme`.** Genuinely drop-in.
  The diff is comments and one inlined local variable; zero behavioural
  difference, identical exported surface. Our file's header even credits yours.
- **`tui/hooks/useMouse.ts` → the kit's.** Behaviourally byte-equivalent (same
  `?1000h`/`?1006h` enable, same `?1003h` avoidance, same button mapping, same
  teardown). **One rename**: the exported type is `TuiMouseEvent`, not
  `MouseEvent` — we renamed it because the DOM lib declares a global
  `MouseEvent` and our barrel was shadowing it for consumers compiling with
  `lib: ["dom"]`. Blast radius is one file (`src/tui/App.tsx`, the import and
  the call), and you never import the type by name, so in practice it costs
  nothing.
- **Pure additions**: `withRetry`, `TokenBucket`, `withTimeout`, and the
  TTY/colour helpers. Nothing to reconcile.

---

## 4. What we recommend you do NOT adopt yet

### The theme model — the real blocker, and worse than we said

Correction: the earlier analysis said "~19 components". The verified number is
**21 files and 391 `theme.<key>` read sites**. It also missed two further
incompatibilities.

Your model is flat — `Theme extends Palette`, 26 top-level keys plus `glyphs`,
most derived from the accent hue, many of them *nested objects* (`sidebar` has
9 sub-keys, `drawer` 4, `header` 4, `status` 3). Ours is nested —
`{ palette, glyphs, preset, accent }` with 18 flat string keys, only 5 of them
accent-derived and 6 hard-coded neutrals.

Three key names collide **with different types**, so a naive re-point changes
meaning rather than failing loudly at every site:

| Key | imsg | tui-kit |
|---|---|---|
| `info` | `{ label, value }` | `string` |
| `pending` | `{ bg, fg, border }` | `string` |
| `border` | `string` | `string` (the only true match) |

Two more mismatches the earlier analysis did not mention: the **`ThemeProvider`
APIs differ** (yours takes a pre-built theme, ours builds internally from
`preset`/`accent` props), and **`GlyphSet` is not compatible** — yours has
`sent`/`received`/`envelope`/`iMessage`/`sms`/`paperclip`/`group` plus
`TAPBACK_EMOJI`; ours dropped those as domain-specific and added
`bullet`/`check`/`cross`/`warn`/`info`/`ellipsis`. `theme.glyphs` is read 10×.

**Our position**: do not attempt this as part of the migration. If a shared
theme model is worth building, it is its own project with its own design
conversation, and we would rather change tui-kit to fit a real second consumer
than have you contort 391 call sites to fit a model that was only ever shaped by
one. Tell us what shape you would want.

### `useVimKeys` — confirmed, and your own code documents the hazard

Ours calls `useInput` unconditionally (the `enabled` flag is checked *inside*
the callback, so the handler stays registered with Ink either way). You have one
App-level mode-aware handler with branches for
`palette`/`filter`/`compose`/`compose-new`/`confirm`/`drawer`/`browse`/`select`.
Adding ours registers a second handler that Ink also fires — and your own
comment in `src/tui/App.tsx` records exactly this class of bug: without an early
return, browse-mode keys still fire, "most dangerously `q` (quit) when a
recipient name contains a 'q', which silently killed the whole TUI."

Concretely duplicated: `j`/`k`/arrows, `gg`/`G`, `Ctrl-D`/`Ctrl-U`, and the
digit count buffer — including the same "don't start a count with 0" rule. Our
single `enabled: boolean` cannot express your 8-mode × 2-focus-pane state
machine. **Skip it.** If you want this shared, the kit needs a richer
enable/priority contract; propose one.

### Component collisions — one correction

`StatusBar` and `HelpBar` do collide as same-name-different-component. But
**`DevStatsPanel` does not exist in EQStack** — the earlier analysis was wrong.
Yours is `DevStats`, a *presentational* component taking `stats` as a prop;
ours calls `useDevStats()` itself. Inverted data flow, not a name clash.

Two collisions nobody had noticed: `useDevStats` exists on both sides with
barely-overlapping result types (yours has `engine`, `memMB`, `uptime: string`,
`lastQueryMs`; ours has `heapMb`, `rssMb`, `uptimeSec: number`,
`eventLoopMaxMs`, `killReason`), and our **interface** `DevStats` collides with
your **component** `DevStats`.

`HelpBar` is the one plausible refactor target: ours is a strictly more general
shell taking `hints: KeyHint[]`, where yours bakes the keymap tables into the
component. Hoisting yours into a `Record<Mode, KeyHint[]>` and passing them in
would work.

---

## 5. What we would like FROM you

All five verified as present in EQStack and absent from our kits. No obligation
— but if you are willing to upstream any, we will take them.

| Capability | Where it lives | What it does |
|---|---|---|
| Grapheme-aware `visual-width.ts` | `apps/imsg-mcp/src/visual-width.ts` | Width via `Intl.Segmenter` graphemes, so emoji/ZWJ/flag clusters never split mid-surrogate. We have nothing like it |
| `detectNerdFont()` | `apps/imsg-mcp/src/font-detect.ts` | `spawnSync("fc-list")` with a 1s timeout and a tri-state result where `null` means "couldn't tell". Directly complements our `GLYPH_PRESETS.powerline`, which today can silently render blanks |
| `--yaml` output | `apps/imsg-mcp/src/analytics-render.ts` | Zero-dep `toYaml`. Our `OutputMode` is `human \| json` only |
| Prometheus metrics | `apps/voice-mcp/src/gateway/metrics.ts` | Zero-dep `Counter`/`Histogram` + `renderProm()` exposition |
| Log-level filtering | `apps/voice-mcp/src/log.ts` | `debug\|info\|warn\|error` with a rank threshold. Ours has no `debug` and no gate at all |

Correction: the earlier analysis attributed log-level filtering to imsg. It is
voice-mcp only; imsg's only gate is `IMSG_DEV` file-write gating.

---

## 6. Suggested order

1. **Lockfile**: `pnpm up ink react -r`, add `@george43g/robustness@^0.5.2`.
2. **Watchdog** — biggest win, lowest risk. Wire `onDiagnostic` to your logger
   in the same commit, or you lose the log trail. Delete the source-text sleep-skew
   test.
3. **Shutdown** — pass `exitOnUnhandledRejection: false` and
   `exitOnUncaughtException: false` for the TUI. Decide which module owns the
   force-exit net.
4. **`color.ts` + `useMouse`** — mechanical.
5. **`withTimeout`/`withRetry`/`TokenBucket`** — pure additions, adopt as needed.
6. **Logger** — gets you redaction and the stderr mirror. Biggest behavioural
   surface; do it when you have time to watch it.
7. **Stop.** Theme, `useVimKeys` and the components are not worth it today.

---

## 7. How to reach us

Findings, disagreements, and "this claim is wrong" reports are all welcome —
five of our own claims were wrong before this brief, and every one of them was
caught by reading the actual source. Send them the way `browser-tab` did: a
written brief with file:line references and a repro. If something in a published
package is broken for you, say so explicitly and we will treat it as a blocker,
not a backlog item.
