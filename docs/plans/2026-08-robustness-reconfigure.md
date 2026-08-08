# ExecPlan: robustness singleton `reconfigure()` (DEFERRED #14)

**Status**: complete — landed 2026-08-09 on `fix/robustness-reconfigure`.

## Goal

`@george43g/robustness@0.2.0` shipped two P0 bugs that share one root cause: the
singleton convenience API **replaced** its controller instead of reconfiguring
it, silently discarding consumer state.

Acceptance criteria, all met:

- A cleanup registered before `installShutdownHandlers(opts)` still runs.
- Options passed to `installWatchdog(opts)` take effect regardless of whether
  anything read watchdog state first.
- Memory-sample subscribers and accumulated watchdog state survive configuration.
- Both behaviours are locked by tests at the singleton layer, which had none.
- The three checked-in repros under `docs/repros/` all pass.
- Ships as a patch (`0.2.1`), inside `tui-kit`'s existing peer range.

## Discoveries

Facts found in the source that shaped the design:

1. **`options.onDiagnostic` and `options.exitOnUncaughtException` were already
   read live** off the closed-over object in `shutdown.ts`. Only
   `forceExitAfterMs`, `exit` and `hostProcess` were captured as `const`, so the
   shutdown side needed almost no re-arming — just mutable bindings.
2. **The watchdog's `config` is read live by the samplers**, so threshold changes
   apply immediately. Only four values shape the timers themselves
   (`eventLoopSampleMs`, `memorySampleMs`, `idleCheckMs`, `idleRestart`), so
   re-arming is conditional rather than unconditional.
3. **`sampleEventLoop` has a sleep-skew guard** — `elapsed > sleepSkewMultiplier *
   eventLoopSampleMs` discards the sample as "the machine slept". Re-arming with
   a shorter interval without resetting `state.lastEventLoopSampleTs` throws away
   the first post-reconfigure sample.
4. **`normalizeEnvPrefix` throws**, so rebuilding config before mutating gives
   validate-before-mutate for free on the watchdog side.
5. **This repo's own TUI entries were ordering-lucky, not immune.**
   `apps/example-repo-mcp/src/tui/index.tsx` and `apps/mcpsync/src/tui/index.tsx`
   both configure *before* `renderFullScreen`, so the registry was empty when it
   got nuked. One line-reorder from losing terminal restore on Ctrl-C.
6. **The golden drift test only walks `lib/` → canonical.** Canonical-only files
   (`docs/repros/`, per-plan files under `docs/plans/`) are not flagged, despite
   the test's header comment claiming new canonical files are. Pre-existing
   inaccuracy, noted not fixed.

## Decisions

- **`reconfigure()` on both controller interfaces**, merging options over the
  current config. Rejected: buffering "pending options" until first install, and
  making `installX` throw when called after state exists.
- **`dispose()` was never the bug** — discarding the closure was. `reconfigure`
  reuses `dispose()` solely to relocate listeners onto a replacement host
  process, which is the one change that genuinely requires detaching.
- **Validate before mutating** on both sides, so a bad option leaves the live
  controller untouched rather than half-applied.
- **Refuse to reconfigure once `state.killReason` is set** — never resurrect a
  process that is already being killed.
- **`fix:` not `feat:`** (user decision). `tui-kit`'s peer is
  `^0.1.1 || ^0.2.0`; a caret on a 0.x pins the minor, so `0.3.0` would fall
  outside it and repeat field-note 34. No new module-level exports were added —
  only two methods on already-exported interfaces — so `fix:` is honest.
- **Accepted risk**: adding a required method to an exported interface breaks
  anyone who structurally implements `ShutdownController`.
  `WatchdogOptions.shutdownController` is a `Pick<…>` of four members and is
  unaffected; the package is days old with three in-repo consumers.
- **Documented non-change**: `state.startedAt` is set when the singleton is first
  constructed, which may be a `useDevStats` render rather than `install()`.
  Unchanged behaviour; uptime stays "as observed by the watchdog".

## Validation

Observed, in order:

- The four new singleton tests **failed first** against unmodified source —
  cleanup spy called 0 times, `onDiagnostic` dropped, sample interval ignored.
- After the fix: `pnpm --filter @george43g/robustness test` → 79 passed (8 files).
- Mutation check: disabling `if (timersNeedRearm) rearmTimers()` fails exactly
  one test ("re-arms live timers while preserving state and subscribers") and
  nothing else — the re-arm assertion bites, and the singleton test covers a
  genuinely different path (reconfigure before install).
- Repros against built `dist/`: `robustness-b1.mjs` exits 0 with
  `onDiagnostic honoured: true`; both `b2-control` and `b2-test` print
  `CLEANUP RAN`.
- `pnpm --filter @george43g/mcp-scaffold test` → 131 passed, golden drift green
  after mirroring the four files into `04-robustness/lib/src/`.
- `pnpm regen:example` → diff confined to the same four files under
  `example/packages/robustness/src/`, no unrelated churn.
- `pnpm verify`, `pnpm test:no-native`, `pnpm stress`,
  `pnpm check:robustness-package` — see the ledger in
  [PROJECT_STATE.md](../PROJECT_STATE.md).

## Recovery

Nothing publishes until the merge to `main`; the release job cuts `0.2.1` over
OIDC from the `fix(robustness):` commit. If it misfires, the package is
unaffected until the npm publish step itself succeeds — re-run from `main`
(`ref: main` is already in every job, field-note 34). Rolling back means
reverting the merge and letting the next release recompute; never hand-edit
versions or tags.
