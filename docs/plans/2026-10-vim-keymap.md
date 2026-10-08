# Shared vim-style keymap: `@george43g/keymap`

## Status

`active`. All the kit-side work is done; what remains is consumer migration in the consumers' own repos.

- 2026-10-07: PR 1 (#136) merged as `0d95464`.
- 2026-10-08: George bootstrap-published 0.1.0, tagged `keymap-v0.1.0` and set up the Trusted Publisher. #137 added the `release-packages.yml` job.
- 2026-10-08: wm-stack vendored the IIFE (wm-stack `28d44cf`). Both hashes matched and all 23 test vectors pass; ask cards use `vimScrollOnly` with `counts: false`.
- 2026-10-08: PR 2 (#138, `4e9a4aa`) published tui-kit 0.6.0, whose `useVimKeys` runs on keymap. It adds `createVimKeyRouter` and `vimKeyHints`. The consumer notice went out on `ag-all`.
- 2026-10-08: PR 3 (#139, `1dc3e1d`): the template TUI routes every key through one input router, which fixes ctrl-d also toggling dev stats. It adds ctrl-e/y, the `keys` command and `--keys` flag, and `dist/keys.json`, written by `build:ts`.
- Consumer acknowledgements of 0.6.0: browser-tab-mcp and tmux-control-mcp (browser-tab-mcp #215). Waiting on recall, life-stack (mcpsync and the console), up-bank-mcp and EQStack.
- Open request: browser-tab-mcp did not adopt `vimKeyHints`, because its help bar drops hints by priority. An optional `priority` field was proposed, to be built only if they will use it.

- 2026-10-07: request relayed by executive on `ag-in-mcp-starter-template` (bus id zvicMpv48Car), quoting George's words from a dotfiles `wm ask` card, which executive could not verify: *"keyboard shortcuts that are vim-like are always welcome - being able to scroll/navigate the question text using ctrl-d/u, G/gg ctrl-e/y… because these specific vim language shortcuts are now used in so many of my tools, i dont want them manually implemented each time. This is a shared code library that belongs in the starter-template repo"*. Two read-only surveys ran: one of existing libraries and one of how each consumer handles keys today. This design follows from them.

## Goal

Every tool George uses gets the same vim navigation, from one shared definition: ctrl-d/u for half a page, G and gg for bottom and top, ctrl-e/y to scroll one line, and j/k. Each tool declares which keys it binds, and life-stack's cheatsheet work can read those declarations. The design is accepted when George has picked one option for each of Q1 to Q5.

## Discoveries

Measured 2026-10-07 at mcp-cli-starter-template `4231a5d`, wm-stack `cdf53fd`, life-stack `e8ac09c` and EQStack `4fd468b`.

- **Half of this already exists.**
  - `@george43g/tui-kit` 0.5.2 ships `useVimKeys` (`packages/tui-kit/src/hooks/useVimKeys.ts`). It handles j/k, count prefixes, gg (a 500 ms timer at `:105`), G and ctrl-d/u (`:129`, `:133`).
  - The same package ships the pure `navReduce` (`src/nav-reduce.ts:80`) and paste-safe `splitNavChunk`.
  - Six Ink apps use them: example-repo-mcp, recall, mcpsync, tmux-control-mcp, browser-tab-mcp and up-bank.
- **What is missing:**
  - ctrl-e/y is implemented nowhere in the fleet.
  - A tool cannot declare its own bindings; the keys are hard-coded.
  - There is no legend. The nearest thing is `HelpBar`'s `{key,label}`, which only renders.
- **Seven tools still implement vim keys by hand:**
  - EQStack imsg-mcp and gmail-mcp;
  - up-bank's overlay pickers;
  - three wm-stack views: taskwarrior, the keybindings view, and the windows view (whose code is duplicated);
  - the life-stack console.

  They disagree on semantics: wm-stack's taskwarrior view treats a single `g` as top (`modules/taskwarrior/view.js:587`), while tui-kit requires gg.
- **EQStack deliberately avoids `useVimKeys`.** Each of its apps has exactly one `useInput` router. Its incident: with two dispatchers, a `q` typed into a text field quit the app (`HANDOFF.md:119`, `DEFERRED.md:808`, `nav-reduce.ts:8-12`). Any shared piece has to be callable from inside the consumer's own router, not be a hook that takes over input.
- **The webviews cannot import an npm package.**
  - The `wm ask` card is a static IIFE compiled into the daemon with `include_str!` (`wm-render/src/lib.rs:44-46`), and wm-stack's Vite build has no inputs (`web/vite.config.ts:23`).
  - The console (life-stack `packages/context-panel`) is plain `<script>` tags with no bundler.
- **The ask card's keys:**
  - The JS does receive keydown: wm-stack sets `allowTextEntry(true)` at `modal.lua:231`, and no Hammerspoon hotkey intercepts first.
  - It assigns option keys automatically from the labels (`wm-cli/src/ask.rs:81-126`), so j, k and g are already option keys ("Keep" gets `k`).
  - It lowercases every key, so G becomes `g` (`view.js:341`).
  - The long question text scrolls only with the mouse (`view.css:162-164`).
- **The console's action registry ignores modifiers.** It skips any ctrl, meta or alt key and matches case-insensitively (`actions.js:81-90`), so today it cannot express ctrl-d or gg, or tell G from g.
- **The cheatsheet plan reads live output, not files.**
  - Plan: life-stack `feat/cheatsheets-design`, `docs/exec-plans/active/2026-10-07-interactive-cheatsheets.md`.
  - Collectors print `source  key  description  owner  file:line` rows (`:144-145`).
  - D2 says: *"No manifest, no registry, no YAML list"*. D3 says: *"Read live state, never config text."*
  - The plan currently covers zsh, tmux and nvim, and neither Ink TUIs nor wm-stack.

## Choices for George

Each question gives a recommendation and what the alternative would cost.

**Q1: where the shared code lives.**

- **A (recommended): extend `@george43g/tui-kit`.** Add:
  - a declared keymap table, `{keys: "g g", intent, desc, group}[]`;
  - a pure matcher, `keyReduce(input, key) → intent | pending | none`, that EQStack can call from its single router;
  - ctrl-e/y intents.

  `useVimKeys` becomes a thin hook over the matcher, so its six current users change nothing. The table also feeds `HelpBar` and the legend. One package and one source of truth.
- **B: a new `@george43g/keymap` package** with a pure core, an Ink adapter, a DOM adapter and an IIFE build. The cost is a second source of truth beside `useVimKeys`/`HelpBar`, and one more package to publish and version.
- **C: share only the notation and legend schema,** and let every tool keep its own matcher. This is the cheapest, but the seven hand-rolled copies stay and keep drifting, which is the complaint that started this.

**Q2: how the webviews (`wm ask` card, console) get it.**

- **A (recommended): a written key spec plus a JSON file of test vectors** (key presses → expected intent) that wm-stack and the console test their own handlers against. Neither repo gains a build step.
- **B: an IIFE build of the core,** vendored into wm-stack and context-panel, with a drift check. This gives true single-sourcing, but adds a copy step and a drift gate in two peer repos that their owners would have to accept.
- **C: Ink only for now,** with the webviews out of scope.

**Q3: how the cheatsheet reads the legend.**

- **A (recommended): a `--keys` flag** on each tool that prints the plan's five tab-separated columns from the live table. This matches D2 and D3.
- **B: a JSON legend file written at build time.** This contradicts D2, so life-stack would have to accept a manifest.
- **C: both.**

**Q4: the `wm ask` card's key clash.** Its option keys are letters, and j, k and g are among them.

- **A (recommended): bind only ctrl-d/u/e/y on cards** to scroll the question text; letters stay option keys.
- **B: reserve j, k and g** from automatic option-key assignment. This changes `wm-cli/src/ask.rs`, and existing cards' keys move.

**Q5: does a single `g` mean top?**

- **A (recommended): no. `gg` means top, as in vim,** and wm-stack's taskwarrior view conforms when it adopts the shared definition.
- **B: a single `g`.** This conflicts with vim muscle memory and with tui-kit's current behaviour.

## Decisions

### Settled (with evidence)

No third-party library is adopted. The record, from npm data for 2026-09-28 to 10-04:

- **tinykeys** (4.0.1, 372k a week, MIT): DOM only, with no counts and no Ink path.
- **@tanstack/hotkeys** (0.11.0): alpha, and its targets are DOM-shaped.
- **@opentui/keymap** (0.5.14): the closest concept, but it pulls in `@opentui/core`, which is 13.7 MB, native, and requires Node ≥26.4.
- **hotkeys-js, react-hotkeys-hook and @github/hotkey:** DOM or React DOM only, with no counts.
- **mousetrap and keymaster:** abandoned (last published 2020 and 2014).

No which-key-style legend generator was found on npm. Ink's `useInput` passes logical key values, not physical codes, so the shared notation uses logical keys: `ctrl+d`, `G`, and space-separated steps such as `g g`. That is the subset both the DOM and Ink can parse.

### George's answers (2026-10-07)

Recorded verbatim in executive's brief: `~/repos/executive/docs/brief/2026-10-04-needs-george-answers.md:58-62` (executive `eec0c4c`, fourth round). Relayed on `ag-in-mcp-starter-template` (bQumMenXvNpS).

- **Q1: a NEW package, plus the migration.** *"new keymap package and do the migration - maybe tuikit imports and uses this package or maybe the two are just separated... some tools might end up with conflicting keybindings so just be weary to allow changing default ones, but sticking to default encouraged to promote a consistent appearance. The package should also have ways of helping or assisting the consumer to render/display/generate a key map, cheat sheet or help text or hints showing the user which keys to press to do what."*
- **Q2: "Bundle console, vendor modals (Recommended)".**
  - life-stack's console gets an esbuild bundle and imports the npm entry.
  - wm-stack vendors a single-file IIFE build and checks it against a hash for drift.
  - So the package ships both outputs.
- **Q3: "Both".** A `--keys` flag and a legend file written at build time.
- **Q4: "Only ctrl-d/u/e/y on cards (Recommended)".**
- **Q5: gg is top.** George confirmed it on 2026-10-08 ("keymap-q5-gg: sure").

### Sequence

Two-PR rule (AGENTS.md):

1. **PR 1:** the `@george43g/keymap` package alone.
2. **Bootstrap publish.** This is George's: a manual `pnpm --filter @george43g/keymap publish` under his npm login, then a Trusted Publisher entry on npmjs.com (`docs/RELEASE.md` § Adding a package).
3. **Release wiring:** a `release-packages.yml` job.
4. **PR 2:** tui-kit's `useVimKeys` rebuilt on the package, with ctrl-e/y, and the template app adopting it.
5. **Peer repos migrate,** each consumer in its own repo, from a work order sent on the bus.

### Rejected

- **A hook that owns `useInput`** as the only API: it breaks EQStack's one-router rule.
- **Physical key codes** (`KeyD`) and `$mod` in the notation: Ink cannot express them.

## Validation

None yet; this is a design. After the choices are made, acceptance means:

- `useVimKeys`' existing tests pass unchanged;
- the matcher's test vectors pass in tui-kit;
- `--keys` output is accepted by a life-stack collector fixture.

## Recovery

Nothing has been built. Resume by reading the answers to Q1 to Q5. If Q1 is A, the kit API ships as its own publish before any consumer adopts it (AGENTS.md: a new kit API and its call site are two PRs, publish first).
