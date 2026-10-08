/**
 * Tool registry — types and helpers for declaring MCP tools.
 *
 * Convention: each tool ships its own file with three exports:
 *   - the Zod input schema (for runtime validation)
 *   - the Zod output schema (for structuredContent shape)
 *   - the ToolDefinition (registration metadata)
 *
 * The registry collects ToolDefinitions and converts them to the SDK's
 * `Tool[]` shape via `toMcpTools()`. Both wire schemas are DERIVED from the one
 * Zod definition per tool by `toMcpSchema()`; there is no hand-written JSON
 * Schema path, so the wire contract cannot drift from the validator.
 */

import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { RequestInfo, Tool, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

/**
 * A single MCP content block a tool may emit.
 *
 * Deliberately the same two members as `@george43g/cli-kit`'s `ContentBlock`,
 * and deliberately WITHOUT a catch-all `{ type: string; ... }` member. A
 * catch-all overlaps `type: "text"`, so every narrowing site needs a cast — and
 * a future compile error is wanted here: it lands exactly at the render site
 * where a decision about the new block type has to be made.
 *
 * `resource` and `audio` blocks are not modelled because no caller emits them.
 * Add them when one does, not from a reading of the spec.
 */
export type ContentBlock =
  | { type: "text"; text: string }
  /** `data` is RAW base64 — no `data:` URI prefix, and not a path. */
  | { type: "image"; data: string; mimeType: string };

/**
 * Any Zod schema, inferring `any` — the default for an unparameterised
 * `ToolDefinition`, so a handler written against it is not forced to narrow
 * `unknown`. This is what `ZodTypeAny` meant under Zod 3; Zod 4's `ZodTypeAny`
 * (a deprecated compat alias) infers `unknown`, which would have made every
 * bare `ToolDefinition` handler a type error on upgrade.
 */
export type AnyZodSchema = z.ZodType<any, any>;

export interface ToolDefinition<
  TInput extends z.ZodType = AnyZodSchema,
  TOutput extends z.ZodType = AnyZodSchema,
> {
  /** Snake_case tool name, e.g. "health_check". */
  name: string;
  /** One-paragraph description shown to the LLM. */
  description: string;
  /** Zod schema for tool arguments. */
  input: TInput;
  /** Zod schema for tool result (structuredContent). */
  output: TOutput;
  /** MCP annotations: read-only / destructive / idempotent / open-world hints. */
  annotations: ToolAnnotations;
  /**
   * Per-tool timeout in ms. Set to 0 to disable the wrapper for this tool.
   * Resolved against `MCP_TOOL_TIMEOUT_DEFAULT_MS` if omitted (default 30s).
   */
  timeoutMs?: number;
  /** When true, only register the tool if `MCP_DEV=1`. Used for `get_logs`. */
  devOnly?: boolean;
  /** Handler: receives parsed input + AbortSignal, returns structured output. */
  handler: (input: z.infer<TInput>, signal?: AbortSignal) => Promise<z.infer<TOutput>>;
  /**
   * Optional: derive extra content blocks (typically an image) from the result.
   * The dispatcher emits them AHEAD of the default JSON text block, so a
   * screenshot tool returns `[image, text]`.
   *
   * Runs synchronously at dispatch time and may read a file the handler just
   * wrote. It must not throw on the happy path; a throw is caught, logged as
   * `to_content_failed`, and degrades to the text block alone — a tool that
   * cannot render its picture still returns its answer.
   *
   * From browser-tab-mcp, which carried this in a vendored copy of this file.
   */
  toContent?: (result: z.infer<TOutput>) => ContentBlock[];
}

// AnyToolDefinition widens both Zod generic params so the registry can hold
// tools with narrow input/output schemas under a single uniform array type.
// Tool authors keep their narrow types at the declaration site; this is the
// boundary alias used internally.
export type AnyToolDefinition = ToolDefinition<any, any>;

/**
 * What a tool filter is told about the request it is answering.
 *
 * A structural subset of the SDK's `RequestHandlerExtra` — the second argument
 * every `server.setRequestHandler` callback receives — so a handler can pass
 * its `extra` straight through: `registry.toMcpTools(dev, extra)` and
 * `dispatch(name, args, extra.signal, extra)`.
 *
 * Every field is optional because most calls carry none of them: stdio has no
 * auth, and an in-process caller (a CLI, a REPL, a test) has no request at all.
 * A filter that gates on scopes therefore sees `authInfo === undefined` there,
 * and should decide deliberately what that means for its tools.
 */
export interface ToolFilterContext {
  /** Validated access token, when the transport authenticated the request (HTTP + OAuth). */
  authInfo?: AuthInfo;
  /** Transport session id, when the transport has sessions. */
  sessionId?: string;
  /** The originating HTTP request's headers, when there was one. */
  requestInfo?: RequestInfo;
}

/**
 * Per-request tool gate: return `false` to hide a tool from `tools/list` AND
 * refuse calls to it.
 *
 * Synchronous on purpose: it runs inside `toMcpTools()`, which is synchronous,
 * and a scope check is a set lookup. Resolve anything slow (a token
 * introspection) before the request reaches the registry — the HTTP transport's
 * auth layer is where that belongs.
 *
 * A filter that THROWS is treated as `false` (fail closed): a bug in the gate
 * must not expose the tool it was written to protect.
 */
export type ToolFilter<TDef extends AnyToolDefinition = AnyToolDefinition> = (
  tool: TDef,
  ctx: ToolFilterContext,
) => boolean;

/**
 * `TDef` lets a consumer carry its own per-tool metadata into the filter
 * without a cast: declare `interface ScopedTool extends ToolDefinition { scopes:
 * string[] }`, pass `ScopedTool[]`, and the filter receives `ScopedTool`.
 *
 * The filter is called on EVERY `toMcpTools()` / dispatch — never cached — so a
 * predicate that reads live state (scopes granted by a re-auth a minute ago)
 * sees the current value. Read that state inside the predicate.
 */
export interface MakeRegistryOptions<TDef extends AnyToolDefinition = AnyToolDefinition> {
  /**
   * Optional per-request gate, applied by BOTH `toMcpTools()` and the
   * dispatcher. It lives on the registry rather than on either consumer so the
   * listing and the call path cannot disagree: a filter that only hid a tool
   * from `tools/list` would leave it callable by name (see `devOnly`).
   */
  filter?: ToolFilter<TDef>;
}

export interface ToolRegistry {
  readonly tools: readonly AnyToolDefinition[];
  get(name: string): AnyToolDefinition | undefined;
  /**
   * Whether `def` passes the registry's filter for this request. Always `true`
   * when no filter was configured; `false` when the filter throws.
   */
  allows(def: AnyToolDefinition, ctx?: ToolFilterContext): boolean;
  /**
   * Convert tools to MCP SDK shape: devOnly tools only when `includeDevOnly`,
   * and only tools the filter allows for `ctx`. Schemas are converted once, at
   * `makeRegistry()`, so a call here never throws for a schema problem.
   */
  toMcpTools(includeDevOnly?: boolean, ctx?: ToolFilterContext): Tool[];
}

/** Which side of a Zod schema to describe: what a caller sends, or what parsing yields. */
export type McpSchemaIo = "input" | "output";

/** A JSON Schema object as emitted by `toMcpSchema`: always `type: "object"` at the top. */
export type McpJsonSchema = { type: "object"; [key: string]: unknown };

/**
 * Convert a Zod schema to the JSON Schema an MCP client accepts as a tool's
 * `inputSchema` / `outputSchema`.
 *
 * - **Dialect: JSON Schema 2020-12**, the MCP default. Draft-07 output (what
 *   `zod-to-json-schema` emitted, and what mcp-kit 2.x shipped) is rejected
 *   outright by clients that only load the 2020-12 meta-schema — Claude Code
 *   2.1.292 throws on `"$schema": "http://json-schema.org/draft-07/schema#"`.
 * - **`$schema` is stripped.** 2020-12 is the dialect a schema without a label
 *   is read as under MCP, and a schema with no label gives no client a dialect
 *   to refuse.
 * - **`io` matters.** `"input"` describes what a caller may send (a field with
 *   a `.default()` is optional); `"output"` describes what parsing yields (the
 *   same field is required, and objects are closed with
 *   `additionalProperties: false`).
 * - **Shared sub-schemas are inlined** (`reused: "inline"`). **Cycles are not
 *   inlinable**, so a recursive schema still carries `$defs` / `$ref` (or a
 *   root `$ref: "#"`). That is valid 2020-12 and kept as is.
 * - **Unrepresentable types throw**: `z.date()`, `z.bigint()`, a transform on
 *   the output side, and so on. The error names the tool, so a registry with a
 *   bad schema fails at startup rather than at a client's first `tools/list`.
 * - **The top level must be an object.** MCP requires `type: "object"` for both
 *   schemas; anything else throws, naming the tool.
 */
export function toMcpSchema(schema: z.ZodType, io: McpSchemaIo, toolName?: string): McpJsonSchema {
  const where = toolName === undefined ? `${io} schema` : `tool "${toolName}" ${io} schema`;
  let json: Record<string, unknown>;
  try {
    json = z.toJSONSchema(schema, { target: "draft-2020-12", io, reused: "inline" }) as Record<
      string,
      unknown
    >;
  } catch (err) {
    throw new Error(
      `toMcpSchema: ${where} cannot be represented in JSON Schema: ${(err as Error)?.message ?? String(err)}. ` +
        "Use a JSON-representable type (an ISO string instead of z.date(), a number or string instead of z.bigint()), " +
        "or move the transform out of the schema.",
      { cause: err },
    );
  }
  delete json.$schema;
  if (json.type !== "object") {
    throw new Error(
      `toMcpSchema: ${where} must be a Zod object (JSON Schema type "object"), got ${JSON.stringify(json.type ?? null)}. ` +
        "MCP requires tool input and output schemas to describe an object; wrap the value, e.g. z.object({ result: ... }).",
    );
  }
  return json as McpJsonSchema;
}

export function makeRegistry<TDef extends AnyToolDefinition = AnyToolDefinition>(
  defs: TDef[],
  opts: MakeRegistryOptions<TDef> = {},
): ToolRegistry {
  const byName = new Map(defs.map((d) => [d.name, d]));
  // Converted eagerly: a schema that cannot be represented throws HERE, at
  // startup, naming the tool, instead of on a client's first tools/list.
  // Keyed by definition, not name, so two definitions sharing a name (a
  // mistake, but representable) cannot swap schemas.
  const wire = new Map(
    defs.map((d) => [
      d,
      {
        name: d.name,
        description: d.description,
        annotations: d.annotations,
        inputSchema: toMcpSchema(d.input, "input", d.name),
        outputSchema: toMcpSchema(d.output, "output", d.name),
      } as unknown as Tool,
    ]),
  );
  const { filter } = opts;
  const allows = (def: AnyToolDefinition, ctx: ToolFilterContext = {}): boolean => {
    if (!filter) return true;
    try {
      // Only definitions from `defs` reach here in practice; the dispatcher
      // looks them up through `get()`.
      return filter(def as TDef, ctx) === true;
    } catch {
      return false;
    }
  };
  return {
    tools: defs,
    get(name) {
      return byName.get(name);
    },
    allows,
    toMcpTools(includeDevOnly = false, ctx: ToolFilterContext = {}): Tool[] {
      return defs
        .filter((d) => (includeDevOnly || !d.devOnly) && allows(d, ctx))
        .map((d) => wire.get(d) as Tool);
    },
  };
}
