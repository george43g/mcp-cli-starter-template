/**
 * HTTP transport — Streamable HTTP server (bearer-auth, /health, /mcp).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DELETE THIS FILE to drop HTTP support entirely. After deleting, also:    │
 * │   1. Remove the `registerHttpCommand(program)` call in `src/cli.ts`.     │
 * │   2. Remove the `import` of this module from `src/cli.ts`.               │
 * │   3. Remove the `MCP_HTTP_TOKEN`/`MCP_HTTP_PORT`/`MCP_HTTP_BIND` entries │
 * │      from `.env.example`.                                                │
 * │   4. Drop stress case #9 (HTTP roundtrip) from `scripts/stress-mcp.ts`. │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * The `runHttpMcp()` function below is the real wiring; the small commander
 * registrar at the bottom (`registerHttpCommand`) attaches it as the `--http`
 * branch of the `mcp` subcommand. Keeping these in the same file makes
 * deletion a single-file change.
 */

import { startHttpServer } from "@george43g/mcp-kit";
import {
  envNum,
  envStr,
  getShutdownCause,
  installShutdownHandlers,
  logShutdown,
  logStartup,
  registerCleanup,
} from "@george43g/robustness";
import { resolveSecret } from "@george43g/secret-store";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Command } from "commander";
import { getCounters } from "../counters.js";
import { APP_NAME } from "../meta.js";

export interface RunHttpMcpOptions {
  server: Server;
  port?: number;
  bind?: string;
}

/**
 * Resolve the bearer token through the secret chain: `MCP_HTTP_TOKEN` in the
 * environment first, then a project `.env`, then the OS keychain, then an
 * external secret manager if one is configured.
 *
 * `varName({ toolPrefix: "mcp", name: "http_token" })` is exactly
 * `MCP_HTTP_TOKEN`, and env is the first link in the chain — so an exported
 * env var behaves identically to before. The rest of the chain only adds
 * places to find it when that var is absent.
 *
 * Returns null when nothing resolves; the transport owns the error message,
 * so there is one place that explains how to fix it.
 */
async function resolveHttpToken(): Promise<string | null> {
  const found = await resolveSecret({ toolPrefix: "mcp", name: "http_token" });
  return found?.value ?? null;
}

/** Start the MCP server over Streamable HTTP. Returns once the server closes. */
export async function runHttpMcp(opts: RunHttpMcpOptions): Promise<void> {
  const port = opts.port ?? envNum("MCP_HTTP_PORT", 8080);
  const bind = opts.bind ?? envStr("MCP_HTTP_BIND", "127.0.0.1");
  const token = await resolveHttpToken();

  // Nothing trapped a signal on this path until now, so the `registerCleanup`
  // below could never run: SIGTERM — how every supervisor, container runtime
  // and `pnpm` stops a server — terminated the process outright at status 143,
  // dropping in-flight requests and leaving the listener to the OS. Installed
  // before `startHttpServer` so a signal arriving mid-bind still finds a
  // handler.
  //
  // The watchdog is deliberately NOT installed here. stdio serves one client
  // and can safely self-kill on lag; an HTTP server is shared, and a restart
  // policy belongs to whatever supervises it.
  installShutdownHandlers();

  const handle = await startHttpServer({
    server: opts.server,
    port,
    bind,
    // Conditional spread, not `token: token ?? undefined`: this repo runs
    // exactOptionalPropertyTypes, so an explicit undefined is a type error.
    ...(token === null ? {} : { token }),
    getCounters,
  });
  registerCleanup(() => handle.close());

  // After the bind, not before: this line means "serving", so a failed bind
  // leaves no startup marker to contradict.
  logStartup(APP_NAME);

  // Its counterpart, without which every clean HTTP exit reads as a crash to
  // the rule the generated AGENTS.md states ("file without `shutdown` =
  // crash"). Registered LAST and guarded, for the two independent reasons
  // measured in `packages/mcp-kit/src/transports/stdio.ts`: the controller's
  // exit listener sweeps the whole registry synchronously, so a cleanup the
  // async pass already ran executes twice when a later one hangs; and "last"
  // is not a position you can hold, because anything registering a cleanup at
  // runtime lands after this one.
  let markerWritten = false;
  registerCleanup(() => {
    if (markerWritten) return;
    markerWritten = true;
    logShutdown(getShutdownCause());
  });
}

/**
 * Attach `--http`/`--port`/`--bind` options + the http transport branch to
 * the `mcp` subcommand. Called once from `src/cli.ts`. Removing HTTP =
 * deleting this whole file + the one call site.
 */
export function registerHttpCommand(mcpSubcmd: Command): void {
  mcpSubcmd
    .option("--http", "Use Streamable HTTP transport (requires MCP_HTTP_TOKEN)")
    .option("--port <port>", "HTTP port (default 8080; env MCP_HTTP_PORT)")
    .option("--bind <host>", "HTTP bind addr (default 127.0.0.1; env MCP_HTTP_BIND)");
}

/**
 * Predicate so cli.ts can branch without knowing about HTTP internals.
 * Reads commander opts + the legacy positional `--http` flag.
 */
export function httpRequested(opts: { http?: boolean }): boolean {
  return opts.http === true || process.argv.includes("--http");
}

/** Surface port/bind overrides to runMcpServer via env (the canonical knob path). */
export function applyHttpEnvFromOpts(opts: { port?: string; bind?: string }): void {
  if (opts.port) process.env.MCP_HTTP_PORT = String(opts.port);
  if (opts.bind) process.env.MCP_HTTP_BIND = String(opts.bind);
}
