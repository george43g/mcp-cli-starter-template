# ExecPlan: mcpsync Stage 4 — Ink TUI (servers×hosts grid)

Part of [mcpsync overview](2026-08-mcpsync-overview.md).

**Status:** `pending`.

## Goal

An interactive servers×hosts grid for reviewing drift and applying changes.

## Deliverables

- `src/tui/index.tsx` — `runTui()` installs robustness handlers, reads theme via
  `envStr`, then `renderFullScreen(<ThemeProvider preset accent><App/></ThemeProvider>)`
  from `@george43g/tui-kit`; registers `screen.unmount()` cleanup; awaits
  `waitUntilExit()`.
- `src/tui/App.tsx` + `components/` + `hooks/` — grid of servers (rows) × hosts
  (cols); each cell shows installed/enabled/drift; per-cell toggle install/enable,
  edit env/args, apply. Navigation via `useVimKeys`/`useMouse`; chrome via
  `StatusBar`/`HelpBar`.
- `src/tui/hooks/useHostMatrix.ts` — read all adapters into the grid model
  (reuses `HOSTS` + `read()`).
- Wire `mcpsync tui` in `cli.ts`: guard with `isInteractive()`, lazy
  `await import("./tui/index.js")`.

## Discoveries

- tui-kit exports to reuse: `renderFullScreen`, `ThemeProvider`, `useVimKeys`,
  `useMouse`, `StatusBar`, `HelpBar`, `boundIfNeeded`, `MemoryCache`.

## Decisions

- Applying from the TUI routes through the same `applyServer`/adapter write path as
  the CLI (single source of truth); dry-run/confirm semantics preserved.

## Validation

- Launch `mcpsync tui`: grid renders across detected hosts; nav + toggle + apply
  work against tmp fixtures or dry-run; clean exit (no orphaned Ink process).

## Recovery / Status log

- (pending)
