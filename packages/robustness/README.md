# @george43g/robustness

Reusable lifecycle and resilience primitives for local Node.js MCP servers,
CLIs, and TUIs.

The package includes:

- Configurable watchdogs for event-loop lag, memory growth, RSS limits, and
  quiet uptime restarts.
- Graceful shutdown controllers with cleanup registration, signal handling,
  stdin EOF detection, and orphan detection.
- Structured logging, performance spans, health snapshots, retry, timeout, and
  token-bucket helpers.
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

## Stability

The package begins at `0.1.0`. Public APIs follow semantic versioning, but
minor releases in the `0.x` line may contain intentional breaking changes.
Use a pinned version when lifecycle stability is more important than automatic
updates.
