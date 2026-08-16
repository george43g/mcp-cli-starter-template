/**
 * stdio transport bootstrap.
 *
 * Wires an MCP `Server` instance to `StdioServerTransport` with the
 * standard set of lifecycle handlers (shutdown, stdin EOF, orphan watch,
 * watchdog, heap monitor).
 *
 * Critical invariant after this returns: NEVER write to stdout. JSON-RPC
 * owns it. All logging must go through @george43g/robustness/logger.
 */

import {
  enableOrphanWatchdog,
  enableStdinEofDetection,
  getShutdownCause,
  installShutdownHandlers,
  installWatchdog,
  logShutdown,
  logStartup,
  registerCleanup,
  startHeapMonitor,
} from "@george43g/robustness";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

export interface StartStdioOptions {
  server: Server;
  entrypoint: string;
}

export async function startStdio({ server, entrypoint }: StartStdioOptions): Promise<void> {
  installShutdownHandlers();
  enableStdinEofDetection();
  enableOrphanWatchdog();
  installWatchdog();
  startHeapMonitor();
  logStartup(entrypoint);

  // Without this, `logStartup` has no counterpart: every clean exit looks like
  // a crash to the rule AGENTS.md states ("file without `shutdown` = crash"),
  // and stdin EOF — the MCP host going away, the most common exit of all —
  // leaves no trace at all.
  //
  // Write-once, two ways, because either alone is insufficient.
  //
  // Registered LAST: the controller's `exit` listener sweeps the whole cleanup
  // registry synchronously, so a cleanup the async pass already ran executes a
  // SECOND time when a later one hangs and trips the force-exit net. Last is
  // the position where the sweep is the only invocation.
  //
  // Guarded as well, because "last" is not a position you can hold. Anything
  // registering a cleanup at RUNTIME lands after this one — a lazily armed
  // watcher in a tool handler, an ink component registering on mount (tui-kit's
  // FullScreenInk does exactly that). Measured on robustness 0.8.1: marker
  // registered last, then a runtime registration that hangs → 2 lines unguarded,
  // 1 guarded.
  //
  // NOT done inside the shutdown controller: EQStack and up-bank-mcp already
  // call `logShutdown` themselves and would get a duplicate line. The transport
  // is also the component that owns stdout, so the decision belongs here.
  let markerWritten = false;
  registerCleanup(() => {
    if (markerWritten) return;
    markerWritten = true;
    logShutdown(getShutdownCause());
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
