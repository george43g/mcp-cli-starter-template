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
  // Registered FIRST, so the marker is written before any cleanup that could
  // hang and trip the force-exit net. Without it `logStartup` had no
  // counterpart: every clean exit looked like a crash to the rule the generated
  // AGENTS.md states ("file without `shutdown` = crash"), and stdin EOF — the
  // most common exit of all, the MCP host going away — left no trace at all.
  // Found by the up-bank-mcp session, whose own repo had believed that rule for
  // months. NOT done inside the shutdown controller: EQStack and up-bank
  // already call `logShutdown` themselves and would get a duplicate line.
  registerCleanup(() => {
    logShutdown(getShutdownCause());
  });
  enableStdinEofDetection();
  enableOrphanWatchdog();
  installWatchdog();
  startHeapMonitor();
  logStartup(entrypoint);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
