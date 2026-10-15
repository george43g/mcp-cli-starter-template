/**
 * `@george43g/mcp-kit/testing` — MCP wire-conformance checks for a consumer's
 * test suite.
 *
 * Two questions, each one a client has actually failed on:
 *
 *  1. Does every tool's `inputSchema` / `outputSchema` compile in a client that
 *     only speaks JSON Schema 2020-12? (`assertMcpConformance`) Claude Code
 *     2.1.292 refused every mcp-kit 2.x tool because the schemas were labelled
 *     draft-07.
 *  2. Does a tool's `structuredContent` satisfy its own `outputSchema`?
 *     (`validateStructured`) The SDK client runs exactly this check on every
 *     `tools/call` and turns a mismatch into an error.
 *
 * A separate entry so Ajv is never loaded by a running server: nothing under
 * the main entry imports this file. `ajv` and `ajv-formats` are regular
 * dependencies of the package rather than optional peers because
 * `@modelcontextprotocol/sdk` already depends on both (^8.17.1 / ^3.0.1) — they
 * are in every consumer's install already, so declaring them adds no package,
 * and a consumer's vitest needs no extra devDependency to use this entry.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import {
  type AnyToolDefinition,
  type McpJsonSchema,
  type ToolRegistry,
  toMcpSchema,
} from "./tool-registry.js";

// ajv-formats is CommonJS with `module.exports = plugin` and `.default = plugin`;
// under NodeNext the default import is the module object, so take `.default`
// when it is there.
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ??
  addFormatsModule) as (ajv: Ajv2020) => Ajv2020;

const DIALECT_2020_12 = "https://json-schema.org/draft/2020-12/schema";

/** Anything `assertMcpConformance` can check: a registry, its definitions, or a wire `tools/list`. */
export type ConformanceSource = ToolRegistry | readonly AnyToolDefinition[] | readonly Tool[];

/** Known-good values for one tool. Each must validate against the tool's wire schema. */
export interface ConformanceSamples {
  input?: readonly unknown[];
  output?: readonly unknown[];
}

export interface ConformanceOptions {
  /**
   * Known-good values per tool name. Input samples are validated against
   * `inputSchema`, output samples against `outputSchema` — under Ajv, i.e. as
   * a client sees them. Catches a schema that compiles but rejects real data.
   * A sample for a tool name that is not in the source is itself a failure, so
   * a renamed tool cannot silently stop being checked.
   */
  samples?: Readonly<Record<string, ConformanceSamples>>;
}

export interface ConformanceReport {
  /** Names of the tools checked, in source order. */
  tools: string[];
}

export interface StructuredValidation {
  valid: boolean;
  /** One line per problem; empty when `valid`. */
  errors: string[];
}

/** Thrown by `assertMcpConformance`; `problems` holds one line per failure. */
export class McpConformanceError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(
      `MCP conformance failed (${problems.length} problem(s)):\n${problems.map((p) => `  - ${p}`).join("\n")}`,
    );
    this.name = "McpConformanceError";
    this.problems = problems;
  }
}

/**
 * The Ajv a 2020-12-only client effectively runs: strict mode, 2020-12 as the
 * only meta-schema (no draft-07 is added, so a draft-07 `$schema` fails here
 * exactly as it failed in the client), standard formats known.
 *
 * `allowUnionTypes` is the one relaxation, and it is not a relaxation of the
 * spec: `type: ["string", "number"]` is valid 2020-12 — it is what Zod emits for
 * `z.union([z.string(), z.number()])` — and Ajv's `strictTypes` flags it only
 * as a style preference.
 */
function makeAjv(): Ajv2020 {
  const ajv = new Ajv2020({ strict: true, allowUnionTypes: true, allErrors: true });
  addFormats(ajv);
  return ajv;
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? [])
    .map((e) => `${e.instancePath || "(root)"} ${e.message ?? ""}`.trim())
    .join("; ");
}

interface WireTool {
  name: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
}

function isRegistry(source: ConformanceSource): source is ToolRegistry {
  return !Array.isArray(source) && typeof (source as ToolRegistry).toMcpTools === "function";
}

function isDefinition(entry: AnyToolDefinition | Tool): entry is AnyToolDefinition {
  return "input" in entry && "output" in entry;
}

/** Convert definitions to wire shape, recording a conversion throw as a problem. */
function toWire(entry: AnyToolDefinition | Tool, problems: string[]): WireTool {
  if (!isDefinition(entry)) return entry as WireTool;
  const wire: WireTool = { name: entry.name };
  for (const io of ["input", "output"] as const) {
    try {
      const schema = toMcpSchema(io === "input" ? entry.input : entry.output, io, entry.name);
      if (io === "input") wire.inputSchema = schema;
      else wire.outputSchema = schema;
    } catch (err) {
      problems.push((err as Error).message);
    }
  }
  return wire;
}

function compileWireSchema(
  ajv: Ajv2020,
  tool: string,
  field: "inputSchema" | "outputSchema",
  schema: unknown,
  problems: string[],
): ValidateFunction | undefined {
  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) {
    problems.push(`${tool}: ${field} is not a JSON Schema object.`);
    return undefined;
  }
  const s = schema as Record<string, unknown>;
  if (s.$schema !== undefined && s.$schema !== DIALECT_2020_12) {
    problems.push(
      `${tool}: ${field} declares $schema ${JSON.stringify(s.$schema)}. A 2020-12-only client ` +
        "(Claude Code 2.1.292+) refuses it. Emit 2020-12 with no $schema — mcp-kit's toMcpSchema() does.",
    );
  }
  if (s.type !== "object") {
    problems.push(
      `${tool}: ${field} has type ${JSON.stringify(s.type ?? null)}; MCP requires "object".`,
    );
  }
  try {
    return ajv.compile(s);
  } catch (err) {
    problems.push(
      `${tool}: ${field} does not compile under Ajv2020 strict: ${(err as Error).message}`,
    );
    return undefined;
  }
}

/**
 * Throw `McpConformanceError` unless every tool's schemas would be accepted by a
 * JSON Schema 2020-12 client, and every sample validates.
 *
 * Collects every problem before throwing, so one run shows them all.
 *
 * A `ToolRegistry` is checked in full — devOnly tools included and its
 * `filter` ignored — because a hidden tool still ships a schema somebody's
 * client will compile.
 *
 * Pass the result of a real `tools/list` (`Tool[]`) to check the wire output
 * itself; pass definitions or a registry to check what `toMcpSchema` would emit.
 */
export function assertMcpConformance(
  source: ConformanceSource,
  opts: ConformanceOptions = {},
): ConformanceReport {
  const problems: string[] = [];
  const entries: readonly (AnyToolDefinition | Tool)[] = isRegistry(source) ? source.tools : source;
  const ajv = makeAjv();
  const seen = new Set<string>();
  const names: string[] = [];
  const validators = new Map<
    string,
    { input?: ValidateFunction | undefined; output?: ValidateFunction | undefined }
  >();

  for (const entry of entries) {
    const wire = toWire(entry, problems);
    const name = typeof wire.name === "string" ? wire.name : "";
    if (name === "") {
      problems.push("A tool has no name.");
      continue;
    }
    if (seen.has(name)) problems.push(`${name}: duplicate tool name.`);
    seen.add(name);
    names.push(name);

    const v: { input?: ValidateFunction | undefined; output?: ValidateFunction | undefined } = {};
    if (wire.inputSchema === undefined) {
      if (!isDefinition(entry)) problems.push(`${name}: no inputSchema (MCP requires one).`);
    } else {
      v.input = compileWireSchema(ajv, name, "inputSchema", wire.inputSchema, problems);
    }
    if (wire.outputSchema !== undefined) {
      v.output = compileWireSchema(ajv, name, "outputSchema", wire.outputSchema, problems);
    }
    validators.set(name, v);
  }

  for (const [tool, samples] of Object.entries(opts.samples ?? {})) {
    const v = validators.get(tool);
    if (!v) {
      problems.push(`samples given for "${tool}", which is not in the source.`);
      continue;
    }
    for (const io of ["input", "output"] as const) {
      const list = samples[io] ?? [];
      if (list.length === 0) continue;
      const validate = v[io];
      if (!validate) {
        problems.push(`${tool}: ${io} samples given but there is no compiled ${io}Schema.`);
        continue;
      }
      list.forEach((sample, i) => {
        if (!validate(sample)) {
          problems.push(
            `${tool}: ${io} sample #${i} rejected: ${formatAjvErrors(validate.errors)}`,
          );
        }
      });
    }
  }

  if (problems.length > 0) throw new McpConformanceError(problems);
  return { tools: names };
}

/**
 * Check a `tools/call` result the way the SDK client does before handing it to
 * the model:
 *
 * - a tool with an `outputSchema` must return `structuredContent` unless the
 *   result is an error;
 * - `structuredContent`, when present, must validate against `outputSchema`
 *   (under Ajv2020, strict).
 *
 * A tool with no `outputSchema` has nothing to check and is always valid.
 * Accepts the wire `Tool` (from `tools/list`) or a `ToolDefinition`.
 *
 * Returns rather than throws, so a test reads
 * `expect(validateStructured(tool, result).errors).toEqual([])` and the diff
 * shows the reason.
 */
export function validateStructured(
  tool: Tool | AnyToolDefinition,
  // `Record<string, unknown>` admits the SDK client's `callTool()` return type,
  // whose union includes the legacy `{ toolResult }` shape.
  result: { structuredContent?: unknown; isError?: boolean | undefined } | Record<string, unknown>,
): StructuredValidation {
  const { structuredContent, isError } = result as {
    structuredContent?: unknown;
    isError?: boolean;
  };
  let outputSchema: unknown;
  if (isDefinition(tool)) {
    try {
      outputSchema = toMcpSchema(tool.output, "output", tool.name) satisfies McpJsonSchema;
    } catch (err) {
      return { valid: false, errors: [(err as Error).message] };
    }
  } else {
    outputSchema = tool.outputSchema;
  }
  if (outputSchema === undefined) return { valid: true, errors: [] };

  if (!structuredContent && !isError) {
    return {
      valid: false,
      errors: [`Tool ${tool.name} has an output schema but did not return structured content.`],
    };
  }
  if (!structuredContent) return { valid: true, errors: [] };

  const problems: string[] = [];
  const validate = compileWireSchema(makeAjv(), tool.name, "outputSchema", outputSchema, problems);
  if (!validate) return { valid: false, errors: problems };
  if (validate(structuredContent)) return { valid: true, errors: [] };
  return {
    valid: false,
    errors: (validate.errors ?? []).map(
      (e) => `${tool.name}: structuredContent${e.instancePath} ${e.message ?? "is invalid"}`,
    ),
  };
}
