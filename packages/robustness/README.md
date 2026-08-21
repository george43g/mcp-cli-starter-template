# @george43g/robustness

Reusable lifecycle and resilience primitives for local Node.js MCP servers,
CLIs, and TUIs.

The package includes:

- Configurable watchdogs for event-loop lag, memory growth, RSS limits, and
  quiet uptime restarts — self-killing by default, or observe-only via an
  `onBreach` hook the consumer owns.
- Graceful shutdown controllers with cleanup registration, signal handling,
  stdin EOF detection, and orphan detection.
- Structured logging with redaction on by default, performance spans, health
  snapshots, retry, timeout, and token-bucket helpers.
- Environment parsing helpers.

## Install

```sh
pnpm add @george43g/robustness
```

Node.js 24 or later and ESM are required.

## Basic MCP lifecycle

```ts
import {
  installShutdownHandlers,
  installWatchdog,
  noteActivity,
} from "@george43g/robustness";

installShutdownHandlers();
installWatchdog();

// Call from each successful or attempted tool dispatch.
noteActivity();
```

`installShutdownHandlers` and `installWatchdog` both accept options and apply
them **in place**. Cleanups already registered, memory-sample subscribers, and
accumulated watchdog state all survive, and repeated calls merge rather than
replace — so configuring after mounting a TUI is safe, and call order does not
change behaviour.

The convenience API reads `MCP_*` environment variables. For a product-specific
namespace or different TUI policy, create isolated controllers:

```ts
import {
  createShutdownController,
  createWatchdog,
} from "@george43g/robustness";

const shutdown = createShutdownController({
  exitOnUncaughtException: false,
  exitOnUnhandledRejection: false,
  onDiagnostic: ({ level, event, data }) => {
    // Forward to the application's logger.
  },
});

const watchdog = createWatchdog({
  envPrefix: "MY_TOOL",
  idleRestart: false,
  memoryGrowthMinMb: 25,
  shutdownController: shutdown,
});

shutdown.installHandlers();
watchdog.install();
```

Call `dispose()` on isolated controllers when embedding them in another process
or when a test finishes. Timers are unreferenced and do not keep the process
alive.

Two defaults to know:

- **Diagnostics are never silent.** When `onDiagnostic` is not wired, a default
  sink logs every lifecycle event via the package logger and writes error-level
  events (uncaught exceptions, cleanup timeouts) to stderr synchronously.
  Installing an `uncaughtException` listener suppresses Node's own report, so
  without this an unwired consumer would lose the crash trail entirely. Pass a
  no-op `onDiagnostic` to silence diagnostics deliberately.
- **Unhandled rejections exit by default** (`exitOnUnhandledRejection: true`,
  exit code 70), matching Node's own fatal-by-default semantics — which merely
  observing the event would otherwise suppress process-wide. Long-running
  interactive TUIs disable it alongside `exitOnUncaughtException`.

### Cleanup ordering — register write-once cleanups LAST

Cleanups run in registration order in an async pass, **and** the `exit` listener
sweeps the whole registry synchronously. That second pass is a guarantee, not an
accident: a cleanup still runs when an earlier one hangs and trips the force-exit
timer.

The corollary bites anything that writes a line. A stalled `runCleanup` never
reaches `registry.clear()`, so a cleanup the async pass *did* reach runs a second
time in the sweep:

| registered | a later cleanup hangs | all cleanups clean |
|---|---|---|
| first | **2 invocations** | 1 |
| last | 1 | 1 |

Registering write-once cleanups **last** puts them where the sweep is their only
invocation. But last is not a position you can hold: anything that registers a
cleanup at **runtime** lands after yours — a lazily armed watcher inside a tool
handler, or an ink component registering on mount (tui-kit's `FullScreenInk`
does exactly that). In that shape "last" is unstable by construction.

**So make write-once cleanups idempotent. Ordering alone cannot protect them
once registration is dynamic:**

```ts
let written = false;
registerCleanup(() => {
  if (written) return;
  written = true;
  logShutdown(getShutdownCause());
});
```

Measured: marker registered last, then a runtime registration that hangs — two
lines unguarded, one guarded. The ordering advice tells you when it bites; the
guard removes the precondition.

### Why the process is shutting down

A final shutdown log line is far more useful when it names the cause. Without
one, a user quit, a supervisor `SIGTERM`, a watchdog self-kill and an uncaught
exception all produce an identical last line.

```ts
import { getShutdownCause, registerCleanup } from "@george43g/robustness";

registerCleanup(() => {
  log.info("shutdown", { reason: getShutdownCause(), uptime_s: uptime() });
});
// → {"msg":"shutdown","data":{"reason":"signal:SIGTERM","uptime_s":8}}
```

Recorded automatically: `signal:<NAME>`, `uncaught_exception`,
`unhandled_rejection`, `stdin_eof`, `orphaned`, and `watchdog:<reason>` when the
watchdog initiates the kill. Anything else is `"normal"`. Name your own causes
with `noteShutdownCause("user_quit")` before calling `shutdown()`.

**A cause is only recorded when the event actually initiates the shutdown.** If
you run with `exitOnUncaughtException: false` or `exitOnUnhandledRejection:
false` — as a long-running TUI should — an error the process *survives* is not
the cause of an exit six hours later. The `uncaught_exception` /
`unhandled_rejection` diagnostic still fires unconditionally; that is the channel
for "this process survived an error", and the cause is not. Fixed in 0.8.1;
in 0.8.0 a survived error was recorded permanently and first-writer-wins then
masked the real cause.

**First writer wins.** The initiating cause beats the follow-on events it
triggers — a watchdog kill that escalates to a signal still reports
`watchdog:event_loop_blocked`, not `signal:SIGTERM`. Last-writer-wins would make
a postmortem's first line name the symptom rather than the cause.

`stdin_eof` and `orphaned` are also **newly emitted as diagnostics**. Both paths
previously shut the process down without emitting anything at all, so a consumer
sink observed a shutdown with no event to attribute it to. If you match on
diagnostic events, expect these two.

## Logging

The logger keeps an in-memory ring buffer (last 500 lines) and appends NDJSON
to `MCP_LOG_DIR` (default `$TMPDIR/<prefix>/`, 10MB rotation) for post-mortem
analysis.

- **Redaction is ON by default**: phone numbers become `…NNNN` and
  secret-shaped strings (API keys, tokens) become `[redacted]` in every sink —
  ring buffer, file, and stderr mirror. Opt out with `MCP_LOG_REDACT=0` or
  `setLogRedaction(false)`. The underlying `redactString`/`redactValue` are
  exported for redacting your own payloads before they reach any boundary.
- **File output is opt-out**: `MCP_LOG_TO_FILE=0` or `setFileLogging(false)`
  for bins whose end users should not accumulate `$TMPDIR` logs by default.
- **Stderr mirror**: `setStderrMirror(true)` mirrors info/warn/error (never
  perf spans) to stderr, so an MCP host's connection log surfaces them. Enable
  it from a stdio entrypoint only — never in a process that renders a TUI.
- **`writeStderrLine(line)`** writes to fd 2 synchronously and never throws:
  the line survives even if the process dies microseconds later, which is what
  makes startup crashes visible in a host's log.
- **Level threshold**: `setLogLevel(level)` or `MCP_LOG_LEVEL` gates
  `debug | info | warn | error | silent`. The default is `debug` — everything
  emits, which is what this logger did before the gate existed, so upgrading
  changes nothing. `perf` spans rank with `info`: `warn` and above drop them.
- **`getFileLogLines(tail, { preferPid })`** prefers the current process's log
  file, falling back to newest. "Newest file" returns the *other* process's log
  whenever two instances share a machine — an MCP server plus a TUI, or a
  respawned host.
- **Old files are reaped (new in 0.11.0)** — `MCP_LOG_KEEP_FILES`, default 5.
  See below; before 0.11.0 rotation bounded file size and nothing bounded disk.

Programmatic setters beat their env knobs; all are read at call time, so flags
parsed into `process.env` after import still take effect. That claim was not
quite true before 0.6.0: `MCP_LOG_PREFIX` was read once at module load, so the
`--log-prefix` flag set the variable and changed nothing.

### Rotation bounds file size; `pruneLogs` bounds DISK (new in 0.11.0)

Rotation opens a new file at `MCP_LOG_MAX_BYTES`. Until 0.11.0 nothing ever
deleted the old one, so a long-lived server accumulated 10MB files forever. On
the HTTP transport that happened silently — it deliberately does not mirror to
stderr (stray stderr garbles a TUI), so the files piled up in `$TMPDIR` where
nobody was watching.

`ensureLogFile()` now calls `pruneLogs()` whenever it opens a file: on rotation,
and on the FIRST open, which is what reaps whatever previous runs left behind.

```ts
import { pruneLogs } from "@george43g/robustness";

pruneLogs();              // the configured dir, MCP_LOG_KEEP_FILES (default 5)
pruneLogs(dir, 10);       // or explicitly, e.g. from a maintenance command
```

**A file count, not a byte budget, deliberately.** Rotation already caps every
file at `MCP_LOG_MAX_BYTES`, so `keep x maxBytes` *is* the byte budget — ~50MB
at the defaults — and a count needs no `stat()` call per file.

**A live process's open file is never deleted.** One directory is shared by
every instance with the same prefix, so a plain newest-N prune would destroy a
running peer's log. It would not even crash the peer — `appendFileSync` reopens
by path — it would silently lose its history, which is worse. Only the newest
file per live pid is protected; that process's own rotated files are reapable.
The effective cap is therefore `keep` + one file per live instance.

Ordering is by the **timestamp** segment of the filename, not the whole name: a
plain reverse-lexical sort orders by pid first, so `mcp-9999-<old>` would sort
ahead of `mcp-101-<new>` and "newest" would mean "highest pid". `getFileLogLines`
shared that flaw in its fallback branch and is fixed in the same release.

### `_resetForTests()` also resets the prefixes (changed in 0.6.0)

`_resetForTests()` now clears `logFilePrefixOverride`, `envPrefix` and
`logLevelOverride` alongside the buffers. That fixed a real isolation leak — one
test's `setLogEnvPrefix` used to pin the prefix for every later test in the same
process — but it shipped without being called out, so it is worth stating
plainly: **if you call it in `beforeEach`, your logger configuration is gone from
that point on** and the logger falls back to `MCP_`.

Reconfigure after resetting rather than only at suite start:

```ts
function configureKitLogger() {
  setLogEnvPrefix("MYAPP");
  setFileLogging(false);
}

beforeEach(() => {
  _resetForTests();
  configureKitLogger(); // without this the prefix silently reverts to MCP_
});
```

## Observing a breach instead of killing it

By default every breach the watchdog detects kills the process: it records a
kill reason, attributes the shutdown cause, logs `watchdog_kill: <reason>`, arms
a 5s force-exit net and calls `shutdown(1)`. That is right for an unattended
MCP server and wrong for a long-lived interactive process that would rather
know about a breach than be restarted by one.

`onBreach` lets the consumer decide, per breach:

```ts
import { createWatchdog, type WatchdogBreach } from "@george43g/robustness";

const watchdog = createWatchdog({
  onBreach: ({ reason, data }: WatchdogBreach) => {
    metrics.increment(`watchdog.breach.${reason}`, data);
    // Tolerate memory pressure, still self-kill on a wedged event loop.
    return reason === "rss_exceeded" ? "observe" : "kill";
  },
});
```

`reason` is one of `event_loop_blocked`, `event_loop_sustained_lag`,
`rss_exceeded`, `memory_leak_suspected`, `idle_restart`. `data` is the same
payload the `watchdog_kill` diagnostic carries.

**Nothing changes unless you return `"observe"`.** Returning `"kill"`, returning
nothing at all, or throwing from the hook each leave the kill path exactly as it
was — a hook that crashes must not be able to switch the watchdog off, so a
throw is logged as `watchdog_breach_handler_failed` and the kill proceeds.

An observed breach still logs. It emits `watchdog_breach_observed: <reason>` at
`warn`, with the same data, and does none of the four things a kill does — no
`killReason`, no shutdown cause, no force-exit timer, no `shutdown()`:

```
[warn] watchdog_breach_observed: rss_exceeded {"rss_mb":82.3,"threshold_mb":1}
```

The event name is deliberately not `watchdog_kill`, so a log scraper keyed on
the kill line never sees a kill that did not happen.

**An observed breach re-fires on every subsequent sample that still breaches** —
every 5s for the event loop, every `memorySampleMs` for memory. It is not
latched, because the sampler interval is already the rate limit and a latched
hook makes "kill on the third consecutive breach" impossible to write without
rebuilding the sampler's timing. The one thing suppressed on the observe path is
the `rss_kill_heap_forensics` dump: full heap statistics plus every heap space,
every 60s forever, is not a payload to emit for a condition you have chosen to
tolerate.

The hook is synchronous. The verdict is needed before the sampler can act, so
there is nothing useful to do with a pending promise; feed a queue from the
hook if the reaction is slow.

## Watchdog state

`readWatchdogState()` returns the live watchdog state — event-loop percentiles,
memory, idle timers, and `killReason`.

**`rssMb`/`heapMb` are populated from the moment the process starts.** The memory
sampler only runs every `memorySampleMs` (default 60s), but consumers poll far
faster — dev panels every few seconds, health endpoints on demand — so both
figures used to read `0` until the first sample landed. A freshly started process
reported using no memory during exactly the window someone debugging a startup
problem is watching. They are now read live on access before the first sample, at
the cost of one `process.memoryUsage()` call.

`memorySampled` tells the two apart when it matters:

```ts
const { rssMb, heapMb, memorySampled } = readWatchdogState();
// memorySampled === false → a live reading taken just now
// memorySampled === true  → the value the sampler last recorded
```

The same fill-in applies to the `MCP_WATCHDOG_STATE_PATH` snapshot, which the
event-loop sampler writes every 5s — twelve times before the first memory sample.

### Testing health branches from a consumer (added in 0.10.0)

`snapshotHealth` takes the watchdog state as an optional second parameter:

```ts
snapshotHealth(counters: HealthCounters, state?: WatchdogState): HealthSnapshot
```

Omit it and nothing changes — it defaults to `readWatchdogState()`.

It exists because the default made the degraded/unhealthy branches
**unreachable from a consumer's test suite**. `health.ts` reads watchdog state
through a package-internal relative import, and vitest externalizes
`node_modules`, so neither `vi.mock("@george43g/robustness")` nor mocking the
subpath file intercepts it. Driving those branches meant `deps.inline` surgery
in every consumer, or not testing them.

Pass the state explicitly and the barrel import becomes your mock seam:

```ts
const snap = snapshotHealth(counters, { ...readWatchdogState(), killReason: "rss_exceeded" });
snap.status; // "unhealthy" — the 503 branch an HTTP /health test needs
```

Note this replaces an escape hatch that is deliberately gone:
`readWatchdogState()` returns a **copy**, so mutating its result no longer
steers the live snapshot.

## Rate limiting

`TokenBucket` offers a blocking and a non-blocking take:

```ts
await bucket.acquire();                     // waits until tokens are free
const { ok, retryMs } = bucket.tryAcquire(); // answers now
if (!ok) throw new Error(`rate limit hit. Retry in ${retryMs}ms`);
```

`tryAcquire` exists for call sites that must answer immediately — an MCP tool
that should fail fast with a retry hint rather than silently stalling the client
for seconds.

- **`retryMs` is sufficient, not merely positive.** Waiting exactly that long
  makes the next call for the same `n` succeed.
- **rps=0 differs between the two.** `acquire` treats it as "limiter off" and
  returns without deducting. `tryAcquire` treats it as a fixed budget: the
  initial `capacity` tokens are spendable and never refill, and once drained it
  returns `{ ok: false, retryMs: 0 }` — 0 meaning *never*, so the caller decides
  rather than being handed a wait that cannot help.
- **Asking for more than `capacity` throws** on both, while the limiter is
  active. Refill caps at `capacity`, so such a request can never be granted;
  before 0.7.0 `acquire` spun on it forever.

## Environment variables

With the default `envPrefix: "MCP"`:

- `MCP_EVENT_LOOP_SAMPLE_MS`
- `MCP_EVENT_LOOP_WARN_MS`
- `MCP_EVENT_LOOP_KILL_MS`
- `MCP_EVENT_LOOP_SUSTAINED_MS`
- `MCP_EVENT_LOOP_SUSTAINED_SAMPLES`
- `MCP_MEMORY_SAMPLE_MS`
- `MCP_MAX_RSS_MB`
- `MCP_HEAP_GROWTH_SAMPLES`
- `MCP_HEAP_GROWTH_MIN_MB`
- `MCP_RESTART_AFTER_MS`
- `MCP_RESTART_QUIET_MS`
- `MCP_IDLE_CHECK_MS`
- `MCP_WATCHDOG_STATE_PATH`

Changing `envPrefix` changes the prefix for all of these variables.

The logger reads its own knobs, and takes its own prefix via
`setLogEnvPrefix(prefix)` — the logger's and the watchdog's prefixes are set
independently:

- `MCP_LOG_DIR`, `MCP_LOG_PREFIX`
- `MCP_LOG_LEVEL`
- `MCP_LOG_TO_FILE`, `MCP_LOG_REDACT`
- `MCP_LOG_RING_SIZE`, `MCP_LOG_MAX_BYTES`, `MCP_LOG_KEEP_FILES`
- `MCP_HEAP_WARN_MB`, `MCP_HEAP_CHECK_MS`

```ts
setLogEnvPrefix("IMSG"); // now reads IMSG_LOG_DIR, IMSG_LOG_LEVEL, ...
```

An earlier version of this README stated "the logger has no `envPrefix`
option" as the contract. It has one as of 0.6.0, requested by a consumer
running this package in a non-MCP systemd service that had no business
writing `MCP_` in its unit file.

Note that `setLogEnvPrefix` and `setLogFilePrefix` are different things and
neither replaces the other: the first names environment **variables**, the
second is the slug used for the log **directory, file name and stderr tag**.

## Stability, and what your range opts you into

The package begins at `0.1.0`. Public APIs follow semantic versioning, but
minor releases in the `0.x` line may contain intentional breaking changes.
Use a pinned version when lifecycle stability is more important than automatic
updates.

### Picking a range — the 0.x trap, both directions

**`^0.9.0` locks the MINOR.** It resolves `>=0.9.0 <0.10.0`, so it can never
reach `0.10.0`. Consumers here have sat a release behind while `npm view`
cheerfully reported a version they could not install. If you want additive
releases automatically, a caret on 0.x is not the range you want.

**`>=0.9.0 <1` is what this repo's own packages use** — and it is worth being
explicit about the other side of that trade, because a consumer named it:
**it opts you into the 0.x breaking-change channel on any lockfile
regeneration.** A minor here may carry an intentional break, and you will
receive it unreviewed the next time your lockfile is rebuilt.

**That range assumes you have a verification gate that would catch it.** This
repo's own consumers do: a `pnpm verify` (or equivalent) that pins exact
behaviour — exit codes, log record strings, rendered output — rather than only
typechecking. Types catch a changed signature; they do not catch a changed
`shutdown` marker string or a different exit code, and those are what a
lifecycle package can move in a minor.

If you have no such gate, **pin exactly** and upgrade deliberately. Picking
`>=0.x <1` without one is choosing automatic delivery of changes nothing on
your side is checking.

### A correct range is not enough on pnpm 11

A wide range assumes resolution can actually REACH a new publish, and on pnpm 11
that assumption is false by default.

`minimumReleaseAge` is a supply-chain guard: pnpm refuses to resolve a version
published more recently than its threshold. **Exact specifiers bypass it;
ranges do not.** pnpm 11 enables it by default. So a consumer with the right
range, on the right registry, watching the right package, still gets the old
version — `pnpm install` reports "up to date" and the natural conclusion is that
the publish failed. That misdiagnosis cost a consumer twenty minutes with the
correct range already in hand.

```yaml
# pnpm-workspace.yaml
minimumReleaseAgeExclude:
  - "@george43g/*"
```

Scope it to the packages you publish yourself. The quarantine is a good default
for the rest of the registry and worth keeping.

Reported by the gmail-cli-mcp session, who bisected it on pnpm 11.0.0 and
11.15.1. Measured here on **pnpm 10.29.3 it is OFF by default** — a
`>=0.9.0 <1` range resolves to the newest version — but the setting exists on
10.x, so adding the exclude now is forward-compatible rather than premature.

`resolutionMode` is a separate knob and, at least on 10.29.3, **does not need
setting**: it is unset, the effective default is `highest`, and a direct
`>=0.9.0 <1` dependency resolves to the newest version rather than the floor.
Verified rather than assumed, because the opposite was reported.
