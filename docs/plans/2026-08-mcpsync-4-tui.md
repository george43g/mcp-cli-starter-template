# ExecPlan: mcpsync Stage 4 — Ink TUI (servers×hosts grid)

Part of [mcpsync overview](2026-08-mcpsync-overview.md).

**Status:** `complete` (2026-08-02) — `tui` command + Ink grid; 99 tests total
(+13 pure-model tests); live PTY render verified. See the Status log at the bottom.

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

## Discoveries (recorded during the build)

- tui-kit exports reused: `renderFullScreen`, `ThemeProvider`, `useTheme`,
  `useVimKeys`, `StatusBar`, `HelpBar`, and the `Palette` type. `useMouse` was left
  unused — keyboard nav (j/k/h/l + gg/G + ^d/^u) covers the grid; mouse can be added
  later without touching the model.
- **The grid model is a pure seam.** `src/tui/model.ts` (`buildMatrix`, `statusTone`,
  `cellText`, `clampIndex`) has no React and no I/O, so it unit-tests against the same
  stub adapters as `diff.test.ts`. `buildMatrix` runs `diffHost` per host and pivots
  into a server→host→status grid — the *same* pivot `commands/list.ts` does for the
  CLI table, so the TUI and `list` can never disagree. `useHostMatrix` is the only
  place that touches disk (`readCanonical` + `detectedHosts`), and exposes `reload()`.
- **`exactOptionalPropertyTypes` gotcha:** ink's `<Box>` accepts `backgroundColor:
  string | undefined` but `<Text>` does not — pass it via conditional spread
  (`{...(bg ? { backgroundColor: bg } : {})}`) on Text, not as `backgroundColor={bg}`.
- **paddingLeft eats a column:** a fixed-width `<Box width={n} paddingLeft={1}>` leaves
  only `n-1` cols for its Text, clipping host headers (`claude-co…`). Widths are
  computed as `1 + max(...)` to compensate.
- Switched `apps/mcpsync/tsconfig.json` from `node.json` → `react.json` and added
  `react`/`ink`/`fullscreen-ink`/`@george43g/tui-kit` (deps) + `@types/react` (dev);
  `@george43g/robustness` (already declared) is now actually used by `runTui`. Vite
  externals extended with `ink`/`react`/`react/jsx-*`/`fullscreen-ink`; the TUI is a
  lazy `import("./tui/index.js")` chunk, so ink/react never load on plain CLI paths.

## Decisions

- Applying from the TUI routes through the same `applyServer` merge path as the CLI
  (single write path, `prune:false` so siblings are never removed). Dry-run/confirm
  semantics are preserved as an in-TUI **y/n confirm**: `a`/`A` stage a pending apply
  and show `Apply <server> → <host>?`; `y` commits, `n`/Esc cancels — the explicit
  confirm IS the safety gate, mirroring the CLI's `--yes`.
- A host-only server (an `extra`, not in canonical) can't be applied — the TUI refuses
  with "import it before applying" rather than inventing a canonical entry.
- **Deferred (not this stage):** per-cell env/args editing (needs text-input modals)
  and `useMouse` nav. The pure model + single write path make both additive.

## Validation

- vitest (13 new, 99 total): `buildMatrix` (sorted union incl. host-only extras;
  per-cell status; `undefined` for absent cells; zero hosts), `statusTone` (all six
  statuses → tone), `cellText` (glyph + `·` for absent), `clampIndex`.
- lint + typecheck + build + test all green (`pnpm --filter @george43g/mcpsync verify`).
  Built output confirmed to keep `ink`/`react`/`react/jsx-runtime`/`tui-kit` as
  external imports in the lazy TUI chunk — nothing bundled.
- **Live:** non-TTY guard refuses (`node dist/cli.js tui` piped → "Refusing to launch
  TUI…", exit 1). A **PTY render smoke** (expect, read-only — only `q` sent, never
  `a`/`y`) drew the full grid: header, all six host columns, real data row
  `1password ✓ ✓ - ✓ ✓ ✓` (byte-identical to `list`), StatusBar
  `[browse] 1password @ claude-code (1/8)`, HelpBar; `q` exited cleanly (alternate
  screen restored, exit 0) — no orphaned Ink process.

## Recovery / Status log

- 2026-08-02: **Stage 4 built + verified.** New files: `src/tui/index.tsx`,
  `src/tui/App.tsx`, `src/tui/model.ts`, `src/tui/hooks/useHostMatrix.ts`,
  `tests/tui-model.test.ts`; edits to `cli.ts` (wire `tui`, guard + lazy import),
  `tsconfig.json` (react), `package.json` (deps + `tui`/`dev:tui` scripts),
  `vite.config.ts` (externals). No changes to the adapter contract or any host.
  Next: **Stage 5** — secrets store + `--scope project` + doctor plaintext scanner.
