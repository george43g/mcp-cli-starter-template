# @george43g/mcp-kit

MCP server building blocks: a tool registry, a dispatcher with timeout / perf /
abort / error-wrapping baked in, stdio + Streamable HTTP transports, `sanitize()`
for untrusted content, and UUID-gated prompt-injection helpers.

Peers: `zod` ^4 and `@george43g/robustness`. Upgrading from 2.x? See
[Migrating from 2.x](#migrating-from-2x-to-300) — the wire schemas changed dialect.

## Schemas: one Zod definition, JSON Schema 2020-12 on the wire

Each tool declares a Zod `input` and `output`. `makeRegistry()` derives both
wire schemas from them with `toMcpSchema()`; there is no hand-written JSON
Schema path, so the schema a client sees cannot drift from the validator the
dispatcher runs.

```ts
import { toMcpSchema } from "@george43g/mcp-kit";

toMcpSchema(NoopInputSchema, "input", "noop");
// → { type: "object", properties: { … }, required: [ … ] }   (no "$schema")
```

- **Dialect 2020-12, `$schema` stripped.** 2020-12 is MCP's default dialect,
  and a schema with no label gives no client a dialect to refuse. mcp-kit 2.x
  emitted draft-07 via `zod-to-json-schema`, and Claude Code 2.1.292 throws on
  `"$schema": "http://json-schema.org/draft-07/schema#"` — every 2.x tool broke.
- **`io` is real.** `inputSchema` describes what a caller may send (a
  `.default()` field is optional); `outputSchema` describes what parsing yields
  (that field is required, and objects carry `additionalProperties: false`).
- **Unrepresentable types throw at `makeRegistry()`**, naming the tool:
  `z.date()`, `z.bigint()`, an output-side `.transform()`. Use an ISO string, a
  number, or move the transform out of the schema.
- **The top level must be a `z.object`.** MCP requires `type: "object"`.
- **Recursive schemas keep `$defs` / `$ref`** (or a root `$ref: "#"`): a cycle
  cannot be inlined. That is valid 2020-12, and the conformance helper below
  compiles it.

## Per-request tool filter (scope gating)

```ts
const registry = makeRegistry(tools, {
  filter: (tool, ctx) =>
    !tool.name.startsWith("gmail_send") || (ctx.authInfo?.scopes.includes("gmail.send") ?? false),
});

server.setRequestHandler(ListToolsRequestSchema, async (_req, extra) => ({
  tools: registry.toMcpTools(includeDevOnly, extra),
}));
server.setRequestHandler(CallToolRequestSchema, async (req, extra) =>
  dispatch(req.params.name, req.params.arguments ?? {}, extra.signal, extra),
);
```

- The filter lives on the **registry**, so the listing and the dispatcher apply
  the same predicate. A refused call answers **exactly like an unknown tool**.
  Hiding a tool from `tools/list` while it still answers by name is the hole
  `devOnly` fell into once.
- `ctx` is `{ authInfo?, sessionId?, requestInfo? }` — a subset of the SDK's
  `RequestHandlerExtra`, so pass `extra` straight through. In-process calls (a
  CLI, a test) pass nothing and the filter sees `{}`; decide what no `authInfo`
  means for your tools.
- Synchronous, evaluated per request. **A throwing filter counts as `false`**.

## Testing: `@george43g/mcp-kit/testing`

```ts
import { assertMcpConformance, validateStructured } from "@george43g/mcp-kit/testing";

it("every tool is accepted by a 2020-12 client", () => {
  assertMcpConformance(makeAppRegistry(), {
    samples: { noop: { input: [{ input: "x" }], output: [{ echo: "x", engine: "ts", durationMicros: 1 }] } },
  });
});

it("noop's structuredContent matches its outputSchema", async () => {
  const result = await callMcpTool("noop", { input: "x" });
  expect(validateStructured(noopTool, result).errors).toEqual([]);
});
```

- `assertMcpConformance(registry | definitions | Tool[])` compiles every input
  and output schema under **Ajv2020 in strict mode** with no draft-07
  meta-schema loaded — so a draft-07 label fails here exactly as it failed in
  Claude Code. It collects every problem and throws one `McpConformanceError`.
  A registry is checked in full: devOnly and filtered tools too.
- `validateStructured(tool, result)` is the SDK client's own `tools/call` check:
  structured content required unless `isError`, and validated against
  `outputSchema` when present. It returns `{ valid, errors }`.
- `ajv` / `ajv-formats` are dependencies of this package, imported only by this
  entry. `@modelcontextprotocol/sdk` already depends on both, so they add nothing
  to an install, and a server that never imports `/testing` never loads them.
- `allowUnionTypes` is on: `type: ["string", "number"]` is valid 2020-12 (Zod
  emits it for `z.union([z.string(), z.number()])`); Ajv's strict mode flags it
  only as style.

## The dispatcher is the point

Every tool call goes through one function, and that function holds invariants
that are easy to lose when each tool wires itself:

1. Every handler runs inside `withTimeout` — per-tool `timeoutMs`, else
   `MCP_TOOL_TIMEOUT_DEFAULT_MS` (30s).
2. `noteActivity()` fires on every dispatch, feeding the idle watchdog.
3. A `perf()` span wraps every handler; its duration lands in `_meta`.
4. Errors are wrapped with the tool name and an actionable hint — never a bare
   `error.message`.
5. `AbortSignal` is passed through.
6. Nothing writes to stdout after `StdioServerTransport.connect()` — JSON-RPC
   owns it. Log through `@george43g/robustness`.

```ts
import { buildDispatcher, makeRegistry } from "@george43g/mcp-kit";

const registry = makeRegistry([healthCheck, noop]);
const dispatch = buildDispatcher({ registry, engineLabel: () => "ts" });
```

## Content blocks

A tool may emit media alongside its JSON summary. `toContent` derives the extra
blocks from the result, and the dispatcher emits them **ahead** of the text
block:

```ts
const screenshot: ToolDefinition = {
  // ...
  handler: async () => ({ path: "/tmp/shot.png" }),
  toContent: (r) => [{ type: "image", data: readBase64(r.path), mimeType: "image/png" }],
};

// dispatch("screenshot", {}) → content: [image, text]
```

Three things worth knowing before you use it:

- **`[media, text]` is a contract, not an implementation detail.** `cli-kit`'s
  renderer prints the image line above the payload, and consumers index on the
  order.
- **`data` is RAW base64** — no `data:` URI prefix, and not a path.
- **A throwing `toContent` degrades to text.** The throw is caught, logged as
  `to_content_failed`, and the tool still returns its answer. A tool that cannot
  render its picture is not a tool that failed.

`ContentBlock` is deliberately the same two members as `@george43g/cli-kit`'s,
and deliberately has **no catch-all member**. A catch-all overlaps
`type: "text"`, so every narrowing site needs a cast — and a compile error is
*wanted* when a new block type appears: it lands exactly at the render site
where somebody has to decide how to draw it. Reading a block's text narrows:

```ts
for (const block of result.content) {
  if (block.type === "text") process.stdout.write(block.text);
}
```

## Dev-only tools: hiding is not disabling

`devOnly: true` was honoured only by `toMcpTools()`. The tool vanished from
`tools/list` and **still executed if you named it**, and every non-MCP caller —
a CLI, a REPL's tool list — bypassed the filter entirely.

```ts
const dispatch = buildDispatcher({
  registry,
  devOnlyEnabled: () => process.env.MCP_DEV === "1",
});
```

- Read **per dispatch**, not at construction, so flipping the env mid-suite
  takes effect.
- A gated tool's response is **identical to an unknown tool name**. A distinct
  "this tool is disabled" error confirms the tool exists, which is what the gate
  is for.
- **Omit it with a `devOnly` tool registered and `buildDispatcher` THROWS**, at
  construction, naming the offending tools. See *Upgrading to 1.0.0* below.
- A registry with **no** `devOnly` tools never needs it and is unaffected.

## Transports

```ts
import { startStdio } from "@george43g/mcp-kit/stdio";
import { startHttpServer } from "@george43g/mcp-kit/http";
```

HTTP is single-tenant by design: one server process, one identity. The bearer
token is caller-supplied or read from `MCP_HTTP_TOKEN`.

## Untrusted content

`sanitize()` strips control characters and bounds length (default 4096 — sized
for a snippet). `wrapToolError()` and the UUID-gated helpers in
`prompt-injection.ts` fence tool output so a tool's own error text cannot
impersonate the host.

For **large payloads** — page text, a file, a transcript — use
`sanitizeContent()` instead:

```ts
import { sanitizeContent, CONTENT_BUDGET } from "@george43g/mcp-kit";

sanitizeContent(pageText);                 // 1 MiB budget
sanitizeContent(pageText, 64_000);         // or your own
```

Three differences from `sanitize()`, each deliberate:

| | `sanitize` | `sanitizeContent` |
|---|---|---|
| null/undefined in | returns `null` | returns `""` — no guard at every call site |
| default budget | 4096 | `CONTENT_BUDGET` = 1 MiB |
| truncation marker | `…` | `…[truncated]` |

The marker matters more than it looks: a **silently** shortened document is
indistinguishable from a document that really ended there, and a model reading it
will answer confidently from the fragment it received.

## Migrating from 2.x to 3.0.0

**Why:** 2.x emitted draft-07 JSON Schema, and Claude Code 2.1.292+ (a
2020-12-only client) throws on it, so every tool from every 2.x server failed in
new sessions. 3.0.0 moves to Zod 4's native converter and 2020-12.

Breaking changes, each with its migration:

1. **`zod` is a peer, `^4`** (was a dependency, `^3.23`). Install `zod@^4` in
   your app and drop `zod-to-json-schema`. Zod 4's `zod` root keeps `z.object`,
   `.describe()`, `.default()`, `z.enum`, `z.infer`; see Zod's own v4 migration
   guide for `.errors` → `.issues`, `z.string().email()` → `z.email()` (the old
   form still works), and error-map changes.
2. **Wire schemas are JSON Schema 2020-12 with no `$schema`** (were draft-07,
   labelled). Clients that pinned draft-07 behaviour see 2020-12 keywords:
   `prefixItems` for tuples, `$defs` for recursion. Nothing to do unless you
   post-process `inputSchema` — and if you stripped `$schema` yourself as a
   hot-fix, delete that code.
3. **Input objects are open; output objects stay closed.** `inputSchema` is
   the input side of the schema (`io: "input"`) and no longer carries
   `additionalProperties: false`, so a client may send extra keys — the
   dispatcher's Zod parse strips them, as before. `.default()` fields stay
   optional on input (unchanged) and required on output. `outputSchema` keeps
   `additionalProperties: false`, as in 2.x.
4. **`makeRegistry()` throws at construction for an unrepresentable schema**,
   naming the tool: `z.date()`, `z.bigint()`, `z.map()`, `z.set()`,
   `z.symbol()`, `z.undefined()`, an output-side `.transform()`. 2.x emitted a
   best-effort schema silently — `z.date()` became `{type: "string", format:
   "date-time"}`, `z.map()` an array of pairs. **The common case is a `z.date()`
   output field:** return `date.toISOString()` and declare
   `z.string().datetime()` (or `z.iso.datetime()`).
5. **`makeRegistry()` throws when a tool's input or output is not a
   `z.object`** (MCP requires `type: "object"`). Wrap the value:
   `z.object({ result: … })`.
6. **`ToolRegistry` has a new required member, `allows(def, ctx?)`**, and
   `toMcpTools()` takes an optional second argument. Only a hand-written
   `ToolRegistry` implementation breaks; build it with `makeRegistry()`.
7. **"Invalid arguments" text changes wording**: the per-field lines come from
   Zod 4's messages (`Invalid input: expected string, received number`, was
   `Expected string, received number`). Rendered output is not covered by
   semver; listed because a test that snapshots the text will notice.
8. **The SDK dependency floor is unchanged (`^1.29.0`)** — 1.29 already accepts
   `zod ^3.25 || ^4`. Listed so nobody hunts for it.

Additive, no action needed: `toMcpSchema()`, the registry `filter` option and
the `ctx` argument to `dispatch`, and the `@george43g/mcp-kit/testing` entry.

Add one test so this never regresses silently:

```ts
import { assertMcpConformance } from "@george43g/mcp-kit/testing";
it("tools conform", () => void assertMcpConformance(makeAppRegistry()));
```

## Upgrading to 1.0.0

**One breaking change, and it affects you only if you register `devOnly` tools.**

`buildDispatcher` now throws at construction when the registry contains a
`devOnly` tool and no `devOnlyEnabled` predicate was passed:

```
buildDispatcher: 1 devOnly tool(s) registered with no devOnlyEnabled predicate: get_logs.
  A devOnly tool with no predicate would be hidden from tools/list and still callable by name.
  Fix: pass devOnlyEnabled to buildDispatcher, e.g. `devOnlyEnabled: () => envBool("MCP_DEV", false)`.
  Or, if these tools are not meant to be gated at all, drop `devOnly` from their definitions.
```

**Migration is one line** — pass the predicate, as shown in *Dev-only tools*
above. If you have no `devOnly` tools, there is nothing to do.

### Upgrading to 2.0.0 — declare `@george43g/robustness` yourself

**`robustness` moved from `dependencies` to `peerDependencies`.** If your app
already depends on `@george43g/robustness` directly — as every known consumer
does, and as the generated template does — **there is nothing to do**. If it does
not, add it.

```jsonc
// your package.json
"dependencies": {
  "@george43g/robustness": ">=0.13.0 <1"   // or a caret; any 0.x satisfies the peer
}
```

**What this fixes, and it is not cosmetic.** As a plain dependency with a
*floor*, mcp-kit could resolve its **own second copy** of robustness whenever the
app's range and mcp-kit's stopped overlapping. The logger keeps prefix and file
state at module scope, so two copies means **two independent loggers**:
`setLogFilePrefix` in your app cannot reach the instance mcp-kit's `perf()` spans
write through, and dispatch spans silently land in the shared `$TMPDIR/mcp/`
bucket no matter how correctly your app brands itself.

That was live in **1.0.0**, whose floor was `>=0.12.0 <1`: an app on `^0.11.0`
that bumped mcp-kit alone got exactly this split. **2.0.0 removes the failure
mode by construction** — a peer is supplied by the consumer, so there is only
ever one instance. The peer range is deliberately wide (`>=0.11.0 <1`, every
symbol mcp-kit imports exists at 0.11.0), so no consumer is forced to move.

`tui-kit` has always declared robustness this way; mcp-kit was the outlier.

Verify with the one line that settles it:

```sh
grep -oE "@george43g/robustness@[0-9.]+" pnpm-lock.yaml | sort -u
```

One line is correct. Two means something still resolves its own copy.

**The generalisable lesson:** a plain dependency with a *wide* range behaves like
a peer — right up until the ranges stop overlapping. Two individually safe
changes (raising a floor, cutting a major) were jointly hazardous. Found by
`up-bank-mcp`.
Found by `up-bank-mcp` as range arithmetic over the published manifests.
**Not yet observed in a resolved tree by anyone** — treat the ordering as cheap
insurance rather than a reproduction.

**Why a throw and not a flipped default.** Before 1.0.0, omitting the predicate
left dev-only tools *callable* — hidden from `tools/list` and answering by name.
Two consumers hit that independently, and one measured a dev-only log reader
returning a real payload with the dev flag unset.

Defaulting to fail-closed would have fixed the symptom while leaving the real
question open: does `devOnly` mean *hidden from the listing* or *not callable*? A
default picks one silently, and the next reader inherits the same ambiguity.
Throwing makes the ambiguous state **unrepresentable** — you cannot register a
`devOnly` tool without saying when it is enabled — so `devOnly` genuinely is a
gate, and the name stops lying without a rename.

The failure is now loud, at startup, with a one-line fix, instead of silent and
at runtime.

**Also in 1.0.0, both additive:** `sanitizeContent()` / `CONTENT_BUDGET` (above),
and `dispatch_error` log records now have the home-directory prefix replaced with
`~` and are length-bounded. Stack frames always carry absolute paths, which
contain the username, and the redactor in `@george43g/robustness` has no
filesystem-path rule at any version — so an unmodified stack sent to a log
collector carried an identifier nothing downstream would strip. This removes that
one category; it does **not** make `err.message` safe. A throw that interpolates a
URL or an account number still logs it verbatim, and no kit-side guard can know
which of those your errors carry. Check your own throws.
