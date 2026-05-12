/**
 * MCP server entry — stdio by default, --http for Streamable HTTP.
 *
 * Bin: `{{name}}-mcp` (also invoked via `pnpm mcp` or `pnpm dev:mcp`).
 *
 * INVARIANT: never console.log after the stdio transport opens. All output
 * goes through @george43g/robustness/logger.
 *
 * To remove HTTP support: delete the --http branch + the transports/http
 * import. The MCP_HTTP_TOKEN env var doc in .env.example can also go.
 *
 * To remove the dev-only get_logs tool: drop it from src/tools/registry.ts.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  envBool,
  envNum,
  envStr,
  registerCleanup,
  setLogFilePrefix,
} from "@george43g/robustness";
import { startHttpServer, startStdio } from "@george43g/mcp-kit";
import { getCounters } from "./counters.js";
import { getDispatcher } from "./dispatcher.js";
import { APP_NAME, APP_VERSION } from "./meta.js";
import { devModeEnabled, makeAppRegistry } from "./tools/registry.js";

export async function runMcpServer(opts: { transport?: "stdio" | "http" } = {}): Promise<void> {
  // Brand the log directory so different tools' logs don't collide.
  const slug = APP_NAME.replace(/^@[^/]+\//, "");
  setLogFilePrefix(slug);

  const transport = opts.transport ?? (process.argv.includes("--http") ? "http" : "stdio");
  const includeDevOnly = devModeEnabled();
  const registry = makeAppRegistry();

  const server = new Server(
    { name: APP_NAME, version: APP_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: registry.toMcpTools(includeDevOnly),
  }));

  const dispatch = getDispatcher();
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args } = request.params;
    const result = await dispatch(name, args ?? {}, extra?.signal);
    return result;
  });

  if (transport === "http") {
    const port = envNum("MCP_HTTP_PORT", 8080);
    const bind = envStr("MCP_HTTP_BIND", "127.0.0.1");
    const handle = await startHttpServer({
      server,
      port,
      bind,
      getCounters,
    });
    registerCleanup(() => handle.close());
  } else {
    await startStdio({ server, entrypoint: APP_NAME });
  }
}

// Run when invoked directly (bin entry). Importers (tests, CLI, TUI) call
// runMcpServer() explicitly.
const isMain = (() => {
  try {
    const arg = process.argv[1] ?? "";
    return arg.endsWith("/dist/index.js") || arg.endsWith("/src/index.ts");
  } catch {
    return false;
  }
})();

if (isMain) {
  runMcpServer().catch((err) => {
    process.stderr.write(`${APP_NAME}: ${(err as Error).message}\n`);
    process.exit(1);
  });
}

export { callMcpTool } from "./dispatcher.js";

// Suppress unused-import warning while keeping the env helper available
// for tools that read MCP_DEV etc. before main runs.
void envBool;
