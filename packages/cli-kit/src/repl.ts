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
 *   - `quit` / `exit` exit (EOF also exits)
 *
 * No domain knowledge — a tool may additionally register a shortcut that takes
 * positional arguments instead of JSON.
 *
 * The `<tool> <json>` line above was in this docblock for a long time before
 * anything implemented it: every tool name fell through to "Unknown command"
 * while `help` listed them all as available. It is real now. If you are
 * changing dispatch, `repl.test.ts` states the contract — including the three
 * quoting cases that a previous tokenizer got wrong.
 */

import { createInterface, type Interface } from "node:readline";
import { color } from "./color.js";

export interface ToolCallResult {
  content?: Array<{ type: string; text: string }>;
  isError?: boolean;
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

async function printToolResult(out: NodeJS.WritableStream, result: ToolCallResult): Promise<void> {
  const text = result.content?.[0]?.text ?? JSON.stringify(result, null, 2);
  if (result.isError) {
    out.write(`${color.red(text)}\n`);
    return;
  }
  out.write(`${text}\n`);
}

export async function runRepl(opts: RunReplOptions): Promise<void> {
  const out = opts.output ?? process.stdout;
  const inp = opts.input ?? process.stdin;
  const shortcuts = new Map<string, ReplShortcut>();
  for (const s of opts.shortcuts ?? []) {
    shortcuts.set(s.command, s);
  }

  if (opts.banner) {
    out.write(`${opts.banner}\n`);
  }

  const rl: Interface = createInterface({ input: inp, output: out });

  return new Promise<void>((resolveRepl) => {
    // Resolve on EOF as well as on `quit`. Without this a piped or redirected
    // stdin runs out of input and the returned promise never settles — the
    // process just hangs after the last line. It also makes the REPL testable
    // at all: a test feeding a fixed script has no way to send `quit` after
    // asserting on output.
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolveRepl();
    };
    rl.on("close", finish);

    const prompt = () => {
      if (done) return;
      rl.question(color.cyan(`${opts.prompt}> `), async (line) => {
        const trimmed = line.trim();
        if (!trimmed) {
          prompt();
          return;
        }
        const { cmd: rawCmd, rest, args } = parseConsoleInput(trimmed);
        // Built-ins stay case-insensitive (`HELP` has always worked), but the
        // command word itself keeps its case so a tool named `getLogs` can be
        // matched. The old parser lowercased everything, which made any tool
        // with an uppercase letter permanently unreachable.
        const cmd = rawCmd.toLowerCase();

        try {
          if (cmd === "quit" || cmd === "exit") {
            rl.close();
            finish();
            return;
          }
          if (cmd === "help" || cmd === "?") {
            const tools = await opts.dispatcher.listTools();
            out.write(color.bold("Commands:\n"));
            out.write("  help, ?          Show this help\n");
            out.write("  tools            List MCP tools\n");
            out.write("  <tool> <json>    Call a tool with JSON arguments\n");
            out.write("  raw <json>       Send raw {name,arguments} payload\n");
            out.write("  quit, exit       Exit the REPL\n");
            for (const s of shortcuts.values()) {
              out.write(`  ${s.command}${s.help ? ` — ${s.help}` : ` (calls ${s.tool})`}\n`);
            }
            out.write(color.bold("\nAvailable MCP tools:\n"));
            for (const tool of tools) {
              out.write(`  ${tool.name}${tool.description ? ` — ${tool.description}` : ""}\n`);
            }
            prompt();
            return;
          }
          if (cmd === "tools") {
            for (const tool of await opts.dispatcher.listTools()) {
              out.write(`${tool.name}${tool.description ? ` — ${tool.description}` : ""}\n`);
            }
            prompt();
            return;
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
            await printToolResult(out, r);
            prompt();
            return;
          }

          // Shortcuts take positional args. Exact match first so a shortcut
          // can be capitalised; lowercase fallback preserves prior behaviour.
          const shortcut = shortcuts.get(rawCmd) ?? shortcuts.get(cmd);
          if (shortcut) {
            const r = await opts.dispatcher.callTool(shortcut.tool, shortcut.buildArgs(args));
            await printToolResult(out, r);
            prompt();
            return;
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
            await printToolResult(out, r);
            prompt();
            return;
          }

          throw new Error(`Unknown command: ${rawCmd}. Type 'help' for available commands.`);
        } catch (err) {
          out.write(`${color.red((err as Error).message)}\n`);
          prompt();
        }
      });
    };
    prompt();
  });
}
