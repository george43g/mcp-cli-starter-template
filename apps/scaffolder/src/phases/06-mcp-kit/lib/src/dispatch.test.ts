import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { buildDispatcher } from "./dispatch.js";
import { makeRegistry, type ToolDefinition } from "./tool-registry.js";

const FORCE_KEY = "MCP_TOOL_TIMEOUT_FORCE_MS";

beforeEach(() => {
  delete process.env[FORCE_KEY];
});

afterEach(() => {
  delete process.env[FORCE_KEY];
});

const echo: ToolDefinition = {
  name: "echo",
  description: "Echo input",
  input: z.object({ input: z.string() }),
  output: z.object({ echo: z.string() }),
  annotations: { readOnlyHint: true },
  handler: async ({ input }) => ({ echo: input }),
};

const slow: ToolDefinition = {
  name: "slow",
  description: "Sleeps",
  input: z.object({}),
  output: z.object({ ok: z.boolean() }),
  annotations: { readOnlyHint: true },
  timeoutMs: 50,
  handler: () =>
    new Promise((resolve) => {
      setTimeout(() => resolve({ ok: true }), 200).unref();
    }),
};

const throws: ToolDefinition = {
  name: "throws",
  description: "Always throws",
  input: z.object({}),
  output: z.object({}),
  annotations: {},
  handler: async () => {
    throw new Error("kaboom");
  },
};

const registry = makeRegistry([echo, slow, throws]);

describe("buildDispatcher", () => {
  it("returns structuredContent on success", async () => {
    const dispatch = buildDispatcher({ registry });
    const r = await dispatch("echo", { input: "hi" });
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent).toEqual({ echo: "hi" });
    expect(r._meta?.engine).toBe("ts");
    expect(typeof r._meta?.duration_ms).toBe("number");
  });

  it("rejects unknown tool", async () => {
    const dispatch = buildDispatcher({ registry });
    const r = await dispatch("ghost", {});
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/Unknown tool/);
  });

  it("rejects malformed input via Zod", async () => {
    const dispatch = buildDispatcher({ registry });
    const r = await dispatch("echo", { input: 42 });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/Invalid arguments/);
  });

  it("returns timeout error when handler exceeds budget", async () => {
    const dispatch = buildDispatcher({ registry });
    const r = await dispatch("slow", {});
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/Timed out/);
  });

  it("wraps thrown errors", async () => {
    const dispatch = buildDispatcher({ registry });
    const r = await dispatch("throws", {});
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toMatch(/kaboom/);
  });

  it("uses caller-supplied engine label in _meta", async () => {
    const dispatch = buildDispatcher({ registry, engineLabel: () => "rust" });
    const r = await dispatch("echo", { input: "x" });
    expect(r._meta?.engine).toBe("rust");
  });

  it("invokes onCall and onError counters", async () => {
    const calls: string[] = [];
    const errors: string[] = [];
    const dispatch = buildDispatcher({
      registry,
      onCall: (n) => calls.push(n),
      onError: (n) => errors.push(n),
    });
    await dispatch("echo", { input: "x" });
    await dispatch("ghost", {});
    expect(calls).toEqual(["echo", "ghost"]);
    expect(errors).toEqual(["ghost"]);
  });
});

describe("toContent — media blocks lead the JSON summary", () => {
  const shot: ToolDefinition = {
    name: "shot",
    description: "Returns a picture",
    input: z.object({}),
    output: z.object({ path: z.string() }),
    annotations: { readOnlyHint: true },
    handler: async () => ({ path: "/tmp/a.png" }),
    toContent: () => [{ type: "image", data: "QUJD", mimeType: "image/png" }],
  };

  it("emits [image, text] — the order renderers depend on", async () => {
    const dispatch = buildDispatcher({ registry: makeRegistry([shot]) });
    const res = await dispatch("shot", {});
    expect(res.content.map((b) => b.type)).toEqual(["image", "text"]);
    expect(res.content[0]).toEqual({ type: "image", data: "QUJD", mimeType: "image/png" });
  });

  it("still carries the structured result and the text block", async () => {
    const dispatch = buildDispatcher({ registry: makeRegistry([shot]) });
    const res = await dispatch("shot", {});
    expect(res.structuredContent).toEqual({ path: "/tmp/a.png" });
    const text = res.content.find((b) => b.type === "text");
    expect(text && "text" in text ? JSON.parse(text.text) : null).toEqual({ path: "/tmp/a.png" });
  });

  it("a throwing toContent degrades to text — the answer survives a broken picture", async () => {
    const broken: ToolDefinition = {
      ...shot,
      name: "broken",
      toContent: () => {
        throw new Error("file vanished");
      },
    };
    const dispatch = buildDispatcher({ registry: makeRegistry([broken]) });
    const res = await dispatch("broken", {});
    expect(res.content.map((b) => b.type)).toEqual(["text"]);
    expect(res.isError).toBeUndefined();
    expect(res.structuredContent).toEqual({ path: "/tmp/a.png" });
  });

  it("a tool without toContent is unchanged — one text block", async () => {
    const dispatch = buildDispatcher({ registry });
    const res = await dispatch("echo", { input: "hi" });
    expect(res.content.map((b) => b.type)).toEqual(["text"]);
  });
});

describe("devOnlyEnabled — hiding a tool is not disabling it", () => {
  const secret: ToolDefinition = {
    name: "get_logs",
    description: "Dev only",
    input: z.object({}),
    output: z.object({ ok: z.boolean() }),
    annotations: { readOnlyHint: true },
    devOnly: true,
    handler: async () => ({ ok: true }),
  };
  const devRegistry = makeRegistry([secret]);

  it("runs the tool when the gate is open", async () => {
    const dispatch = buildDispatcher({ registry: devRegistry, devOnlyEnabled: () => true });
    const res = await dispatch("get_logs", {});
    expect(res.isError).toBeUndefined();
    expect(res.structuredContent).toEqual({ ok: true });
  });

  it("refuses when the gate is closed, and does NOT confirm the tool exists", async () => {
    // A distinct "disabled" error tells a caller the tool is there, which is
    // what the gate exists to avoid. The response must be byte-identical to an
    // unknown name.
    const dispatch = buildDispatcher({ registry: devRegistry, devOnlyEnabled: () => false });
    const gated = await dispatch("get_logs", {});
    const unknown = await dispatch("no_such_tool", {});
    expect(gated.isError).toBe(true);
    const gatedText = gated.content[0];
    const unknownText = unknown.content[0];
    const strip = (b: typeof gatedText) =>
      b && "text" in b ? b.text.replace(/no_such_tool|get_logs/g, "<name>") : null;
    expect(strip(gatedText)).toEqual(strip(unknownText));
  });

  it("is read PER DISPATCH, so flipping it mid-suite takes effect", async () => {
    let open = true;
    const dispatch = buildDispatcher({ registry: devRegistry, devOnlyEnabled: () => open });
    expect((await dispatch("get_logs", {})).isError).toBeUndefined();
    open = false;
    expect((await dispatch("get_logs", {})).isError).toBe(true);
  });

  it("omitting the option leaves dev-only tools callable — today's behaviour", async () => {
    // The seam is additive: a consumer that does not pass it sees no change.
    const dispatch = buildDispatcher({ registry: devRegistry });
    expect((await dispatch("get_logs", {})).isError).toBeUndefined();
  });

  it("never gates a tool that is not devOnly", async () => {
    const dispatch = buildDispatcher({ registry, devOnlyEnabled: () => false });
    expect((await dispatch("echo", { input: "x" })).isError).toBeUndefined();
  });
});
