/**
 * Per-tool timeout wrapper.
 *
 * Library-eligible: no project-specific imports. Caller supplies the timeout
 * value (typically from a per-tool map plus a default).
 *
 * Behaviour:
 * - timeoutMs <= 0 disables the wrapper (the underlying promise runs unbounded).
 * - On timeout, throws ToolTimeoutError. The orphaned in-flight promise is NOT
 *   cancelled (Promise.race semantics) — the watchdog's event-loop monitor is
 *   the safety net for runaway work.
 * - The internal timer is .unref()'d so it never prevents process exit.
 * - MCP_TOOL_TIMEOUT_FORCE_MS overrides every per-tool timeout — useful for
 *   stress testing and incident response. Use sparingly.
 */

import { envNum } from "./env.js";

export class ToolTimeoutError extends Error {
  constructor(
    /**
     * Kept as `toolName`, NOT renamed to `label` alongside the parameter below.
     * This field is public API of a published package: any consumer on ^0.5.x
     * reading `err.toolName` would break, and `mcp-kit`'s dispatch layer models
     * exactly that `instanceof` + field-read pattern.
     */
    public readonly toolName: string,
    public readonly timeoutMs: number,
  ) {
    super(`Tool "${toolName}" timed out after ${timeoutMs}ms`);
    this.name = "ToolTimeoutError";
  }
}

/**
 * Race `fn()` against a timeout.
 *
 * The first parameter is `label`, matching `RetryOptions.label`. It used to be
 * `toolName`, which is MCP vocabulary in a utility that is otherwise generic —
 * a downstream consumer wrapping non-tool work asked for the rename. It is safe
 * to change: TypeScript ignores parameter names for call compatibility, and
 * every call site passes it positionally.
 */
export async function withTimeout<T>(
  label: string,
  fn: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const forced = envNum("MCP_TOOL_TIMEOUT_FORCE_MS", 0);
  const effective = forced > 0 ? forced : timeoutMs;
  if (effective <= 0) return fn();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // `label` in, `toolName` out — the two names are deliberately different.
      // See the comment on the field; do not "tidy" this into one word.
      reject(new ToolTimeoutError(label, effective));
    }, effective);
    timer.unref();
  });

  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
