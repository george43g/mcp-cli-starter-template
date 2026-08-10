# [@george43g/cli-kit-v2.0.1](https://github.com/george43g/mcp-cli-starter-template/compare/cli-kit-v2.0.0...cli-kit-v2.0.1) (2026-08-10)


### Bug Fixes

* **cli-kit:** parse CI env values and keep piped stdout parseable ([e5e5187](https://github.com/george43g/mcp-cli-starter-template/commit/e5e5187ef96afdf49325bb002e311af1a14ee8c3))

# [@george43g/cli-kit-v2.0.0](https://github.com/george43g/mcp-cli-starter-template/compare/cli-kit-v1.0.0...cli-kit-v2.0.0) (2026-08-09)


### Documentation

* correct cli-kit to 1.0.0 and record why the number differs ([#40](https://github.com/george43g/mcp-cli-starter-template/issues/40)) ([fad1687](https://github.com/george43g/mcp-cli-starter-template/commit/fad1687638cf605570e0448199597ad3ea4f2f93)), closes [#34](https://github.com/george43g/mcp-cli-starter-template/issues/34)


### BREAKING CHANGES

* must be a major. The README's Stability section said "this
package is pre-1.0" and is now simply wrong; rewritten as the stronger
promise the version actually makes.

Adds the AGENTS.md rule, because this is live for the other three: robustness,
tui-kit and secret-store all use the same stock analyzer and will each jump
straight to 1.0.0 on their first breaking commit.

# [@george43g/cli-kit-v1.0.0](https://github.com/george43g/mcp-cli-starter-template/compare/cli-kit-v0.3.1...cli-kit-v1.0.0) (2026-08-09)


* feat(cli-kit)!: model non-text content blocks and render them ([#38](https://github.com/george43g/mcp-cli-starter-template/issues/38)) ([c1a7171](https://github.com/george43g/mcp-cli-starter-template/commit/c1a7171ed794f57c3d090c1685aadc0df83d7feb))


### BREAKING CHANGES

* `ToolCallResult.content` is now `ContentBlock[]`, a closed
discriminated union, so reading `.text` off a block without narrowing no
longer typechecks.

  content?: Array<{ type: string; text: string }>   // before
  content?: ContentBlock[] | undefined              // after

The old shape could not describe any MCP server with an image tool: every
block was required to carry `text`. Two consumers reported it under-modelled
within a day, which is what moved it from a usage problem to a wrong type.

Shape (B) as browser-tab chose it — no catch-all member. A `{ type: string }`
fallback overlaps `type: "text"`, so narrowing would need a cast at every
render site, and it would silently accept blocks nothing can render. The
compile error is wanted, and it lands where a decision is needed.

The renderer ships WITH the type. That was their condition, and it is the
right one: a type without a renderer just relocates their 20-line adapter
into every consumer's compile-error fixup. Non-text blocks now render one
line each, in dispatcher order, sized in DECODED bytes:

  [image image/jpeg, 61.4 KB]
  {"saved": true}
  · 12ms · engine=ts

Order is a dispatcher contract, not a presentation choice — a dispatcher that
appends its text block last means a screenshot arrives as [image, text].
Sizes are decoded because "84210 base64 chars" is both a meaningless unit and
inflated 4/3 against what the reader sees on disk.

Corrects the brief on one point, found by reading this tree rather than
trusting the reference: it said to mirror "mcp-kit's own ContentBlock at
tool-registry.ts:16-24", but that describes browser-tab's evolved fork. Here
those lines are ToolDefinition, there is no ContentBlock, and our dispatcher
emits exactly one text block. So the union went into cli-kit — which is
dispatcher-agnostic by design — and mcp-kit was left alone. Its text-only
ToolResult stays assignable, so nothing in this repo needed migrating.

The type is closed but the RENDERER is not: a real server can send `resource`
or `audio`, and it prints a placeholder rather than taking the REPL down.
`resource` is not modelled because no known caller emits one, and guessing
its shape from the spec is how the text-only version got written.

Also non-breaking: optionals are declared `?: T | undefined` so
exactOptionalPropertyTypes consumers can pass results through verbatim.

Four of the new tests were observed failing against the old renderer, and a
type probe confirms TS2339 on unguarded `content[0].text`. Coverage floor
ratcheted 91/87/83/91 -> 91/88/85/91 by covering the new helpers to their
edges rather than letting them pull the branch floor down.

# [@george43g/cli-kit-v0.3.1](https://github.com/george43g/mcp-cli-starter-template/compare/cli-kit-v0.3.0...cli-kit-v0.3.1) (2026-08-09)


### Bug Fixes

* **cli-kit:** drain piped REPL input through a serial queue ([41ad58c](https://github.com/george43g/mcp-cli-starter-template/commit/41ad58c420859357b851ff7ac2d88ae5649e4693)), closes [#16a](https://github.com/george43g/mcp-cli-starter-template/issues/16a) [#24](https://github.com/george43g/mcp-cli-starter-template/issues/24)
* **exports:** add the "./package.json" subpath to every package ([30137bd](https://github.com/george43g/mcp-cli-starter-template/commit/30137bd3710dbb8837afc86b6504bc78e122e14e))

# [@george43g/cli-kit-v0.3.0](https://github.com/george43g/mcp-cli-starter-template/compare/cli-kit-v0.2.1...cli-kit-v0.3.0) (2026-08-09)


### Features

* **cli-kit:** let callers force human output with `human` / FORCE_HUMAN ([ba0d220](https://github.com/george43g/mcp-cli-starter-template/commit/ba0d220e207e84e11700dc21f82b262dfe9a437b)), closes [#21](https://github.com/george43g/mcp-cli-starter-template/issues/21)

# [@george43g/cli-kit-v0.2.1](https://github.com/george43g/mcp-cli-starter-template/compare/cli-kit-v0.2.0...cli-kit-v0.2.1) (2026-08-09)


### Bug Fixes

* **exports:** add a default condition so CJS consumers can require() the packages ([eb9632b](https://github.com/george43g/mcp-cli-starter-template/commit/eb9632be11b7a0c2a497814ce9caf58ba8bfa7c1))

# [@george43g/cli-kit-v0.2.0](https://github.com/george43g/mcp-cli-starter-template/compare/cli-kit-v0.1.0...cli-kit-v0.2.0) (2026-08-09)


### Bug Fixes

* **cli-kit:** make the REPL's raw and tool dispatch actually work ([1dcdcbf](https://github.com/george43g/mcp-cli-starter-template/commit/1dcdcbf942f3b05e778d592eb9a6e18abe166d36)), closes [#16a](https://github.com/george43g/mcp-cli-starter-template/issues/16a)


### Features

* **cli-kit:** make commander a peer dependency ([6fd87b6](https://github.com/george43g/mcp-cli-starter-template/commit/6fd87b6a94fe2290d6d97bcd276877c2872aa359))
* **vitest-config:** make the coverage gates actually run ([7b54070](https://github.com/george43g/mcp-cli-starter-template/commit/7b54070086699c2e8870fe67f97426f6ce41a271)), closes [#16a](https://github.com/george43g/mcp-cli-starter-template/issues/16a)
