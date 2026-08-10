/**
 * Generic interactive REPL for driving an MCP dispatcher in-process.
 *
 * Lifted from imsg-mcp/src/cli.ts:58-201 and generalized. Takes a tool
 * dispatcher (any callable that returns `{ content: [{type:"text",text}], isError? }`)
 * and exposes:
 *   - `tools`         list available tools
 *   - `help` / `?`    show help
 *   - `<tool> <json>` call any listed tool with JSON args
 *   - `raw <json>`    send raw {name, arguments} payload
 *   - `json`          toggle raw `structuredContent` output
 *   - `last-error`    reprint the last error
 *   - `quit` / `exit` exit (EOF also exits)
 *
 * No domain knowledge — a tool may additionally register a shortcut that takes
 * positional arguments instead of JSON. `formatResult` and `showMeta` give a
 * host a prettier view and a per-call timing/engine footer without this file
 * learning anything about the host's domain.
 *
 * The `<tool> <json>` line above was in this docblock for a long time before
 * anything implemented it: every tool name fell through to "Unknown command"
 * while `help` listed them all as available. It is real now. If you are
 * changing dispatch, `repl.test.ts` states the contract — including the three
 * quoting cases that a previous tokenizer got wrong.
 */

import { createInterface, type Interface } from "node:readline";
import { color } from "./color.js";

/**
 * One block of an MCP tool result.
 *
 * A discriminated union with NO catch-all member, which is deliberate. A
 * `{ type: string; … }` fallback overlaps `type: "text"`, so narrowing needs a
 * cast at every render site — and it would silently accept a block shape this
 * cannot render. Adding a member later is a compile error exactly where a
 * decision is needed, which is the point.
 *
 * `resource` and `audio` blocks are not modelled: no known caller emits them,
 * and guessing their shape from the spec rather than from a real producer is
 * how the text-only version of this type got written in the first place. The
 * renderer degrades gracefully if one arrives at runtime.
 */
export type ContentBlock =
  | { type: "text"; text: string }
  /** `data` is RAW base64 — no `data:` URI prefix, and not a path. */
  | { type: "image"; data: string; mimeType: string };

/**
 * Optionals are declared `?: T | undefined` rather than `?: T` so that a
 * consumer compiling with `exactOptionalPropertyTypes` can pass a result
 * through verbatim. Without it, `{ isError: undefined }` is rejected and every
 * such caller ends up writing conditional spreads to rebuild the object.
 */
export interface ToolCallResult {
  content?: ContentBlock[] | undefined;
  /** Machine-readable result, if the tool produced one. Shown by `json`. */
  structuredContent?: unknown;
  isError?: boolean | undefined;
  /** Perf footer from the dispatcher: `{ duration_ms, engine, ... }`. */
  _meta?: Record<string, unknown> | undefined;
}

export interface ToolDescriptor {
  name: string;
  description?: string;
}

export interface ReplDispatcher {
  listTools(): Promise<ToolDescriptor[]> | ToolDescriptor[];
  callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult>;
}

export interface ReplShortcut {
  /** Token typed by the user, e.g. `health`. */
  command: string;
  /** Tool name to invoke. */
  tool: string;
  /** Map positional args after the command into the tool's argument object. */
  buildArgs(args: string[]): Record<string, unknown>;
  /** Optional one-line description for `help`. */
  help?: string;
}

export interface RunReplOptions {
  prompt: string;
  dispatcher: ReplDispatcher;
  shortcuts?: ReplShortcut[];
  /** Greeting printed before the first prompt. */
  banner?: string;
  /** Stream of input to consume — defaults to process.stdin. Useful for tests. */
  input?: NodeJS.ReadableStream;
  /** Stream to write output to — defaults to process.stdout. */
  output?: NodeJS.WritableStream;
  /**
   * Pretty-printer for a successful result. Receives the whole result so it can
   * inspect `structuredContent`. Defaults to printing `content[0].text`.
   *
   * Not consulted in `json` mode — the point of that toggle is to see what the
   * tool actually returned, unformatted.
   */
  formatResult?(result: ToolCallResult): string;
  /** Print a dim `· 12ms · engine=ts` footer after each call. */
  showMeta?: boolean;
}

export interface ParsedInput {
  /** The command word, case preserved. */
  cmd: string;
  /**
   * Everything after the command word, VERBATIM — no quote stripping, no
   * splitting. This is what a JSON payload must be read from.
   */
  rest: string;
  /** `rest` split shell-style, for commands that take positional arguments. */
  args: string[];
}

/**
 * Split a REPL line into a command, the raw remainder, and shell-style args.
 *
 * The previous version returned only `{cmd, args}` and tokenised the whole
 * line, consuming every quote character as shell quoting. That destroyed any
 * JSON argument before the caller ever saw it —
 * `raw {"name":"x"}` arrived as `{name:x}`, so `JSON.parse` threw and the
 * `raw` command could not work at all. There was no escape hatch either,
 * because backslashes were not handled.
 *
 * The fix is to stop conflating two different jobs. Splitting shell-style
 * arguments and preserving a verbatim payload cannot both be done to the same
 * string, so this returns both views and lets each command take the one it
 * needs: `raw` and generic tool dispatch read `rest`, shortcuts read `args`.
 */
export function parseConsoleInput(line: string): ParsedInput {
  const trimmed = line.trim();
  const firstSpace = trimmed.search(/\s/);
  const cmd = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);
  const rest = firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1).trim();
  return { cmd, rest, args: tokenize(rest) };
}

/**
 * Shell-style tokenizer: quotes group, backslash escapes the next character.
 *
 * Deliberately minimal — it is for `noop hello upper`, not for reimplementing
 * a shell. But the escape handling is not optional: without it there is no way
 * to type a literal quote inside a quoted argument, which is the gap that left
 * the old parser with no workaround for its own quote stripping.
 */
function tokenize(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: string | null = null;
  let escaped = false;
  let started = false;

  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      started = true;
      continue;
    }
    if (quote === null && (char === '"' || char === "'")) {
      quote = char;
      // An empty quoted string is still an argument, so remember that this
      // token exists even if no characters are ever appended to it.
      started = true;
      continue;
    }
    if (char === quote) {
      quote = null;
      continue;
    }
    if (quote === null && /\s/.test(char)) {
      if (started) {
        parts.push(current);
        current = "";
        started = false;
      }
      continue;
    }
    current += char;
    started = true;
  }
  // A trailing backslash is a literal backslash rather than an error.
  if (escaped) current += "\\";
  if (started) parts.push(current);
  return parts;
}

/**
 * Parse a JSON argument, replacing the raw SyntaxError with something a REPL
 * user can act on. `Unexpected token } in JSON at position 14` says nothing
 * about what should have been typed.
 */
function parseJsonArg(text: string, usage: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON: ${(err as Error).message}\n  Usage: ${usage}`);
  }
}

/** Everything `printToolResult` needs that is not the result itself. */
interface PrintContext {
  out: NodeJS.WritableStream;
  formatResult?(result: ToolCallResult): string;
  showMeta?: boolean;
  /** Toggled by the `json` built-in. */
  rawMode: boolean;
  setLastError(text: string | null): void;
}

/**
 * Render the dispatcher's perf footer.
 *
 * Both `duration_ms` and `dur_ms` are accepted deliberately. `mcp-kit`'s
 * dispatcher emits `duration_ms` (`dispatch.ts`), but `dur_ms` is the name that
 * appears in downstream footers — a fork of this file read only `dur_ms` while
 * its own dispatcher wrote `duration_ms`, so in production its footer silently
 * rendered `engine=…` and never a timing. Its unit test passed because the fake
 * hand-wrote `dur_ms`. Accepting both costs one line and removes the trap.
 */
function metaFooter(meta: Record<string, unknown> | undefined): string | null {
  if (!meta) return null;
  const parts: string[] = [];
  const dur = meta.duration_ms ?? meta.dur_ms;
  if (dur !== undefined) parts.push(`${String(dur)}ms`);
  if (meta.engine !== undefined) parts.push(`engine=${String(meta.engine)}`);
  return parts.length > 0 ? `· ${parts.join(" · ")}` : null;
}

/** Decoded byte count of a base64 payload, accounting for `=` padding. */
function decodedBase64Bytes(data: string): number {
  if (data.length === 0) return 0;
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((data.length * 3) / 4) - padding);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/**
 * A one-line stand-in for a block that is not printable text.
 *
 * The size is DECODED bytes, not base64 characters. A downstream adapter
 * printed "84210 base64 chars", which is both a meaningless unit to a reader
 * and inflated by 4/3 against the number they would see on disk.
 */
function describeBlock(block: ContentBlock): string {
  if (block.type === "image") {
    return `[image ${block.mimeType}, ${formatBytes(decodedBase64Bytes(block.data))}]`;
  }
  // Unreachable through the type, but a real MCP server can send `resource` or
  // `audio` blocks. Render a placeholder rather than crashing the REPL on a
  // block shape this version does not model.
  const type = (block as { type?: unknown }).type;
  return `[${typeof type === "string" ? type : "unknown"}]`;
}

/**
 * Render blocks IN ORDER, one line per non-text block.
 *
 * Order is a dispatcher contract, not a presentation choice: a dispatcher that
 * appends its text block last (`[...extra, textBlock]`) means a screenshot
 * arrives as `[image, text]`, and reordering here would misreport what the
 * tool returned. Returns null when there is nothing to render, so the caller
 * can fall back to dumping the whole result.
 */
function renderContent(content: ContentBlock[] | undefined): string | null {
  if (!content || content.length === 0) return null;
  return content
    .map((block) => (block.type === "text" ? block.text : describeBlock(block)))
    .join("\n");
}

function printToolResult(ctx: PrintContext, result: ToolCallResult): void {
  if (result.isError) {
    const text = renderContent(result.content) ?? JSON.stringify(result, null, 2);
    ctx.setLastError(text);
    ctx.out.write(`${color.red(text)}\n`);
    return;
  }

  let body: string;
  if (ctx.rawMode && result.structuredContent !== undefined) {
    body = JSON.stringify(result.structuredContent, null, 2);
  } else if (ctx.formatResult) {
    body = ctx.formatResult(result);
  } else {
    body = renderContent(result.content) ?? JSON.stringify(result, null, 2);
  }
  ctx.out.write(`${body}\n`);

  if (ctx.showMeta) {
    const footer = metaFooter(result._meta);
    if (footer) ctx.out.write(`${color.dim(footer)}\n`);
  }
}

/**
 * Run the REPL until `quit`/`exit` or end of input.
 *
 * Input is consumed through a serial QUEUE, not a recursive `rl.question`.
 * That distinction is the whole reason this function looks the way it does, so
 * do not "simplify" it back:
 *
 * `rl.question()` arms a ONE-SHOT listener. While an async command is being
 * awaited there is no listener armed at all, so any line readline has already
 * buffered — which, for a pipe, is usually all of them — is emitted into
 * nothing and lost forever. `printf 'help\ntools\nquit\n' | mytool console` ran
 * only `help`, and then EOF closed the stream cleanly, so the loss was silent.
 *
 * Two independent downstream consumers reported this before the test suite
 * could express it: every scripted test fed exactly one line, and the test
 * dispatcher resolved on the microtask queue, so every `await` settled before
 * readline could have emitted a second line. See `repl.test.ts` and its
 * `slowDispatcher`, which is deliberately hostile for that reason.
 */
export async function runRepl(opts: RunReplOptions): Promise<void> {
  const out = opts.output ?? process.stdout;
  const inp = opts.input ?? process.stdin;
  const shortcuts = new Map<string, ReplShortcut>();
  for (const s of opts.shortcuts ?? []) {
    shortcuts.set(s.command, s);
  }

  let lastError: string | null = null;
  const ctx: PrintContext = {
    out,
    // Spread rather than assign: `exactOptionalPropertyTypes` rejects an
    // explicit `undefined` for an optional property.
    ...(opts.formatResult ? { formatResult: opts.formatResult } : {}),
    ...(opts.showMeta ? { showMeta: opts.showMeta } : {}),
    rawMode: false,
    setLastError: (t) => {
      lastError = t;
    },
  };

  // Interactive vs piped. When stdin is a pipe there is nobody to read a
  // banner or a prompt, but there IS usually something parsing stdout — so
  // emitting them corrupts the output. Three separate sources of that noise:
  // the banner, the prompt, and readline's echo of the piped input.
  //
  // `... | tool repl | jq .` could never work before this. Reported by the
  // browser-tab consumer; the test suite could not see it because a
  // PassThrough is already non-TTY and every assertion used `toContain`,
  // which leading noise does not disturb.
  const interactive = Boolean((inp as { isTTY?: boolean }).isTTY);

  if (opts.banner && interactive) {
    out.write(`${opts.banner}\n`);
  }

  // Interactive keeps `output` and readline's terminal handling: writing the
  // prompt by hand would work, but it costs history, arrow keys and readline's
  // SIGINT handling for the primary use. Piped drops both — `terminal: false`
  // is what stops readline echoing the input it just consumed.
  const rl: Interface = interactive
    ? createInterface({ input: inp, output: out })
    : createInterface({ input: inp, terminal: false });
  const promptStr = color.cyan(`${opts.prompt}> `);

  /** No-op when piped — see `interactive` above. */
  const showPrompt = () => {
    if (!interactive) return;
    rl.setPrompt(promptStr);
    rl.prompt();
  };

  return new Promise<void>((resolveRepl) => {
    const queue: string[] = [];
    let processing = false;
    let closed = false;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      resolveRepl();
    };

    /**
     * Settle only once the stream is done AND the queue has fully drained.
     *
     * Resolving straight from `"close"` is the subtler half of the same bug:
     * readline emits `"close"` at EOF while the pump may still be awaiting a
     * command with more lines queued behind it, so an unconditional resolve
     * truncates the tail of a real pipe even with the queue in place.
     */
    const maybeFinish = () => {
      if (closed && !processing && queue.length === 0) finish();
    };

    /** Handle one line. Returns `false` when the REPL should exit. */
    async function handleLine(line: string): Promise<boolean> {
      const trimmed = line.trim();
      if (!trimmed) return true;

      const { cmd: rawCmd, rest, args } = parseConsoleInput(trimmed);
      // Built-ins stay case-insensitive (`HELP` has always worked), but the
      // command word itself keeps its case so a tool named `getLogs` can be
      // matched. The old parser lowercased everything, which made any tool
      // with an uppercase letter permanently unreachable.
      const cmd = rawCmd.toLowerCase();

      try {
        if (cmd === "quit" || cmd === "exit") return false;

        if (cmd === "help" || cmd === "?") {
          const tools = await opts.dispatcher.listTools();
          out.write(color.bold("Commands:\n"));
          out.write("  help, ?          Show this help\n");
          out.write("  tools            List MCP tools\n");
          out.write("  <tool> <json>    Call a tool with JSON arguments\n");
          out.write("  raw <json>       Send raw {name,arguments} payload\n");
          // Reflects the LIVE toggle state, not a static string — the whole
          // value of the command is knowing which mode you are in.
          out.write(
            `  json             Toggle raw structuredContent output (now ${ctx.rawMode ? "on" : "off"})\n`,
          );
          out.write("  last-error       Reprint the last error\n");
          out.write("  quit, exit       Exit the REPL\n");
          for (const s of shortcuts.values()) {
            out.write(`  ${s.command}${s.help ? ` — ${s.help}` : ` (calls ${s.tool})`}\n`);
          }
          out.write(color.bold("\nAvailable MCP tools:\n"));
          for (const tool of tools) {
            out.write(`  ${tool.name}${tool.description ? ` — ${tool.description}` : ""}\n`);
          }
          return true;
        }

        if (cmd === "tools") {
          for (const tool of await opts.dispatcher.listTools()) {
            out.write(`${tool.name}${tool.description ? ` — ${tool.description}` : ""}\n`);
          }
          return true;
        }

        if (cmd === "json") {
          ctx.rawMode = !ctx.rawMode;
          out.write(color.dim(`raw JSON output ${ctx.rawMode ? "on" : "off"}\n`));
          return true;
        }

        if (cmd === "last-error") {
          out.write(lastError ? `${color.red(lastError)}\n` : color.dim("no errors yet\n"));
          return true;
        }

        if (cmd === "raw") {
          // `rest`, not `args.join(" ")` — the payload must reach JSON.parse
          // exactly as typed, quotes and all.
          if (!rest) throw new Error("Usage: raw '<json>'");
          const parsed = parseJsonArg(rest, 'raw \'{"name":"tool","arguments":{}}\'') as {
            name?: string;
            arguments?: Record<string, unknown>;
          };
          if (!parsed.name) throw new Error('Expected: raw \'{"name":"tool","arguments":{}}\'');
          const r = await opts.dispatcher.callTool(parsed.name, parsed.arguments ?? {});
          printToolResult(ctx, r);
          return true;
        }

        // Shortcuts take positional args. Exact match first so a shortcut
        // can be capitalised; lowercase fallback preserves prior behaviour.
        const shortcut = shortcuts.get(rawCmd) ?? shortcuts.get(cmd);
        if (shortcut) {
          const r = await opts.dispatcher.callTool(shortcut.tool, shortcut.buildArgs(args));
          printToolResult(ctx, r);
          return true;
        }

        // Generic `<tool> <json>` dispatch. The docblock promised this and
        // `help` listed every registered tool under "Available MCP tools:",
        // but nothing implemented it — so most of what help advertised threw
        // "Unknown command". Rather than trim the advertisement, make it
        // true: any tool the dispatcher lists is now callable by name, and
        // `raw` goes back to being a fallback instead of the only route.
        const tool = (await opts.dispatcher.listTools()).find(
          (t) => t.name === rawCmd || t.name.toLowerCase() === cmd,
        );
        if (tool) {
          const toolArgs = rest
            ? (parseJsonArg(rest, `${tool.name} '{"key":"value"}'`) as Record<string, unknown>)
            : {};
          const r = await opts.dispatcher.callTool(tool.name, toolArgs);
          printToolResult(ctx, r);
          return true;
        }

        throw new Error(`Unknown command: ${rawCmd}. Type 'help' for available commands.`);
      } catch (err) {
        // Thrown errors count for `last-error` too, not just `isError` results
        // — an unparseable payload or an unknown command is exactly what you
        // want to re-read after the screen has scrolled.
        const message = (err as Error).message;
        ctx.setLastError(message);
        out.write(`${color.red(message)}\n`);
        return true;
      }
    }

    /** Drain the queue serially. Single-flight on `processing`. */
    async function pump(): Promise<void> {
      if (processing || finished) return;
      processing = true;
      try {
        // Re-check `queue.length` every iteration rather than snapshotting it:
        // lines pushed while an `await` was in flight belong to this drain.
        while (queue.length > 0 && !finished) {
          const line = queue.shift() as string;
          let keepGoing = true;
          try {
            keepGoing = await handleLine(line);
          } catch (err) {
            // `handleLine` catches its own command errors, so reaching here
            // means the loop itself faulted. Report and keep draining — an
            // escaping rejection would leave `processing` stuck true (queue
            // stalled forever) and surface as an unhandled rejection.
            out.write(`${color.red((err as Error).message)}\n`);
          }
          if (!keepGoing) {
            queue.length = 0;
            rl.close();
            finish();
            return;
          }
        }
      } finally {
        processing = false;
      }
      if (!finished && !closed) {
        showPrompt();
      }
      maybeFinish();
    }

    rl.on("line", (line) => {
      // A late `"line"` after the promise settled would run a command nobody
      // is waiting for.
      if (finished) return;
      queue.push(line);
      void pump();
    });

    rl.on("close", () => {
      closed = true;
      maybeFinish();
    });

    showPrompt();
  });
}
