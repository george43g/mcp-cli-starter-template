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
  browser-tab resolved collapse-vs-drop the same day; EQStack returned a full
  signature review with amendments and an adoption pledge, and approved the
  build. Spec below is final. Awaiting only up-bank's reply.

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

## The agreed spec

Signature review by EQStack 2026-08-21: *"the shape is right, I'd adopt 4 of the
5 primitives on release as specified, and `navReduce` after the ctx amendments
... Signatures otherwise approved — build it."* Amendments below are theirs and
are binding; each one they justified from a shipped incident or a real call site.

```ts
// ── 1. lineWindow ──────────────────────────────────────────────────────
export interface LineWindowSpec {
  itemCount: number;
  cursor: number;                        // -1 = follow-tail sentinel
  budgetLines: number;
  heightOf: (index: number) => number;   // pure, caller-supplied
  anchor?: "cursor" | "end";             // TWO algorithms, not one ratio
  aboveFraction?: number;                // applies to "cursor" only; default 0.4
}
export interface LineWindow { start: number; end: number; usedLines: number }
export function lineWindow(spec: LineWindowSpec): LineWindow;
export function chooseAnchor(cursor: number, itemCount: number, nearEnd?: number): "cursor" | "end";

// ── 2. scrollbar ───────────────────────────────────────────────────────
export function scrollbarThumb(w: { start; end; total }, trackRows: number):
  { thumbStart: number; thumbRows: number };

// ── 3. navReduce ───────────────────────────────────────────────────────
export interface NavContext {
  itemCount: number;
  pageSize: number;                                        // caller's layout, not derivable
  groupBoundary?: (from: number, dir: -1 | 1) => number;    // domain knowledge
}
export type NavIntent =
  | { kind: "up" | "down" | "pageUp" | "pageDown" | "top" | "bottom" }
  | { kind: "digit"; digit: number }
  | { kind: "groupJump"; dir: -1 | 1 }
  | { kind: "set"; index: number }
  | { kind: "itemsReplaced"; remap: (old: number) => number };
export interface NavState { cursor: number; count: number | null; touched: boolean }
export function navReduce(s: NavState, i: NavIntent, ctx: NavContext): NavState;

// ── 4. allocateWidths ──────────────────────────────────────────────────
export interface ColumnSpec {
  id: string; min: number; preferred: number; max?: number;
  priority: number;                              // WHO yields first (lowest first)
  collapse?: "drop" | "breadcrumb" | "min";      // WHAT yielding means; default "drop"
  collapsedWidth?: number;                       // for "breadcrumb"; default 1
}
export function allocateWidths(total: number, cols: ColumnSpec[]):
  { widths: Record<string, number>; collapsed: string[] };

// ── 5. fitToWidth + splitNavChunk ──────────────────────────────────────
export function fitToWidth(s: string, cols: number, ellipsis?: string): string;
export function splitNavChunk(input: string, owned: ReadonlySet<string>): string[] | null;
```

### Invariants that are tests, not prose

| # | Invariant | Why it exists |
|---|---|---|
| 1 | `cursor === -1` ⇒ `itemsReplaced` is **identity** | EQStack shipped the bug this prevents once (eviction-cursor data loss, their #94). The sentinel must never be remapped. |
| 2 | `remap`'s return is **clamped to `[0, itemCount-1]` by navReduce** | A consumer whose remap points into a removed region degrades to nearest-survivor instead of crashing the window. Callers must not have to be defensive. |
| 3 | The cursor item is **always inside `[start, end)`**, even when `heightOf(cursor) > budgetLines` — `usedLines` may exceed budget in exactly that case | A window that returns empty for one tall item clips the only thing on screen. |
| 4 | `cursor === -1` ⇒ `anchor: "end"` | The sentinel and the anchor unify: follow-tail IS end-anchoring. |
| 5 | `splitNavChunk` non-null ⇒ `result.join("") === input` | Never invents or drops characters. |
| 6 | any char outside `owned` ⇒ **null** (all-or-nothing) | A partial fan-out is the paste-drives-motion bug reborn. |
| 7 | `visualWidth(fitToWidth(s, n)) === n` — exact, not `<=` | The ink wrap law. |
| 8 | `visualWidth(truncateToWidth(s, n)) <= n` | What makes truncate-then-pad safe: the pad's repeat count can never go negative. Currently untested. |

### Count semantics, spelled because EQStack will property-test them

Digit intents accumulate (`count*10 + digit`). Movement intents consume `count`
as a repeat factor (default 1) and **reset it**. Any other intent resets it.
`touched` is set by every cursor-moving intent and **not** by `itemsReplaced` —
`applyRestore("follow-until-touched")` reads it.

### Allocator rules

- Remainder goes to the **highest-priority column not at `max`**.
- Fractions are the caller's business; allocator is integer-in, integer-out,
  deterministic.
- Mode-gated columns: the caller **omits them from the spec** that frame. The
  allocator must not know about modes.

### `heightOf` memoisation — resolved

Plain function; `lineWindow` keeps a **per-invocation** `Map<number, number>`.
The walk hits some indices twice (up, down, backfill-up) and the array is
immutable within a call, so it is free and correct — and it deletes the
"do I need `useCallback`" question for every consumer. No hooks in the kit.
Cross-render memoisation stays the consumer's.

### Documented caveat, from a measured EQStack bug

`fitToWidth`'s post-condition guarantees consistency with `visualWidth`, **not
with every terminal's ambiguous-width table**. East Asian ambiguous characters
and some emoji still misalign where the terminal disagrees. Consumers should
find this in the docs rather than in a broken table border.

## Adoption pledge

EQStack, on release: `ThreadPane.tsx:69-128` + `computeSettingsWindow` →
`lineWindow`; `App.tsx:102-110` → `allocateWidths`; router chunk fan-out →
`splitNavChunk`; header/row truncation → `fitToWidth`; `navReduce` once ctx
carries `pageSize`/`groupBoundary`/`set`. Their existing tests for both
windowing sites come along as consumer-side pins.

browser-tab-mcp: *"ping me when the primitives land and I'll port
renderRow/viewport onto them as the first consumer, scrollbar included."*

## Open questions

1. ~~`allocateWidths` collapse semantics.~~ **RESOLVED 2026-08-21** — see
   Decisions. They were two behaviours and browser-tab supplied the rule that
   unifies them.
2. ~~`aboveFraction` vs a distinct mode.~~ **RESOLVED** — two algorithms.
   Near the tail EQStack anchors the LAST ITEM at the bottom edge while the
   cursor is up to 2 away, which `aboveFraction: 1.0` cannot express because
   that anchors the CURSOR. Hence `anchor: "cursor" | "end"` + `chooseAnchor`.
3. ~~`heightOf` memoisation.~~ **RESOLVED** — per-invocation map inside
   `lineWindow`. See the spec.
4. ~~`splitNavChunk`.~~ **RESOLVED — take it.** EQStack: *"The incident hazard
   was dispatch OWNERSHIP; this is a pure string function with the
   null-passthrough contract — exactly the leaf-utility class that has stuck
   5-for-5."*
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
