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
  // Registered LAST on purpose. The controller's `exit` listener sweeps the
  // whole cleanup registry synchronously, so a marker registered last still
  // runs when an earlier cleanup hangs and trips the force-exit net. Registering
  // it FIRST instead emits the line TWICE in that case — once in the async pass,
  // once in the sweep — which corrupts anything counting shutdowns. Measured on
  // robustness 0.8.1, marker-first + hanging co-cleanup = 2 lines, marker-last
  // = 1, both clean cases = 1.
  //
  // NOT done inside the shutdown controller: EQStack and up-bank-mcp already
  // call `logShutdown` themselves and would get a duplicate line. The transport
  // is also the component that owns stdout, so the decision belongs here.
  registerCleanup(() => {
    logShutdown(getShutdownCause());
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
