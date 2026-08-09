# @george43g/robustness

Reusable lifecycle and resilience primitives for local Node.js MCP servers,
CLIs, and TUIs.

The package includes:

- Configurable watchdogs for event-loop lag, memory growth, RSS limits, and
  quiet uptime restarts.
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

Programmatic setters beat their env knobs; all are read at call time, so flags
parsed into `process.env` after import still take effect. That claim was not
quite true before 0.6.0: `MCP_LOG_PREFIX` was read once at module load, so the
`--log-prefix` flag set the variable and changed nothing.

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
- `MCP_LOG_RING_SIZE`, `MCP_LOG_MAX_BYTES`
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

## Stability

The package begins at `0.1.0`. Public APIs follow semantic versioning, but
minor releases in the `0.x` line may contain intentional breaking changes.
Use a pinned version when lifecycle stability is more important than automatic
updates.
