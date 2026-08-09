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

interface RecordingDispatcher extends ReplDispatcher {
  calls: Array<{ name: string; args: Record<string, unknown> }>;
  listToolsCount: number;
}

/** Records every callTool so a test can assert on name AND arguments. */
function fakeDispatcher(tools: ToolDescriptor[]): RecordingDispatcher {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const d: RecordingDispatcher = {
    calls,
    listToolsCount: 0,
    listTools: () => {
      d.listToolsCount += 1;
      return tools;
    },
    async callTool(name, args) {
      calls.push({ name, args });
      return { content: [{ type: "text", text: `ok:${name}` }] };
    },
  };
  return d;
}

/** Yield past the microtask queue, so pending I/O events actually get to run. */
const yieldToMacrotask = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

/**
 * The same dispatcher, but hostile: every method yields to the MACROTASK queue
 * before returning.
 *
 * This is the difference between a suite that catches the piped-input bug and
 * one that does not. `fakeDispatcher` resolves on the microtask queue, so every
 * `await` in the REPL settles before readline gets a turn to emit its next
 * buffered line — which means a loop that arms only a one-shot listener looks
 * correct. Real dispatchers do I/O. This one models that, and nothing else.
 *
 * Generalised as DEFERRED #26: a test double that is friendlier than production
 * proves nothing about a guard or a loop.
 */
function slowDispatcher(tools: ToolDescriptor[]): RecordingDispatcher {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const d: RecordingDispatcher = {
    calls,
    listToolsCount: 0,
    async listTools() {
      await yieldToMacrotask();
      d.listToolsCount += 1;
      return tools;
    },
    async callTool(name, args) {
      await yieldToMacrotask();
      calls.push({ name, args });
      return { content: [{ type: "text", text: `ok:${name}` }] };
    },
  };
  return d;
}

/**
 * Drive the REPL with a fixed script and collect its output.
 *
 * Relies on EOF resolving the promise — ending the input stream is how the run
 * terminates. Before that was handled, this helper would hang forever.
 */
type ExtraReplOptions = Partial<Omit<Parameters<typeof runRepl>[0], "dispatcher" | "input">>;

async function runScript(
  lines: string[],
  dispatcher: ReplDispatcher,
  shortcuts?: Parameters<typeof runRepl>[0]["shortcuts"],
  extra?: ExtraReplOptions,
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
    ...extra,
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

/**
 * Piped multi-command input — the case that was never tested.
 *
 * Every one of the eleven `runScript` calls above passes exactly ONE line, so a
 * loop that drops everything after the first command satisfied all of them. Two
 * independent downstream consumers reported the truncation before this suite
 * could express it; DEFERRED #16a was closed on the false claim that these
 * tests already covered it.
 *
 * Every case here uses `slowDispatcher`. Against `fakeDispatcher` they pass
 * even on the broken loop, which is precisely the point.
 */
describe("runRepl over piped multi-command input", () => {
  it("runs every command in a multi-line script, in order", async () => {
    const d = slowDispatcher(TOOLS);
    await runScript(['noop {"a":1}', 'noop {"a":2}', "health_check", "quit"], d);
    expect(d.calls).toEqual([
      { name: "noop", args: { a: 1 } },
      { name: "noop", args: { a: 2 } },
      { name: "health_check", args: {} },
    ]);
  });

  it("runs built-ins that are queued behind an awaited command", async () => {
    const d = slowDispatcher(TOOLS);
    // `help` and `tools` each consult the dispatcher, so the count proves both
    // executed rather than only the first surviving the one-shot listener.
    await runScript(["help", "tools", "quit"], d);
    expect(d.listToolsCount).toBe(2);
  });

  it("drains queued lines when the stream ends without an explicit quit", async () => {
    // EOF is the dangerous moment: readline emits "close" while the loop is
    // still awaiting, so a `close` handler that resolves unconditionally
    // truncates the tail of a real pipe.
    const d = slowDispatcher(TOOLS);
    await runScript(['noop {"a":1}', 'noop {"a":2}', 'noop {"a":3}'], d);
    expect(d.calls.map((c) => c.args)).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
  });

  it("keeps going after a command that errors", async () => {
    const d = slowDispatcher(TOOLS);
    const out = await runScript(["noop {nope}", 'noop {"a":2}', "quit"], d);
    expect(out).toContain("Invalid JSON");
    expect(d.calls).toEqual([{ name: "noop", args: { a: 2 } }]);
  });

  it("stops at quit and ignores everything after it", async () => {
    const d = slowDispatcher(TOOLS);
    await runScript(['noop {"a":1}', "quit", 'noop {"a":2}'], d);
    expect(d.calls).toEqual([{ name: "noop", args: { a: 1 } }]);
  });

  it("skips blank lines without dropping the commands around them", async () => {
    const d = slowDispatcher(TOOLS);
    await runScript(['noop {"a":1}', "", "   ", 'noop {"a":2}', "quit"], d);
    expect(d.calls.map((c) => c.args)).toEqual([{ a: 1 }, { a: 2 }]);
  });
});

/**
 * A dispatcher whose results carry everything the observability features read:
 * a text body, a `structuredContent` that differs from it, and a `_meta`
 * footer. `metaKey` selects which timing name the footer is written under.
 */
function richDispatcher(metaKey: "duration_ms" | "dur_ms" = "duration_ms"): ReplDispatcher {
  return {
    listTools: () => TOOLS,
    async callTool(name) {
      if (name === "health_check") {
        return {
          content: [{ type: "text", text: "human-readable health" }],
          structuredContent: { status: "healthy", pid: 42 },
          _meta: { [metaKey]: 12.5, engine: "ts" },
        };
      }
      return {
        content: [{ type: "text", text: "boom" }],
        isError: true,
      };
    },
  };
}

describe("runRepl observability", () => {
  it("prints content text by default", async () => {
    const out = await runScript(["health_check", "quit"], richDispatcher());
    expect(out).toContain("human-readable health");
    expect(out).not.toContain('"pid"');
  });

  it("`json` toggles structuredContent on, and back off again", async () => {
    const out = await runScript(
      ["health_check", "json", "health_check", "json", "health_check", "quit"],
      richDispatcher(),
    );
    // Off → on → off, so the structured view appears exactly once.
    expect(out.match(/"pid": 42/g)).toHaveLength(1);
    expect(out.match(/human-readable health/g)).toHaveLength(2);
  });

  it("`help` reports the live json toggle state", async () => {
    const out = await runScript(["help", "json", "help", "quit"], richDispatcher());
    expect(out).toContain("(now off)");
    expect(out).toContain("(now on)");
  });

  it("uses formatResult when given, and it can read structuredContent", async () => {
    const out = await runScript(["health_check", "quit"], richDispatcher(), undefined, {
      formatResult: (r) => `formatted:${(r.structuredContent as { status: string }).status}`,
    });
    expect(out).toContain("formatted:healthy");
    expect(out).not.toContain("human-readable health");
  });

  it("`json` outranks formatResult — the point is to see the raw result", async () => {
    const out = await runScript(["json", "health_check", "quit"], richDispatcher(), undefined, {
      formatResult: () => "formatted",
    });
    expect(out).toContain('"pid": 42');
    expect(out).not.toContain("formatted");
  });

  it("showMeta prints a timing/engine footer", async () => {
    const out = await runScript(["health_check", "quit"], richDispatcher(), undefined, {
      showMeta: true,
    });
    expect(out).toContain("12.5ms");
    expect(out).toContain("engine=ts");
  });

  it("reads the timing under `dur_ms` as well as `duration_ms`", async () => {
    // The fork this feature came from read only `dur_ms` while its own
    // dispatcher wrote `duration_ms`, so its footer never showed a timing in
    // production. Both names are accepted so neither side can be wrong.
    const out = await runScript(["health_check", "quit"], richDispatcher("dur_ms"), undefined, {
      showMeta: true,
    });
    expect(out).toContain("12.5ms");
  });

  it("prints no footer when showMeta is off", async () => {
    const out = await runScript(["health_check", "quit"], richDispatcher(), undefined, {
      showMeta: false,
    });
    expect(out).not.toContain("engine=ts");
  });

  it("`last-error` says so before anything has failed", async () => {
    const out = await runScript(["last-error", "quit"], richDispatcher());
    expect(out).toContain("no errors yet");
  });

  it("`last-error` reprints an isError result", async () => {
    const out = await runScript(["noop {}", "last-error", "quit"], richDispatcher());
    expect(out.match(/boom/g)).toHaveLength(2);
  });

  it("`last-error` reprints a thrown error too", async () => {
    // Parse failures and unknown commands never reach printToolResult, so they
    // have to be captured in the catch or they are unrecoverable once scrolled.
    const out = await runScript(["definitely_not_a_tool", "last-error", "quit"], richDispatcher());
    expect(out.match(/Unknown command: definitely_not_a_tool/g)).toHaveLength(2);
  });
});
