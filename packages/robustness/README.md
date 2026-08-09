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

Programmatic setters beat their env knobs; all are read at call time, so flags
parsed into `process.env` after import still take effect.

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

The logger reads its own knobs (always `MCP_`-prefixed; the logger has no
`envPrefix` option):

- `MCP_LOG_DIR`, `MCP_LOG_PREFIX`
- `MCP_LOG_TO_FILE`, `MCP_LOG_REDACT`
- `MCP_LOG_RING_SIZE`, `MCP_LOG_MAX_BYTES`
- `MCP_HEAP_WARN_MB`, `MCP_HEAP_CHECK_MS`

## Stability

The package begins at `0.1.0`. Public APIs follow semantic versioning, but
minor releases in the `0.x` line may contain intentional breaking changes.
Use a pinned version when lifecycle stability is more important than automatic
updates.
