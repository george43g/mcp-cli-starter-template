import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  makeRegistry,
  type ToolDefinition,
  type ToolFilterContext,
  toMcpSchema,
} from "./tool-registry.js";

const prod: ToolDefinition = {
  name: "prod_tool",
  description: "Production tool",
  input: z.object({ x: z.string() }),
  output: z.object({ y: z.string() }),
  annotations: { readOnlyHint: true },
  handler: async ({ x }) => ({ y: x.toUpperCase() }),
};

const dev: ToolDefinition = {
  name: "dev_tool",
  description: "Dev-only",
  input: z.object({}),
  output: z.object({}),
  annotations: {},
  devOnly: true,
  handler: async () => ({}),
};

describe("makeRegistry", () => {
  it("exposes get() lookup", () => {
    const r = makeRegistry([prod, dev]);
    expect(r.get("prod_tool")).toBe(prod);
    expect(r.get("nope")).toBeUndefined();
  });

  it("toMcpTools() excludes devOnly by default", () => {
    const r = makeRegistry([prod, dev]);
    const tools = r.toMcpTools();
    expect(tools.map((t) => t.name)).toEqual(["prod_tool"]);
  });

  it("toMcpTools(true) includes devOnly", () => {
    const r = makeRegistry([prod, dev]);
    const tools = r.toMcpTools(true);
    expect(tools.map((t) => t.name)).toEqual(["prod_tool", "dev_tool"]);
  });

  it("emits inputSchema and outputSchema", () => {
    const r = makeRegistry([prod]);
    const [tool] = r.toMcpTools();
    expect(tool?.inputSchema).toBeDefined();
    expect(tool?.outputSchema).toBeDefined();
  });
});

const ajv2020 = () => new Ajv2020({ strict: true, allowUnionTypes: true });

describe("toMcpSchema", () => {
  const schema = z.object({
    name: z.string().describe("Who to greet."),
    loud: z.boolean().default(false),
    tags: z.array(z.string()).optional(),
  });

  it("emits 2020-12 with no $schema label", () => {
    const json = toMcpSchema(schema, "input", "greet");
    expect(json.$schema).toBeUndefined();
    expect(json.type).toBe("object");
    expect(() => ajv2020().compile(json)).not.toThrow();
  });

  it("would have failed a 2020-12-only client WITH the draft-07 label 2.x shipped", () => {
    const json = {
      ...toMcpSchema(schema, "input"),
      $schema: "http://json-schema.org/draft-07/schema#",
    };
    expect(() => ajv2020().compile(json)).toThrow(/draft-07/);
  });

  it("keeps .describe() text, from the same zod instance the schemas were built with", () => {
    const json = toMcpSchema(schema, "input");
    expect((json.properties as Record<string, { description?: string }>).name?.description).toBe(
      "Who to greet.",
    );
  });

  it("input io makes a defaulted field optional; output io requires it and closes the object", () => {
    const input = toMcpSchema(schema, "input");
    const output = toMcpSchema(schema, "output");
    expect(input.required).toEqual(["name"]);
    expect(output.required).toEqual(["name", "loud"]);
    expect(output.additionalProperties).toBe(false);
  });

  it("throws naming the tool when the top level is not an object", () => {
    expect(() => toMcpSchema(z.string(), "input", "bad_tool")).toThrow(
      /tool "bad_tool" input schema must be a Zod object/,
    );
    expect(() => toMcpSchema(z.array(z.string()), "output")).toThrow(/output schema must be/);
  });

  it.each([
    ["z.date()", z.object({ when: z.date() }), /Date cannot be represented/],
    ["z.bigint()", z.object({ big: z.bigint() }), /BigInt cannot be represented/],
  ])("throws naming the tool for an unrepresentable %s field", (_label, bad, why) => {
    expect(() => toMcpSchema(bad, "input", "when_tool")).toThrow(/tool "when_tool" input schema/);
    expect(() => toMcpSchema(bad, "input", "when_tool")).toThrow(why);
  });

  it("throws for an output-side transform, which has no JSON Schema", () => {
    const t = z.object({ n: z.string().transform(Number) });
    expect(() => toMcpSchema(t, "input")).not.toThrow();
    expect(() => toMcpSchema(t, "output", "xf")).toThrow(/tool "xf" output schema/);
  });

  it("keeps $defs/$ref for a recursive schema, and it round-trips through Ajv2020", () => {
    const Node: z.ZodType<{ name: string; children: unknown[] }> = z.object({
      name: z.string(),
      get children() {
        return z.array(Node);
      },
    });
    const json = toMcpSchema(z.object({ root: Node }), "input", "tree");
    expect(json.$defs).toBeDefined();
    expect(JSON.stringify(json)).toContain('"$ref"');
    const validate = ajv2020().compile(json);
    const good = { root: { name: "a", children: [{ name: "b", children: [] }] } };
    expect(validate(good)).toBe(true);
    expect(validate({ root: { name: "a", children: [{ name: 1, children: [] }] } })).toBe(false);
    expect(Node.parse(good.root)).toEqual(good.root);
  });
});

describe("makeRegistry schemas", () => {
  it("derives both wire schemas from the zod definition, without $schema", () => {
    const [tool] = makeRegistry([prod]).toMcpTools();
    expect(tool?.inputSchema).toEqual({
      type: "object",
      properties: { x: { type: "string" } },
      required: ["x"],
    });
    expect(tool?.outputSchema).toMatchObject({ type: "object", additionalProperties: false });
    expect(JSON.stringify(tool)).not.toContain("$schema");
  });

  it("throws at construction, naming the tool, for an unrepresentable schema", () => {
    const bad: ToolDefinition = { ...prod, name: "dated", output: z.object({ at: z.date() }) };
    expect(() => makeRegistry([prod, bad])).toThrow(/tool "dated" output schema/);
  });
});

describe("makeRegistry filter", () => {
  const scoped: ToolDefinition = { ...prod, name: "send_mail" };
  const filter = (t: { name: string }, ctx: ToolFilterContext) =>
    t.name !== "send_mail" || (ctx.authInfo?.scopes.includes("mail.send") ?? false);
  const auth = (scopes: string[]) => ({ authInfo: { token: "t", clientId: "c", scopes } });

  it("is evaluated per call to toMcpTools, against the ctx passed", () => {
    const r = makeRegistry([prod, scoped], { filter });
    expect(r.toMcpTools().map((t) => t.name)).toEqual(["prod_tool"]);
    expect(r.toMcpTools(false, auth([])).map((t) => t.name)).toEqual(["prod_tool"]);
    expect(r.toMcpTools(false, auth(["mail.send"])).map((t) => t.name)).toEqual([
      "prod_tool",
      "send_mail",
    ]);
  });

  it("composes with devOnly: both must pass", () => {
    const r = makeRegistry([prod, dev], { filter: (t) => t.name !== "dev_tool" });
    expect(r.toMcpTools(true).map((t) => t.name)).toEqual(["prod_tool"]);
  });

  it("fails closed when the filter throws", () => {
    const r = makeRegistry([prod], {
      filter: () => {
        throw new Error("gate bug");
      },
    });
    expect(r.toMcpTools()).toEqual([]);
    expect(r.allows(prod)).toBe(false);
  });

  it("allows everything when no filter is configured", () => {
    const r = makeRegistry([prod]);
    expect(r.allows(prod, auth([]))).toBe(true);
  });
});

describe("makeRegistry filter reads live state", () => {
  // EQStack gmail's gate is hasScope(getAuthorizedScopes(), tool.scopes), and
  // the granted scopes change at runtime after a re-auth. The predicate must be
  // evaluated per listing, and must see the consumer's own tool metadata.
  interface ScopedTool extends ToolDefinition {
    scopes: string[];
  }
  it("re-evaluates on every toMcpTools(), with the consumer's own tool type", () => {
    let granted: string[] = [];
    const send: ScopedTool = { ...prod, name: "send", scopes: ["gmail.send"] };
    const read: ScopedTool = { ...prod, name: "read", scopes: [] };
    const r = makeRegistry([send, read], {
      filter: (tool) => tool.scopes.every((s) => granted.includes(s)),
    });
    expect(r.toMcpTools().map((t) => t.name)).toEqual(["read"]);
    granted = ["gmail.send"];
    expect(r.toMcpTools().map((t) => t.name)).toEqual(["send", "read"]);
    granted = [];
    expect(r.allows(send)).toBe(false);
  });
});

describe("makeRegistry filter: { deny }", () => {
  const reason = "not available. You may need to re-authenticate with additional scopes";

  it("hides a denied tool from tools/list exactly like false", () => {
    const r = makeRegistry([prod, dev], {
      filter: (t) => (t.name === "prod_tool" ? { deny: reason } : true),
    });
    expect(r.toMcpTools(true).map((t) => t.name)).toEqual(["dev_tool"]);
    expect(r.allows(prod)).toBe(false);
  });

  it("evaluate() carries the deny reason, and only for { deny }", () => {
    const r = (result: boolean | { deny: string }) =>
      makeRegistry([prod], { filter: () => result });
    expect(r({ deny: reason }).evaluate?.(prod)).toEqual({ allowed: false, deny: reason });
    expect(r(false).evaluate?.(prod)).toEqual({ allowed: false });
    expect(r(true).evaluate?.(prod)).toEqual({ allowed: true });
    expect(makeRegistry([prod]).evaluate?.(prod)).toEqual({ allowed: true });
  });

  it("treats an empty reason, a throw, or a non-boolean as a plain false", () => {
    expect(makeRegistry([prod], { filter: () => ({ deny: "  " }) }).evaluate?.(prod)).toEqual({
      allowed: false,
    });
    const throwing = makeRegistry([prod], {
      filter: () => {
        throw new Error("gate bug");
      },
    });
    expect(throwing.evaluate?.(prod)).toEqual({ allowed: false });
    // A JS caller returning a truthy non-boolean is not "allowed".
    const truthy = makeRegistry([prod], { filter: (() => 1) as unknown as () => boolean });
    expect(truthy.evaluate?.(prod)).toEqual({ allowed: false });
  });
});

describe("makeRegistry strictArgs", () => {
  const chat: ToolDefinition = {
    name: "chat_history",
    description: "Read a chat",
    input: z.object({ chatIdentifier: z.string(), limit: z.number().default(20) }),
    output: z.object({ n: z.number() }),
    annotations: { readOnlyHint: true },
    handler: async ({ limit }) => ({ n: limit }),
  };
  const typo = { chatIdentifer: "x" };

  it("is off by default", () => {
    expect(makeRegistry([chat]).unknownArgs?.(chat, typo)).toEqual([]);
  });

  it("names each undeclared key, with a suggestion when one is close", () => {
    const r = makeRegistry([chat], { strictArgs: true });
    expect(r.unknownArgs?.(chat, { ...typo, cursor: 1, limit: 3 })).toEqual([
      { key: "chatIdentifer", suggestion: "chatIdentifier" },
      { key: "cursor" },
    ]);
    expect(r.unknownArgs?.(chat, { chatIdentifier: "x" })).toEqual([]);
  });

  it("lets a tool override the registry default in either direction", () => {
    const strictTool = { ...chat, name: "strict_tool", strictArgs: true };
    const looseTool = { ...chat, name: "loose_tool", strictArgs: false };
    const off = makeRegistry([strictTool, looseTool]);
    const on = makeRegistry([strictTool, looseTool], { strictArgs: true });
    expect(off.unknownArgs?.(strictTool, typo)).toHaveLength(1);
    expect(on.unknownArgs?.(looseTool, typo)).toEqual([]);
  });

  it("leaves the advertised inputSchema unchanged (still open)", () => {
    const plain = makeRegistry([chat]).toMcpTools();
    const strict = makeRegistry([chat], { strictArgs: true }).toMcpTools();
    expect(strict).toEqual(plain);
    expect(strict[0]?.inputSchema).not.toHaveProperty("additionalProperties");
  });

  it("checks plain-object arguments only", () => {
    const r = makeRegistry([chat], { strictArgs: true });
    for (const args of [null, undefined, "x", 3, ["chatIdentifer"]]) {
      expect(r.unknownArgs?.(chat, args)).toEqual([]);
    }
  });

  it("reads the declared keys through refine, transform and intersection", () => {
    const base = z.object({ a: z.string() });
    const shapes = {
      refined: base.refine(() => true),
      transformed: base.transform((v) => v),
      intersection: z.intersection(base, z.object({ b: z.string() })),
    };
    for (const [name, input] of Object.entries(shapes)) {
      const def: ToolDefinition = { ...prod, name, input };
      const r = makeRegistry([def], { strictArgs: true });
      expect(r.unknownArgs?.(def, { a: "1", b: "2", c: "3" }).map((u) => u.key)).toEqual(
        name === "intersection" ? ["c"] : ["b", "c"],
      );
    }
  });

  it("does nothing for an input that declares itself open", () => {
    const shapes = {
      loose: z.looseObject({ a: z.string() }),
      catchall: z.object({ a: z.string() }).catchall(z.string()),
      record: z.record(z.string(), z.string()),
    };
    for (const [name, input] of Object.entries(shapes)) {
      const def: ToolDefinition = { ...prod, name, input };
      expect(makeRegistry([def], { strictArgs: true }).unknownArgs?.(def, { zzz: "1" })).toEqual(
        [],
      );
    }
  });

  it("checks a definition from outside the registry against its own schema", () => {
    const r = makeRegistry([prod], { strictArgs: true });
    expect(r.unknownArgs?.(chat, typo).map((u) => u.key)).toEqual(["chatIdentifer"]);
  });
});
