/**
 * Bearer-token resolution for the HTTP transport.
 *
 * Only the token-selection contract is covered here: which value the server
 * ends up trusting, and what it does when there isn't one. The request/response
 * path (401s, /health, MCP roundtrip) is covered end-to-end by the 15-assertion
 * stress harness, which runs a real server over a real socket.
 *
 * Every case binds port 0 (ephemeral) on 127.0.0.1 and closes in a finally, so
 * the suite never leaks a listener or collides with a fixed port.
 */

import { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type HttpServerHandle, startHttpServer } from "./http.js";

const ENV_KEY = "MCP_HTTP_TOKEN";
let saved: string | undefined;

beforeEach(() => {
  saved = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
});

afterEach(() => {
  if (saved === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = saved;
});

function newServer(): McpServer {
  return new McpServer({ name: "test", version: "0.0.0" }, { capabilities: { tools: {} } });
}

async function start(opts: { token?: string; tokenEnv?: string }): Promise<HttpServerHandle> {
  return startHttpServer({
    server: newServer(),
    port: 0,
    bind: "127.0.0.1",
    getCounters: () => ({ toolCalls: 0, recentErrors: 0 }),
    log: () => {},
    ...opts,
  });
}

/** Probe: the token the server trusts is the one that gets a non-401. */
async function accepts(handle: HttpServerHandle, token: string): Promise<boolean> {
  const res = await fetch(`${handle.url}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
  });
  // Drain so the socket closes cleanly regardless of outcome.
  await res.text().catch(() => "");
  return res.status !== 401;
}

describe("startHttpServer token resolution", () => {
  it("uses the env var when no token is passed", async () => {
    process.env[ENV_KEY] = "from-env";
    const handle = await start({});
    try {
      expect(await accepts(handle, "from-env")).toBe(true);
      expect(await accepts(handle, "wrong")).toBe(false);
    } finally {
      await handle.close();
    }
  });

  it("accepts an explicit token with the env var unset", async () => {
    const handle = await start({ token: "explicit" });
    try {
      expect(await accepts(handle, "explicit")).toBe(true);
    } finally {
      await handle.close();
    }
  });

  it("prefers an explicit token over the env var", async () => {
    process.env[ENV_KEY] = "from-env";
    const handle = await start({ token: "explicit" });
    try {
      expect(await accepts(handle, "explicit")).toBe(true);
      expect(await accepts(handle, "from-env")).toBe(false);
    } finally {
      await handle.close();
    }
  });

  it("honours a custom tokenEnv", async () => {
    process.env.OTHER_TOKEN = "from-other";
    try {
      const handle = await start({ tokenEnv: "OTHER_TOKEN" });
      try {
        expect(await accepts(handle, "from-other")).toBe(true);
      } finally {
        await handle.close();
      }
    } finally {
      delete process.env.OTHER_TOKEN;
    }
  });

  it("refuses to start with no token anywhere", async () => {
    await expect(start({})).rejects.toThrow(/non-empty bearer token/);
  });

  it("treats a whitespace-only token as missing", async () => {
    // A resolved-but-blank secret is a misconfiguration, not an auth bypass:
    // without this, `Bearer    ` would have to match and the check would pass.
    await expect(start({ token: "   " })).rejects.toThrow(/non-empty bearer token/);
  });
});
