/**
 * Tool registry — types and helpers for declaring MCP tools.
 *
 * Convention: each tool ships its own file with three exports:
 *   - the Zod input schema (for runtime validation)
 *   - the Zod output schema (for structuredContent shape)
 *   - the ToolDefinition (registration metadata)
 *
 * The registry collects ToolDefinitions and converts them to the SDK's
 * `Tool[]` shape via `toMcpTools()`.
 */

import type { Tool, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { ZodTypeAny, z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

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

export interface ToolDefinition<
  TInput extends ZodTypeAny = ZodTypeAny,
  TOutput extends ZodTypeAny = ZodTypeAny,
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

export interface ToolRegistry {
  readonly tools: readonly AnyToolDefinition[];
  get(name: string): AnyToolDefinition | undefined;
  /** Convert all tools (or just enabled ones) to MCP SDK shape. */
  toMcpTools(includeDevOnly?: boolean): Tool[];
}

export function makeRegistry(defs: AnyToolDefinition[]): ToolRegistry {
  const byName = new Map(defs.map((d) => [d.name, d]));
  return {
    tools: defs,
    get(name) {
      return byName.get(name);
    },
    toMcpTools(includeDevOnly = false): Tool[] {
      return defs
        .filter((d) => includeDevOnly || !d.devOnly)
        .map(
          (d) =>
            // The SDK Tool type narrows inputSchema/outputSchema to a JSON-
            // schema with `type: "object"` literal; zodToJsonSchema returns
            // the broader JsonSchema7Type union. Cast is safe because we
            // only ever build Zod object schemas as tool I/O.
            ({
              name: d.name,
              description: d.description,
              annotations: d.annotations,
              inputSchema: zodToJsonSchema(d.input),
              outputSchema: zodToJsonSchema(d.output),
            }) as unknown as Tool,
        );
    },
  };
}
