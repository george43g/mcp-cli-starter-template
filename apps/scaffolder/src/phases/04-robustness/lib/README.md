# @george43g/robustness

Project-owned lifecycle and resilience primitives generated in source mode.

This workspace package provides the watchdog, shutdown controller, structured
logging, health snapshots, timeout, retry, rate limiting, and environment
helpers used by the generated app.

Customize policy through `createWatchdog()` and `createShutdownController()`
before forking implementation details. The environment prefix, watchdog
thresholds, idle behavior, diagnostics, exit policy, and cleanup lifecycle are
configurable.

Run its focused checks with:

```sh
pnpm --filter @george43g/robustness typecheck
pnpm --filter @george43g/robustness test
```

This package is private to the generated workspace. Scaffolds created with
`--runtime-source registry` omit this directory and depend on the published
runtime package instead.
