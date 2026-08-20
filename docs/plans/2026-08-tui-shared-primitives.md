# Shared TUI primitives for `@george43g/tui-kit`

## Goal

Four TUIs — imsg-mcp (EQStack), gmail-cli-mcp, up-bank-mcp, browser-tab-mcp —
independently reimplement the same list/column/selection machinery. Ship the
genuinely shared part in `tui-kit` once, so a capability built for one consumer
reaches all four.

George's framing, verbatim, and it is the acceptance criterion rather than
context:

> that's at least 4 TUI's using very similar code and re-implementing it... we
> could create one really good interface once, and then apply it to all the
> tools at once

and on why extraction is worth more than de-duplication alone:

> instead of only one of them getting a cool feature, all the consumers
> *benefit* because ... we wouldnt have bothered writing a vim style navigation
> (for example) just for the up-bank-mcp alone, but since we share the libs -
> everyone benefits from it

**Accepted when**: EQStack deletes `ThreadPane`'s window memo *and*
`computeSettingsWindow` in favour of one kit function; browser-tab gets the
scroll indicator it does not have; no consumer surrenders its key-dispatch loop.

**Process constraint, also his, and it is the reason this file exists**:
negotiate the design with the consumers BEFORE writing it, so nobody ships a
private version that has to be unpicked later — a cycle this fleet has already
repeated.

## Status

`active` — design agreed in outline, signatures under review by the consumers.

- **2026-08-21** — Queried EQStack, browser-tab-mcp, up-bank-mcp. Library survey
  done. Design turned from "a navigator" into "five primitives" on consumer
  evidence (see Decisions). Signature sketch sent to EQStack and browser-tab.
  browser-tab resolved the collapse-vs-drop question the same day (Decisions).
  Awaiting: EQStack's signature critique, up-bank's reply (no response yet).

## Discoveries

### The ink ecosystem has the scrolling layer but no navigator

Measured 2026-08-21 via `npm view` + the downloads API, not from memory:

| package | version | ink peer | weekly | verdict |
|---|---|---|---|---|
| `ink-scroll-view` | 0.3.7 | `^5 \|\| ^6 \|\| ^7` | **118,759** | real, maintained |
| `ink-scroll-list` | 0.4.1 | `>=6` | **83,758** | built on the above |
| `ink-virtual-list` | 0.3.0 | `^6 \|\| ^7` | **34** | fresh but unused |
| `ink-tree-view` | 0.4.0 | `>=6.0.0` | **9** | effectively unused |
| `ink-miller-columns` | — | — | — | **NOT PUBLISHED** |
| `ink-scroll-bar` | — | — | — | **NOT PUBLISHED** (referenced in a README) |

Both ByteLand packages are MIT, ESM, and explicitly **controlled-selection with
no internal input capture** — the ecosystem independently reached the same
answer the consumers did.

### …and it still does not fit, for a reason that is not popularity

`ink-scroll-view` MEASURES item heights by rendering into a virtual DOM and
reports them back (`onItemHeightChange`, `getItemHeight`). EQStack needs heights
**predicted by a pure function before** choosing the window, because the window
determines what gets rendered, and their bounded-memory eviction means
rendering everything to measure it is not available to them.

Measured-height and predicted-height windowing are different algorithms. The
libraries are right for short lists with unpredictable content; they are wrong
for a 100k-message thread. **Documented as the alternative, not depended on.**

### Three laws from consumers, each with an incident behind it

1. **ink WRAPS an overflowing `Text`, and `overflow="hidden"` does not clip the
   extra lines.** One over-wide row turns N rows into N+k printed lines and
   corrupts the whole frame — reproducible below ~156 cols with real data
   (browser-tab; their soak's frame-height invariant exists because of it).
   *Consequence*: the row primitive has an EXACT-width post-condition, not a
   best-effort one.
2. **Windowing must be by RENDERED LINES with a per-item height function, never
   by row count.** Row-count windowing produced EQStack's height-0 overpaint bug
   family (#99/#101/#103): a yoga-shrunk box paints its text over the next row.
   Historically expensive to diagnose — hexdump archaeology.
3. **Item arrays are not stable and indices are not durable.** EQStack's
   bounded-memory eviction collapses the middle of long threads and remaps the
   cursor; lazy-load prepends shift it. Called out by them as *"the single most
   likely adoption-killer for imsg if missed"*.

### Key dispatch: settled, 3 for 3

EQStack, browser-tab and gmail-cli-mcp each independently chose **fully
controlled — no key handling inside the component**, without seeing each other's
answers, and both real ink libraries are built that way.

EQStack's reasons are the strongest and both carry incidents: their INPUT-GUARD
LAW (one top-level `useInput`, every modal mode gets an early-return guard) was
born from **`q` typed into a recipient-name field quitting the app**; and their
chunked-keystroke law exists because ink delivers a paste as ONE `useInput` call
with the whole string, so a component owning keys would reintroduce
paste-drives-motion for every consumer at once.

browser-tab priced option (a) and found it self-defeating: they would need an
`enabled`/mode-scoped bypass plus the same imperative API underneath, *"at which
point (a) is (b) with an extra layer."*

## Decisions

### REJECTED: a Miller-column / tree navigator component

Two consumers argued against it from **opposite tree shapes**, which is why it
is rejected rather than deferred:

- **browser-tab**: their data genuinely is a tree (browser > window > tab) and
  they still render a flat indented outline *deliberately* — 1-3 browsers, 2-4
  windows, **100+ tabs**. Miller columns would spend two columns on three-item
  levels and cram 100 into the third.
- **EQStack**: imsg is two peer panes plus modal drawers. Its detail surface is
  a stateful drawer with its own action keymap and mode-gated width, sometimes
  absent — not a rightmost column.

EQStack set the burden as *"name the imsg surface that becomes BETTER as column
3 of a tree than as the modal drawer it is today."* **No such surface was
found, and none was invented.** A shell composes on top of the primitives later
if up-bank or gmail produce a shape that needs N>2; it does not gate them.

### ACCEPTED: five pure primitives

All leaf utilities, no composition ownership — matching the pattern EQStack
observed in this kit's own history: the lifts that stuck (`visualWidth`,
`detectNerdFont`, viewport maths, colour helpers) were leaves; the two they
rejected (theme model, `useVimKeys`) both wanted to own composition.

1. `lineWindow(spec)` — line-budget windowing over heterogeneous heights, with a
   caller-supplied pure `heightOf(index)`. Replaces EQStack's `ThreadPane`
   window memo AND `computeSettingsWindow` — the same maths written twice.
2. `scrollbarThumb(w, trackRows)` + a `<Scrollbar>` — the ecosystem gap.
3. `navReduce(state, intent, ctx)` — pure cursor transitions: clamp,
   count-prefix, page, top/bottom, group-jump, and
   `{kind:"itemsReplaced", remap}` for law 3. Plus `RestorePolicy` as a
   PARAMETER (`restore | snap-end | snap-start | follow-until-touched`) because
   the right default is contested inside a single app.
4. `allocateWidths(total, columnSpecs)` —
   `{id, min, preferred, max, priority, collapseTo?}` in, widths + collapsed
   out. NOT viewport-shaped: the horizontal axis is ALLOCATION among
   heterogeneous columns, not windowing over homogeneous rows.
5. `fitToWidth(s, cols, ellipsis?)` — truncate THEN pad in one call, the
   composition gmail identified as what every real call site pairs. Property
   test: `visualWidth(fitToWidth(s, n)) === n`.

### RESOLVED: columns degrade by what their content IS, not by rank

The one genuine disagreement in the negotiation. browser-tab wanted the detail
column DROPPED (gone, zero width); EQStack wanted lowest-priority columns
collapsed to a BREADCRUMB. Both were right about their own columns, and
browser-tab supplied the rule that unifies them:

> **columns whose content is CONTEXT collapse to a breadcrumb; columns whose
> content is ELABORATION drop.**

EQStack's columns carry orientation — which mailbox, which thread you are inside
— so losing them loses your place, and they must degrade to something visible.
browser-tab's detail pane is elaboration: the list row already IS the crumb
(truncated title + URL), so a collapsed-but-present detail column would spend
10+ columns duplicating information while the list starves for title width. Its
degraded form is absence.

Supporting evidence they volunteered: their `DevStatsPanel` (~38 cols, the
proto-detail-column) toggles to GONE today, and their one frame-corruption bug
lived exactly at its width boundary.

**Consequence for the signature**: `priority` orders victims but not their
degraded form, so it cannot express this alone. `ColumnSpec` gains
`collapseTo?: number | "drop"`.

### DEFERRED: terminal image rendering

Both EQStack and browser-tab independently flagged that raw escape passthrough
inside an ink layout bypasses ink's renderer and frame diffing, and that
mouse-zoom needs SGR mouse reporting ink does not provide. **Treat as a research
spike with a NO-GO branch, not a feature row.** Candidate deps surveyed:
`terminal-image` 5.0.1 (MIT), `term-img` 7.1.0 (MIT, iTerm only), `ansi-escapes`
7.3.0 (MIT); `chafa-wasm` is LGPL-3.0 and therefore a licence question, not just
a technical one. browser-tab's screenshot CAPTURE already ships, so this is
render-only for them.

## Open questions

1. ~~`allocateWidths` collapse semantics.~~ **RESOLVED 2026-08-21** — see
   Decisions. They were two behaviours and browser-tab supplied the rule that
   unifies them.
2. **`lineWindow`: is `aboveFraction` the right knob**, or is EQStack's
   bottom-anchor walk-up a distinct mode rather than a ratio?
3. **`heightOf` memoisation** — plain function, or does the estimator need
   caching hooks given it is called across a walk?
4. **`splitNavChunk(input, owned)`** — the pure half of EQStack's chunk law.
   Offered; awaiting their ruling on whether even that is the thin end of the
   wedge.
5. **up-bank-mcp has not answered.** Their domain is the one that might break
   the abstraction: non-uniform row heights and date-grouping headers. Also
   unanswered: whether they would consume this as a package or vendor it.

## Validation

Nothing built yet — this is the pre-build negotiation record.

Survey commands, re-runnable:

```sh
npm view ink-scroll-view version time.modified license peerDependencies
curl -s https://api.npmjs.org/downloads/point/last-week/ink-scroll-view
npm view ink-miller-columns version   # → E404
```

When built, each primitive lands with a property test, and the two laws above
become tests rather than prose: exact-width post-condition on `fitToWidth`, and
a `lineWindow` case with heterogeneous heights asserting no clipped bottom row.

## Recovery

Nothing is half-applied — no code has been written and no consumer has adopted
anything. Abandoning costs only this file.

If resumed after a compaction: the consumer answers are the requirements doc and
they are NOT reproduced in full here. EQStack's is anchored at their `main`
`033e4d5` with exact file:line for every claim (`apps/imsg-mcp/src/tui/App.tsx`
:102-110 width, :625 the single `useInput`, :650-943 the modal guards;
`ThreadPane.tsx` :69-128 window memo, :376-399 the height estimator;
`types.ts` :52-91 state, :266-357 eviction). browser-tab's is at their
`dd491f3`, `src/tui/rows.ts` whole file plus `App.tsx` :46-51 / :52-60 /
:62-88 / :93-120. Both offered to paste whole files on request.
