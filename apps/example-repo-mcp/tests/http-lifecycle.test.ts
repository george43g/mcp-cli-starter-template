/**
 * The HTTP transport's process lifecycle, in a real child process.
 *
 * The stdio path has wired `installShutdownHandlers()` since it was written;
 * the HTTP path never did. `runHttpMcp` registered `handle.close()` as a
 * cleanup and then nothing ever trapped a signal to run the registry, so a
 * `SIGTERM` — how every supervisor, container runtime and `pnpm` stops a
 * server — killed the process outright: in-flight requests dropped, no
 * `shutdown` marker written, and the log looking exactly like a crash to the
 * rule the generated AGENTS.md states ("file without `shutdown` = crash").
 *
 * This has to be a child process. The contract under test is what the OS does
 * with a signal and what exit status the process reaches, and neither exists
 * in-process: `shutdown()` returns `Promise<never>` because it calls
 * `process.exit`.
 */

import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const APP_DIR = resolve(import.meta.dirname, "..");
const TSX = resolve(APP_DIR, "node_modules/.bin/tsx");

interface HttpChild {
  child: ReturnType<typeof spawn>;
  url: string;
  stderr: () => string;
}

/** Boot `src/index.ts --http` on an ephemeral port and wait for its banner. */
async function startHttpChild(logDir: string): Promise<HttpChild> {
  const child = spawn(TSX, ["src/index.ts", "--http"], {
    cwd: APP_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NO_COLOR: "1",
      CI: "1",
      MCP_HTTP_TOKEN: "http-lifecycle-test-token",
      MCP_HTTP_PORT: "0", // ephemeral — never collide with a developer's 8080
      MCP_HTTP_BIND: "127.0.0.1",
      MCP_LOG_DIR: logDir,
    },
  });

  let err = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    err += chunk.toString();
  });

  const url = await new Promise<string>((resolveUrl, rejectUrl) => {
    const timer = setTimeout(() => {
      rejectUrl(new Error(`no listening banner within 30s. stderr:\n${err}`));
    }, 30_000);
    const poll = setInterval(() => {
      const match = err.match(/MCP HTTP listening on (http:\/\/\S+)/);
      if (!match?.[1]) return;
      clearInterval(poll);
      clearTimeout(timer);
      resolveUrl(match[1]);
    }, 50);
    child.once("exit", (code, signal) => {
      clearInterval(poll);
      clearTimeout(timer);
      rejectUrl(new Error(`exited early (code=${code} signal=${signal}). stderr:\n${err}`));
    });
    child.once("error", rejectUrl);
  });

  return { child, url, stderr: () => err };
}

/** Every NDJSON entry the child wrote, across whatever file it chose. */
async function readLogEntries(logDir: string): Promise<Array<{ msg: string }>> {
  const files = (await readdir(logDir)).filter((f) => f.endsWith(".ndjson"));
  const entries: Array<{ msg: string }> = [];
  for (const file of files) {
    const raw = await readFile(join(logDir, file), "utf8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      entries.push(JSON.parse(line) as { msg: string });
    }
  }
  return entries;
}

describe("http transport lifecycle", () => {
  it("traps SIGTERM and exits gracefully instead of being killed by it", async () => {
    const logDir = await mkdtemp(join(tmpdir(), "http-lifecycle-"));
    const { child, url, stderr } = await startHttpChild(logDir);

    try {
      // The server really is serving before we signal it.
      const health = await fetch(`${url}/health`);
      await health.text();
      expect(health.status).toBe(200);

      const exited = new Promise<{ code: number | null; signal: string | null }>((resolveExit) => {
        child.once("exit", (code, signal) => resolveExit({ code, signal }));
      });
      child.kill("SIGTERM");

      const result = await Promise.race([
        exited,
        new Promise<never>((_r, rejectRace) =>
          setTimeout(
            () => rejectRace(new Error(`no exit within 20s. stderr:\n${stderr()}`)),
            20_000,
          ),
        ),
      ]);

      // Measured against the unwired version: code 143, i.e. 128 + SIGTERM,
      // the status a process reaches when the default disposition terminates
      // it. (`signal` is null rather than "SIGTERM" because the child we spawn
      // is the tsx wrapper, which forwards the signal and reports the status.)
      // A trapped SIGTERM runs the cleanup registry and exits 0.
      expect(result.signal).toBeNull();
      expect(result.code).toBe(0);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  }, 60_000);

  it("writes startup and shutdown markers, so a clean stop is not read as a crash", async () => {
    const logDir = await mkdtemp(join(tmpdir(), "http-lifecycle-"));
    const { child, stderr } = await startHttpChild(logDir);

    try {
      const exited = new Promise<void>((resolveExit) => child.once("exit", () => resolveExit()));
      child.kill("SIGTERM");
      await Promise.race([
        exited,
        new Promise<never>((_r, rejectRace) =>
          setTimeout(
            () => rejectRace(new Error(`no exit within 20s. stderr:\n${stderr()}`)),
            20_000,
          ),
        ),
      ]);

      const messages = (await readLogEntries(logDir)).map((e) => e.msg);
      expect(messages).toContain("startup");
      expect(messages).toContain("shutdown");
      // Write-once: the controller's exit listener sweeps the cleanup registry
      // synchronously, so a guard is the only thing keeping this at one.
      expect(messages.filter((m) => m === "shutdown")).toHaveLength(1);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  }, 60_000);
});
