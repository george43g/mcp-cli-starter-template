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
import {
  type ContentBlock,
  parseConsoleInput,
  type ReplDispatcher,
  runRepl,
  type ToolDescriptor,
} from "./repl.js";

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

describe("runRepl piped output", () => {
  /**
   * Reported by the browser-tab consumer: `... | tool repl | jq .` can never
   * work, because the banner, the prompt, and readline's echo of the piped
   * input all land on stdout alongside the results.
   *
   * A PassThrough has no `isTTY`, so these tests already exercise the
   * non-interactive path — which is exactly why the defect was invisible: the
   * suite asserted with `toContain`, and extra leading noise never fails that.
   */
  it("writes no banner when input is not a TTY", async () => {
    const d = fakeDispatcher(TOOLS);
    const text = await runScript(["health_check"], d, undefined, {
      banner: "WELCOME-BANNER-SENTINEL",
    });
    expect(text).not.toContain("WELCOME-BANNER-SENTINEL");
  });

  it("writes no prompt when input is not a TTY", async () => {
    const d = fakeDispatcher(TOOLS);
    const text = await runScript(["health_check"], d);
    expect(text).not.toContain("test>");
  });

  /**
   * The discrimination check. Without this, "no banner when piped" is also
   * satisfied by deleting the banner entirely — the interactive path is the
   * primary use and must keep its chrome.
   */
  it("still writes the banner and prompt when input IS a TTY", async () => {
    const input = new PassThrough() as PassThrough & { isTTY?: boolean };
    input.isTTY = true;
    const output = new PassThrough();
    let text = "";
    output.on("data", (c: Buffer) => {
      text += c.toString();
    });

    const done = runRepl({
      prompt: "test",
      dispatcher: fakeDispatcher(TOOLS),
      input,
      output,
      banner: "WELCOME-BANNER-SENTINEL",
    });
    input.write("health_check\n");
    input.end();
    await done;

    expect(text).toContain("WELCOME-BANNER-SENTINEL");
    expect(text).toContain("test>");
  });

  it("emits the result and nothing else, so the stream stays parseable", async () => {
    const d = fakeDispatcher(TOOLS);
    const text = await runScript(["health_check"], d, undefined, {
      banner: "WELCOME-BANNER-SENTINEL",
    });
    // The strict form: output is EXACTLY what the dispatcher produced. Asserting
    // absence of known chrome would pass again the moment a new prefix is added.
    expect(text).toBe("ok:health_check\n");
  });
});

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

/**
 * Non-text content blocks.
 *
 * `ToolCallResult.content` was `Array<{ type: string; text: string }>` — a shape
 * no MCP server with an image tool can satisfy. Two consumers found it
 * under-modelled in one day, which is the signal that the type was wrong rather
 * than the usage. The union is closed on purpose; these cover what the renderer
 * does with it.
 */
describe("runRepl content blocks", () => {
  const PNG_1KB = "A".repeat(1364); // 1364 base64 chars -> 1023 decoded bytes

  function blockDispatcher(content: ContentBlock[]): ReplDispatcher {
    return {
      listTools: () => TOOLS,
      async callTool() {
        await yieldToMacrotask();
        return { content };
      },
    };
  }

  it("renders an image block as a one-line descriptor with its DECODED size", async () => {
    const out = await runScript(
      ["noop {}"],
      blockDispatcher([{ type: "image", data: PNG_1KB, mimeType: "image/jpeg" }]),
    );
    // Not "1364 base64 chars": a meaningless unit, inflated 4/3 over the real size.
    expect(out).toContain("[image image/jpeg, 1023 B]");
    expect(out).not.toContain("base64");
  });

  it("scales the size unit", async () => {
    const out = await runScript(
      ["noop {}"],
      blockDispatcher([{ type: "image", data: "B".repeat(84210), mimeType: "image/png" }]),
    );
    expect(out).toMatch(/\[image image\/png, 61\.7 KB\]/);
  });

  it("preserves dispatcher block ORDER — [image, text] renders image first", async () => {
    // mcp-kit-style dispatchers append the text block last (`[...extra, text]`),
    // so a screenshot arrives as [image, text]. Reordering would misreport it.
    const out = await runScript(
      ["noop {}"],
      blockDispatcher([
        { type: "image", data: PNG_1KB, mimeType: "image/jpeg" },
        { type: "text", text: '{"saved":true}' },
      ]),
    );
    const image = out.indexOf("[image");
    const text = out.indexOf('{"saved":true}');
    expect(image).toBeGreaterThan(-1);
    expect(text).toBeGreaterThan(-1);
    expect(image).toBeLessThan(text);
  });

  it("puts the meta footer after ALL blocks", async () => {
    const d: ReplDispatcher = {
      listTools: () => TOOLS,
      async callTool() {
        return {
          content: [
            { type: "image", data: PNG_1KB, mimeType: "image/jpeg" },
            { type: "text", text: "done" },
          ] as ContentBlock[],
          _meta: { duration_ms: 12, engine: "ts" },
        };
      },
    };
    const out = await runScript(["noop {}"], d, undefined, { showMeta: true });
    expect(out.indexOf("· 12ms · engine=ts")).toBeGreaterThan(out.indexOf("done"));
  });

  it("still renders a text-only result unchanged", async () => {
    const out = await runScript(["noop {}"], blockDispatcher([{ type: "text", text: "plain" }]));
    expect(out).toContain("plain");
  });

  it("does not crash on a block type the union does not model", async () => {
    // A real server can send `resource` or `audio`. The type is closed so that
    // adding one is a deliberate compile error, but the RENDERER must degrade
    // rather than take the REPL down with it.
    const rogue = [{ type: "resource", uri: "file:///x" }] as unknown as ContentBlock[];
    const out = await runScript(["noop {}"], blockDispatcher(rogue));
    expect(out).toContain("[resource]");
  });

  it("reports an error result carried in a text block", async () => {
    const d: ReplDispatcher = {
      listTools: () => TOOLS,
      async callTool() {
        return { content: [{ type: "text" as const, text: "boom" }], isError: true };
      },
    };
    const out = await runScript(["noop {}", "last-error"], d);
    expect(out).toContain("boom");
  });
});

describe("content block size formatting", () => {
  function imageDispatcher(data: string, mimeType = "image/png"): ReplDispatcher {
    return {
      listTools: () => TOOLS,
      async callTool() {
        return { content: [{ type: "image" as const, data, mimeType }] };
      },
    };
  }

  it("reports B, KB and MB", async () => {
    // No padding: decoded = floor(len * 3 / 4).
    expect(await runScript(["noop {}"], imageDispatcher("A".repeat(8)))).toContain("6 B");
    expect(await runScript(["noop {}"], imageDispatcher("A".repeat(4096)))).toContain("3.0 KB");
    expect(await runScript(["noop {}"], imageDispatcher("A".repeat(1_400_000)))).toContain(
      "1.0 MB",
    );
  });

  it("subtracts base64 padding from the decoded size", async () => {
    // "AAAAAA==" is 8 chars -> 6 raw -> 4 real bytes. Ignoring padding would
    // overstate every image whose length is not a multiple of 3.
    expect(await runScript(["noop {}"], imageDispatcher("AAAAAA=="))).toContain("4 B");
    expect(await runScript(["noop {}"], imageDispatcher("AAAAAAA="))).toContain("5 B");
  });

  it("handles an empty payload without dividing by nothing", async () => {
    expect(await runScript(["noop {}"], imageDispatcher(""))).toContain("0 B");
  });

  it("falls back to 'unknown' when a block's type is not even a string", async () => {
    const rogue = [{ type: 42 }] as unknown as ContentBlock[];
    const d: ReplDispatcher = {
      listTools: () => TOOLS,
      async callTool() {
        return { content: rogue };
      },
    };
    expect(await runScript(["noop {}"], d)).toContain("[unknown]");
  });
});
