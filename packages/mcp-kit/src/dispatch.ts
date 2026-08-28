/**
 * Dispatcher — the single place every MCP tool call passes through.
 *
 * DISPATCHER INVARIANTS (do not weaken without consulting AGENTS.md):
 *  1. Every tool runs through withTimeout — declare a per-tool timeout
 *     in ToolDefinition.timeoutMs or rely on MCP_TOOL_TIMEOUT_DEFAULT_MS.
 *  2. noteActivity() fires on every dispatch (feeds the idle watchdog).
 *  3. perf() span around every handler.
 *  4. Errors wrapped with actionable hint + tool name (never bare error.message).
 *  5. AbortSignal honored — long-running handlers check signal?.aborted
 *     between iterations and return early with a structured error.
 *  6. NEVER console.log after StdioServerTransport.connect() — JSON-RPC owns
 *     stdout. Log via @george43g/robustness/logger.
 *  7. Tool responses return { content, structuredContent } per the MCP spec,
 *     plus a perf footer (engine + dur_ms) in `_meta`.
 *
 * The exported `buildDispatcher` returns a function whose shape matches the
 * SDK's `CallToolRequest` handler.
 */

import { homedir } from "node:os";
import {
  envNum,
  error as logError,
  warn as logWarn,
  noteActivity,
  perf,
  ToolTimeoutError,
  withTimeout,
} from "@george43g/robustness";
import type { ZodError } from "zod";
import { wrapToolError } from "./prompt-injection.js";
import { sanitize } from "./sanitize.js";
import type { ContentBlock, ToolRegistry } from "./tool-registry.js";

/**
 * Replace the absolute home-directory prefix with `~` in anything headed for a
 * log sink.
 *
 * WHY THIS EXISTS, and why redaction does not already cover it.
 *
 * `err.stack` contains absolute paths ALWAYS — every frame carries one — and on
 * a normal machine every one of them starts with the user's home directory,
 * which contains their username. `@george43g/robustness`'s redactor has exactly
 * three rules at every published version: phone numbers, secret-shaped tokens,
 * and emails (opt-in, default off). **There is no filesystem-path rule, no URL
 * rule, and no free-text rule.** So an unmodified stack shipped to a log
 * collector carries an identifier that nothing downstream will strip.
 *
 * This is cheap and lossless for debugging: `~/repos/foo/src/bar.ts:12` locates
 * the frame exactly as well as the absolute path did.
 *
 * SCOPE, stated so nobody reads more into it than is there: this removes ONE
 * category — the home prefix. It does not make `err.message` safe. A throw that
 * interpolates a URL, an account number or a row of user data still logs it
 * verbatim, and no kit-side guard can know which of those a consumer's errors
 * carry. That check belongs in each consumer: assert your own throws do not
 * interpolate sensitive values.
 */
function scrubHome(text: string | null): string | undefined {
  if (text === null) return undefined;
  const home = homedir();
  return home.length > 1 ? text.split(home).join("~") : text;
}

export interface ToolResult {
  content: ContentBlock[];
  structuredContent?: unknown;
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

export interface DispatcherCounters {
  /** Total successful + failed tool calls. */
  toolCalls: number;
  /** Errors in the last 5 minutes (caller maintains via dispatcher hook). */
  recentErrors: number;
}

export interface BuildDispatcherOptions {
  registry: ToolRegistry;
  /** Called with the ToolTimeoutError / handler-thrown error to bump counters. */
  onError?: (toolName: string, err: unknown) => void;
  /** Called per dispatch (success or failure) to bump call counters. */
  onCall?: (toolName: string) => void;
  /** Engine label, e.g. "rust" or "ts". Surfaced in `_meta` and dev stats. */
  engineLabel?: () => string;
  /**
   * Whether `devOnly` tools are callable. Evaluated PER DISPATCH, not once at
   * construction, so flipping the env in a test takes effect immediately.
   *
   * REQUIRED IF — AND ONLY IF — the registry contains a `devOnly` tool. Omit it
   * with such a tool registered and `buildDispatcher` **throws**, naming the
   * offending tools. A registry with no `devOnly` tools never needs it and is
   * completely unaffected.
   *
   * Why a throw rather than a default, either way (1.0.0):
   *
   * Until 1.0.0 this was optional and omitting it left dev-only tools
   * **callable** — the gate did nothing unless the caller remembered it, which
   * is the failure mode `devOnly` exists to prevent. Two consumers independently
   * hit it, and one measured a dev-only log reader answering with a real payload
   * in a repo fronting a bank account.
   *
   * Flipping the default to fail-closed was the obvious fix and is NOT what this
   * does, because it leaves the real question unanswered: does `devOnly` mean
   * "hidden from the listing" or "not callable"? A default picks one silently.
   * Throwing makes the ambiguous state **unrepresentable** — you cannot have a
   * `devOnly` tool without saying when it is enabled — so `devOnly` genuinely is
   * a gate and the name stops lying, with no rename needed.
   *
   * The failure is loud, at construction, with a one-line fix, instead of silent
   * and at runtime.
   *
   * The gap it closes: `devOnly` was honoured only by `toMcpTools()`, so the
   * tool was hidden from `tools/list` and still executed if you named it
   * anyway, and every non-MCP caller (a CLI, a REPL tool list) bypassed the
   * filter entirely. **Hiding a tool is not disabling it.** Found and fixed in
   * browser-tab-mcp's vendored copy of this file.
   */
  devOnlyEnabled?: () => boolean;
}

export type Dispatch = (name: string, args: unknown, signal?: AbortSignal) => Promise<ToolResult>;

function defaultTimeoutMs(): number {
  return envNum("MCP_TOOL_TIMEOUT_DEFAULT_MS", 30_000);
}

function formatZodError(err: ZodError): string {
  return err.errors.map((e) => `  - ${e.path.join(".") || "(root)"}: ${e.message}`).join("\n");
}

export function buildDispatcher(opts: BuildDispatcherOptions): Dispatch {
  // Make the ambiguous state unrepresentable, at construction, before a single
  // request can be served. See `devOnlyEnabled` above for why this is a throw
  // rather than a default in either direction.
  if (opts.devOnlyEnabled === undefined) {
    const ungated = opts.registry.tools.filter((d) => d.devOnly === true).map((d) => d.name);
    if (ungated.length > 0) {
      throw new Error(
        `buildDispatcher: ${ungated.length} devOnly tool(s) registered with no devOnlyEnabled predicate: ` +
          `${ungated.join(", ")}.\n` +
          "  A devOnly tool with no predicate would be hidden from tools/list and still callable by name.\n" +
          '  Fix: pass devOnlyEnabled to buildDispatcher, e.g. `devOnlyEnabled: () => envBool("MCP_DEV", false)`.\n' +
          "  Or, if these tools are not meant to be gated at all, drop `devOnly` from their definitions.",
      );
    }
  }

  const fallback = defaultTimeoutMs();
  return async (name, args, signal) => {
    noteActivity();
    opts.onCall?.(name);
    const def = opts.registry.get(name);

    // A dev-only tool that is not enabled must be INDISTINGUISHABLE from one
    // that does not exist. A distinct "disabled" error confirms the tool is
    // there, which is the thing a gate exists to avoid.
    // Fail CLOSED in the residual case. The construction check above means a
    // devOnly tool always has a predicate — unless a registry gained one after
    // construction, which the readonly type discourages but does not prevent.
    // If that ever happens the tool is gated, not exposed.
    const devGated = def?.devOnly === true && !(opts.devOnlyEnabled?.() ?? false);

    if (!def || devGated) {
      opts.onError?.(name, new Error("unknown_tool"));
      return {
        content: [
          {
            type: "text",
            text: wrapToolError(name, "Unknown tool name.", "Check the result of tools/list."),
          },
        ],
        isError: true,
      };
    }

    const parsed = def.input.safeParse(args ?? {});
    if (!parsed.success) {
      opts.onError?.(name, parsed.error);
      return {
        content: [
          {
            type: "text",
            text: wrapToolError(
              name,
              "Invalid arguments:",
              `\n${formatZodError(parsed.error as ZodError)}`,
            ),
          },
        ],
        isError: true,
      };
    }

    const span = perf(`dispatch.${name}`);
    const timeoutMs = def.timeoutMs ?? fallback;

    try {
      const result = await withTimeout(name, () => def.handler(parsed.data, signal), timeoutMs);
      const dur = span.end({ engine: opts.engineLabel?.() ?? "ts" });
      const textBlock: ContentBlock = {
        type: "text",
        text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
      };
      // Media blocks lead, the JSON summary follows: a screenshot tool returns
      // `[image, text]`. Renderers depend on that order — cli-kit's prints the
      // image line above the payload — so it is a contract, not a detail.
      let extra: ContentBlock[] = [];
      if (def.toContent) {
        try {
          extra = def.toContent(result);
        } catch (err) {
          logWarn(`to_content_failed: ${name}`, { message: (err as Error)?.message });
        }
      }
      return {
        content: [...extra, textBlock],
        structuredContent: result,
        _meta: {
          engine: opts.engineLabel?.() ?? "ts",
          duration_ms: Math.round(dur * 10) / 10,
        },
      };
    } catch (err) {
      span.end({ error: true });
      opts.onError?.(name, err);
      logError(`dispatch_error: ${name}`, {
        message: scrubHome(sanitize((err as Error)?.message, 1024)),
        stack: scrubHome(sanitize((err as Error)?.stack, 4096)),
      });
      const message =
        err instanceof ToolTimeoutError
          ? `Timed out after ${err.timeoutMs}ms. The server has unblocked; the underlying work may still be running.`
          : ((err as Error)?.message ?? String(err));
      return {
        content: [{ type: "text", text: wrapToolError(name, message) }],
        isError: true,
      };
    }
  };
}
