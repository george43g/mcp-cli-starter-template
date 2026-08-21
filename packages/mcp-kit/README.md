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
- **Omit it and nothing changes** — dev-only tools stay callable, which is what
  this dispatcher did before the option existed.

## Transports

```ts
import { startStdio } from "@george43g/mcp-kit/stdio";
import { startHttpServer } from "@george43g/mcp-kit/http";
```

HTTP is single-tenant by design: one server process, one identity. The bearer
token is caller-supplied or read from `MCP_HTTP_TOKEN`.

## Untrusted content

`sanitize()` strips control characters and bounds length. `wrapToolError()` and
the UUID-gated helpers in `prompt-injection.ts` fence tool output so a tool's
own error text cannot impersonate the host.
