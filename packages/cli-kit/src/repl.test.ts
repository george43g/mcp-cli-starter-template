/**
 * REPL input parsing and dispatch.
 *
 * These are written against the CONTRACT, not the implementation. DEFERRED #16a
 * plans to replace the readline loop with a queue-based one; a replacement must
 * still satisfy every assertion here, so these tests should outlive the code
 * they currently cover. That is the reason to write them now rather than wait
 * for the rewrite: a downstream consumer is blocked on this behaviour today.
 *
 * The three cases the upstream bug report specified are the first three
 * `parseConsoleInput` tests below, verbatim.
 */

import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { parseConsoleInput, type ReplDispatcher, runRepl, type ToolDescriptor } from "./repl.js";

describe("parseConsoleInput", () => {
  it("preserves a JSON payload verbatim in `rest`", () => {
    const line = 'raw {"name":"x","arguments":{"a":1}}';
    const { cmd, rest } = parseConsoleInput(line);
    expect(cmd).toBe("raw");
    // The whole point: quotes survive, so JSON.parse works.
    expect(rest).toBe('{"name":"x","arguments":{"a":1}}');
    expect(JSON.parse(rest)).toEqual({ name: "x", arguments: { a: 1 } });
  });

  it("groups quoted arguments", () => {
    expect(parseConsoleInput('foo "two words" bar').args).toEqual(["two words", "bar"]);
  });

  it("honours backslash-escaped quotes inside a quoted argument", () => {
    expect(parseConsoleInput('foo "she said \\"hi\\""').args).toEqual(['she said "hi"']);
  });

  it("preserves the case of the command word", () => {
    // The old parser lowercased this, making any tool with an uppercase letter
    // permanently unreachable.
    expect(parseConsoleInput("getLogs {}").cmd).toBe("getLogs");
  });

  it("handles a bare command with no arguments", () => {
    expect(parseConsoleInput("help")).toEqual({ cmd: "help", rest: "", args: [] });
  });

  it("keeps an empty quoted string as an argument", () => {
    expect(parseConsoleInput('foo "" bar').args).toEqual(["", "bar"]);
  });

  it("collapses runs of whitespace between arguments", () => {
    expect(parseConsoleInput("foo   a    b").args).toEqual(["a", "b"]);
  });

  it("treats a trailing backslash as a literal backslash", () => {
    expect(parseConsoleInput("foo back\\").args).toEqual(["back\\"]);
  });

  it("supports single quotes", () => {
    expect(parseConsoleInput("foo 'two words'").args).toEqual(["two words"]);
  });
});

/** Records every callTool so a test can assert on name AND arguments. */
function fakeDispatcher(tools: ToolDescriptor[]): ReplDispatcher & {
  calls: Array<{ name: string; args: Record<string, unknown> }>;
} {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    listTools: () => tools,
    async callTool(name, args) {
      calls.push({ name, args });
      return { content: [{ type: "text", text: `ok:${name}` }] };
    },
  };
}

/**
 * Drive the REPL with a fixed script and collect its output.
 *
 * Relies on EOF resolving the promise — ending the input stream is how the run
 * terminates. Before that was handled, this helper would hang forever.
 */
async function runScript(
  lines: string[],
  dispatcher: ReplDispatcher,
  shortcuts?: Parameters<typeof runRepl>[0]["shortcuts"],
): Promise<string> {
  const input = new PassThrough();
  const output = new PassThrough();
  let text = "";
  output.on("data", (c: Buffer) => {
    text += c.toString();
  });

  const done = runRepl({
    prompt: "test",
    dispatcher,
    input,
    output,
    ...(shortcuts ? { shortcuts } : {}),
  });

  for (const line of lines) input.write(`${line}\n`);
  input.end();
  await done;
  return text;
}

const TOOLS: ToolDescriptor[] = [
  { name: "health_check", description: "health" },
  { name: "noop", description: "noop" },
  { name: "get_logs", description: "logs" },
];

describe("runRepl dispatch", () => {
  it("calls a tool by name with JSON arguments", async () => {
    const d = fakeDispatcher(TOOLS);
    await runScript(['noop {"input":"hi","upper":true}'], d);
    expect(d.calls).toEqual([{ name: "noop", args: { input: "hi", upper: true } }]);
  });

  it("calls a tool by name with no arguments", async () => {
    const d = fakeDispatcher(TOOLS);
    await runScript(["health_check"], d);
    expect(d.calls).toEqual([{ name: "health_check", args: {} }]);
  });

  it("reaches a tool that has no registered shortcut", async () => {
    // get_logs was advertised under "Available MCP tools:" but was previously
    // unreachable — no shortcut, and `raw` was broken by the tokenizer.
    const d = fakeDispatcher(TOOLS);
    await runScript(["get_logs {}"], d);
    expect(d.calls.map((c) => c.name)).toEqual(["get_logs"]);
  });

  it("`raw` survives a JSON payload with quoted keys", async () => {
    const d = fakeDispatcher(TOOLS);
    const out = await runScript(['raw {"name":"noop","arguments":{"input":"x"}}'], d);
    expect(d.calls).toEqual([{ name: "noop", args: { input: "x" } }]);
    expect(out).not.toContain("Invalid JSON");
  });

  it("prefers a shortcut over a same-named tool", async () => {
    const d = fakeDispatcher(TOOLS);
    await runScript(["noop one two"], d, [
      {
        command: "noop",
        tool: "noop",
        buildArgs: (a) => ({ input: a[0] ?? "", upper: a[1] === "upper" }),
      },
    ]);
    // Shortcut semantics (positional) win, so this is NOT parsed as JSON.
    expect(d.calls).toEqual([{ name: "noop", args: { input: "one", upper: false } }]);
  });

  it("reports invalid JSON with usage rather than a bare SyntaxError", async () => {
    const d = fakeDispatcher(TOOLS);
    const out = await runScript(["noop {nope}"], d);
    expect(out).toContain("Invalid JSON");
    expect(out).toContain("Usage:");
    expect(d.calls).toEqual([]);
  });

  it("still rejects a genuinely unknown command", async () => {
    const d = fakeDispatcher(TOOLS);
    const out = await runScript(["definitely_not_a_tool"], d);
    expect(out).toContain("Unknown command: definitely_not_a_tool");
    expect(d.calls).toEqual([]);
  });

  it("matches a tool name case-insensitively", async () => {
    const d = fakeDispatcher(TOOLS);
    await runScript(["NOOP {}"], d);
    expect(d.calls.map((c) => c.name)).toEqual(["noop"]);
  });

  it("lists every tool under help, all of which are now callable", async () => {
    const d = fakeDispatcher(TOOLS);
    const out = await runScript(["help"], d);
    for (const t of TOOLS) expect(out).toContain(t.name);
    expect(out).toContain("<tool> <json>");
  });

  it("resolves on EOF without an explicit quit", async () => {
    const d = fakeDispatcher(TOOLS);
    // runScript only returns because EOF settles the promise; a hang here
    // would fail the suite by timeout.
    await expect(runScript([], d)).resolves.toBeTypeOf("string");
  });

  it("still exits on quit", async () => {
    const d = fakeDispatcher(TOOLS);
    await expect(runScript(["quit"], d)).resolves.toBeTypeOf("string");
  });
});
