import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildDispatcher } from "./dispatch.js";
import { assertMcpConformance, McpConformanceError, validateStructured } from "./testing.js";
import { makeRegistry, type ToolDefinition } from "./tool-registry.js";

const greet: ToolDefinition = {
  name: "greet",
  description: "Greets",
  input: z.object({
    name: z.string(),
    email: z.string().email().optional(),
    id: z.union([z.string(), z.number()]).optional(),
  }),
  output: z.object({ text: z.string(), at: z.string().datetime() }),
  annotations: { readOnlyHint: true },
  handler: async ({ name }) => ({ text: `hi ${name}`, at: new Date().toISOString() }),
};

const liar: ToolDefinition = {
  name: "liar",
  description: "Returns a shape its output schema forbids",
  input: z.object({}),
  output: z.object({ n: z.number() }),
  annotations: {},
  handler: async () => ({ n: "not a number" }) as unknown as { n: number },
};

function problemsOf(fn: () => unknown): readonly string[] {
  try {
    fn();
  } catch (err) {
    if (err instanceof McpConformanceError) return err.problems;
    throw err;
  }
  return [];
}

describe("assertMcpConformance", () => {
  it("passes a registry, its definitions, and its wire tools alike", () => {
    const registry = makeRegistry([greet, liar]);
    expect(assertMcpConformance(registry).tools).toEqual(["greet", "liar"]);
    expect(assertMcpConformance([greet, liar]).tools).toEqual(["greet", "liar"]);
    expect(assertMcpConformance(registry.toMcpTools()).tools).toEqual(["greet", "liar"]);
  });

  it("checks a registry in full: devOnly tools and filtered tools included", () => {
    const dev = { ...greet, name: "dev_greet", devOnly: true };
    const registry = makeRegistry([greet, dev], { filter: () => false });
    expect(registry.toMcpTools()).toEqual([]);
    expect(assertMcpConformance(registry).tools).toEqual(["greet", "dev_greet"]);
  });

  it("rejects the draft-07 label mcp-kit 2.x shipped — the exact client failure", () => {
    const [tool] = makeRegistry([greet]).toMcpTools();
    const draft07 = {
      ...tool,
      inputSchema: { ...tool?.inputSchema, $schema: "http://json-schema.org/draft-07/schema#" },
    } as Tool;
    const problems = problemsOf(() => assertMcpConformance([draft07]));
    expect(problems.join("\n")).toMatch(/declares \$schema "http:\/\/json-schema.org\/draft-07/);
    expect(problems.join("\n")).toMatch(/does not compile under Ajv2020 strict/);
  });

  it("collects every problem before throwing", () => {
    const wire = [
      { name: "no_input" },
      { name: "array_in", inputSchema: { type: "array" } },
      { name: "array_in", inputSchema: { type: "object" } },
      { name: "bad_kw", inputSchema: { type: "object", notAKeyword: true } },
    ] as unknown as Tool[];
    const problems = problemsOf(() => assertMcpConformance(wire));
    expect(problems).toEqual([
      "no_input: no inputSchema (MCP requires one).",
      'array_in: inputSchema has type "array"; MCP requires "object".',
      "array_in: duplicate tool name.",
      expect.stringMatching(
        /^bad_kw: inputSchema does not compile under Ajv2020 strict: .*notAKeyword/,
      ),
    ]);
  });

  it("reports an unrepresentable definition instead of crashing on it", () => {
    const dated: ToolDefinition = { ...greet, name: "dated", output: z.object({ at: z.date() }) };
    const problems = problemsOf(() => assertMcpConformance([dated]));
    expect(problems).toEqual([
      expect.stringMatching(/tool "dated" output schema cannot be represented/),
    ]);
  });

  it("validates samples under the wire schema, and flags samples for unknown tools", () => {
    const ok = assertMcpConformance([greet], {
      samples: {
        greet: {
          input: [{ name: "a" }, { name: "b", email: "b@example.com", id: 3 }],
          output: [{ text: "hi", at: "2026-10-08T00:00:00Z" }],
        },
      },
    });
    expect(ok.tools).toEqual(["greet"]);

    const problems = problemsOf(() =>
      assertMcpConformance([greet], {
        samples: {
          greet: { input: [{ email: "not-an-email" }], output: [{ text: "hi", at: "yesterday" }] },
          gone: { input: [{}] },
        },
      }),
    );
    expect(problems).toEqual([
      expect.stringMatching(/^greet: input sample #0 rejected: .*name.*format "email"/),
      expect.stringMatching(
        /^greet: output sample #0 rejected: .*\/at must match format "date-time"/,
      ),
      'samples given for "gone", which is not in the source.',
    ]);
  });
});

describe("validateStructured", () => {
  it("accepts conforming structuredContent and rejects the rest, by path", async () => {
    const dispatch = buildDispatcher({ registry: makeRegistry([greet, liar]) });
    const good = await dispatch("greet", { name: "x" });
    expect(validateStructured(greet, good)).toEqual({ valid: true, errors: [] });
    const bad = await dispatch("liar", {});
    expect(validateStructured(liar, bad)).toEqual({
      valid: false,
      errors: ["liar: structuredContent/n must be number"],
    });
  });

  it("requires structuredContent from a tool with an outputSchema, unless the result is an error", () => {
    expect(validateStructured(greet, {}).errors).toEqual([
      "Tool greet has an output schema but did not return structured content.",
    ]);
    expect(validateStructured(greet, { isError: true }).valid).toBe(true);
  });

  it("has nothing to check for a wire tool with no outputSchema", () => {
    const tool = { name: "t", inputSchema: { type: "object" } } as Tool;
    expect(validateStructured(tool, { structuredContent: { anything: 1 } }).valid).toBe(true);
  });

  it("agrees with the SDK client's own check, over a real client/server pair", async () => {
    // The point of the helper is to fail in a unit test where the client would
    // fail in production. Prove the two verdicts match on the same tool.
    const registry = makeRegistry([greet, liar]);
    const dispatch = buildDispatcher({ registry });
    const server = new Server({ name: "t", version: "0.0.0" }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async (_req, extra) => ({
      tools: registry.toMcpTools(false, extra),
    }));
    server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
      const r = await dispatch(req.params.name, req.params.arguments ?? {}, extra.signal, extra);
      return r as unknown as Record<string, unknown> & { content: [] };
    });
    const client = new Client({ name: "c", version: "0.0.0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);

    const { tools } = await client.listTools();
    for (const t of tools) expect(JSON.stringify(t)).not.toContain("$schema");
    assertMcpConformance(tools);

    const good = await client.callTool({ name: "greet", arguments: { name: "x" } });
    expect(validateStructured(tools[0] as Tool, good).valid).toBe(true);

    await expect(client.callTool({ name: "liar", arguments: {} })).rejects.toThrow(
      /does not match the tool's output schema/,
    );
    const raw = await dispatch("liar", {});
    expect(validateStructured(tools[1] as Tool, raw).valid).toBe(false);

    await client.close();
    await server.close();
  });
});
