# mcpsync — handoff note

**This file travels with the app.** It records what a reader cannot recover from
the code once `apps/mcpsync/` leaves `mcp-cli-starter-template`, which is the
whole reason it exists here rather than in the origin repo's backlog.

## Where it is going, and on what terms

**Destination**: life-stack, as a sibling of `opkeep`. Recorded in the origin
repo's `DEFERRED.md` #10, under an inclusion rule that mcpsync fails: *a thing
belongs in the starter template iff it is scaffolding machinery, or framework
code that generated tools depend on long-term.* mcpsync is neither — it is a
standalone product that merely **consumes** the kits, exactly like any external
consumer.

**It migrates WITHOUT PUBLISHING** — George's decision, 2026-08-22. It moves as a
private tool installed from a local path, not as a registry dependency.

Three things follow, and each removes work someone had planned:

- **The npm bootstrap is not needed.** `@george43g/mcpsync` has never been
  published — `npm view` returned **E404** every time it was checked — so there
  is no orphaned version, no trusted-publisher config to create, and no name to
  defend.
- **life-stack having no release pipeline stops being a blocker.** That was
  recorded as the migration's hard blocker on 2026-08-18. Not publishing
  dissolves it rather than solving it.
- **Its `semantic-release` devDeps and `.releaserc.json` are now dead weight.**
  They can be dropped at the new home. Nothing reads them: the release job that
  did was deleted from the origin repo on 2026-08-22.

## What still has to happen at the new home

1. **Rewrite four `workspace:*` devDeps** — `@george43g/cli-kit`,
   `@george43g/tui-kit`, `@george43g/tsconfig`, `@george43g/vitest-config`.
   Only the last two resolve in life-stack (it ships its own private copies).
   cli-kit and tui-kit must become real version ranges from npm.
   **This is where an earlier "zero manifest changes" claim was wrong** — it was
   made by checking the two config packages and generalising.
2. **Decide whether to keep bundling the kits.** `vite.config.ts:17-22` bundles
   cli-kit and tui-kit into `dist/` and its own comment calls that legacy now
   that both are published. Externalising them means moving
   `cli-table3`/`picocolors`/`ink`/`react` back out of `dependencies`.
3. **The global `mcpsync` bin keeps working throughout.** The pnpm shim is
   PATH-based and runs whatever `dist/` is at its target — so **there is no
   "reinstall" step**, and advising one is a no-op that gives false confidence.
   Its only deploy step is a build at whatever directory the shim points to.
   (Learned the hard way, 2026-08-22.)

## Known gap: TUI env/args editing

`src/tui/App.tsx` applies servers to hosts but **cannot edit a server's `env` or
`args` in place** — you drop to `mcpsync add` or an editor. Blocked on two
things:

- `@george43g/tui-kit` has **no text-input primitive** (it ships `useVimKeys`,
  `useMouse`, `StatusBar`, `HelpBar`, and as of 0.5.x the list primitives
  `lineWindow`/`navReduce`/`allocateWidths`/`scrollbarThumb`). This needs a new
  ink text-edit surface, or `ink-text-input` adopted directly.
- It needs a canonical `.mcp.json` write-back path plus `reload()` via a new
  `core` helper.

Sketch: an `e` edit mode over ink's `useInput`. ~half a day; warrants its own
plan rather than being squeezed into a sync PR.

## The one invariant not to "improve"

Secrets never land in a world-readable config. The 0600 vault at
`~/.mcpsync/credentials.json` is the only place real values may live; every
emitted config carries `${VAR}` placeholders. mcpsync's tests must use tmp
fixtures and never touch a real `~` config — a test that reads the developer's
own MCP configuration is one edit away from writing to it.
