# @george43g/mcp-kit

MCP server building blocks: a tool registry, a dispatcher with timeout / perf /
abort / error-wrapping baked in, stdio + Streamable HTTP transports, `sanitize()`
for untrusted content, and UUID-gated prompt-injection helpers.

Not yet on npm. It is vendored into generated repos today; see `DEFERRED.md` #25
in the template repo for the publish sequence.

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
