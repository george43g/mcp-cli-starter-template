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

interface LogEntry {
  msg: string;
  /** Present on `shutdown`; `reason` is the cause `getShutdownCause()` recorded. */
  data?: { reason?: string };
}

/**
 * Poll until `msg` appears, because the child's write is NOT synchronised with
 * the wrapper's exit event.
 *
 * `child.kill("SIGTERM")` signals the tsx wrapper, which dies on its own default
 * disposition (status 143) while the node process it spawned is still running
 * its cleanup registry. So `child.once("exit")` fires EARLY — reading the log at
 * that moment races the child's `appendFileSync`.
 *
 * Reading once lost that race on macOS whenever cleanup was slow: a `fetch` in
 * the test leaves a keep-alive socket open, `handle.close()` waits on it, and
 * shutdown does not complete until the 3s force-exit net fires. The run that
 * exposed this took 3516ms and reported `no shutdown marker`, while the sibling
 * test with no fetch completed in 2295ms and passed — same run, same code.
 */
async function waitForEntry(
  logDir: string,
  msg: string,
  timeoutMs = 15_000,
): Promise<LogEntry | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = (await readLogEntries(logDir)).find((e) => e.msg === msg);
    if (found || Date.now() > deadline) return found;
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Every NDJSON entry the child wrote, across whatever file it chose. */
async function readLogEntries(logDir: string): Promise<LogEntry[]> {
  const files = (await readdir(logDir)).filter((f) => f.endsWith(".ndjson"));
  const entries: LogEntry[] = [];
  for (const file of files) {
    const raw = await readFile(join(logDir, file), "utf8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      entries.push(JSON.parse(line) as LogEntry);
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

      // We assert the RECORDED CAUSE, not the exit code, and the distinction is
      // load-bearing. The child we spawn is the tsx wrapper, not our process:
      // it forwards the signal and reports its OWN status, so `result.code`
      // races the wrapper's teardown against ours. That raced green on Linux
      // and red on macOS with `expected 143 to be +0` — a false failure, since
      // the app had trapped the signal correctly either way.
      //
      // A `shutdown` marker naming `signal:SIGTERM` can only exist if the
      // handler ran: the default disposition terminates the process without
      // executing any cleanup, so an untrapped SIGTERM leaves no marker at all.
      // That is strictly stronger than an exit code AND independent of the
      // wrapper. The exit status stays in the failure message as a diagnostic.
      const shutdown = await waitForEntry(logDir, "shutdown");
      expect(
        shutdown,
        `no shutdown marker — SIGTERM was not trapped (wrapper exit code=${result.code} signal=${result.signal})`,
      ).toBeDefined();
      expect(shutdown?.data?.reason).toBe("signal:SIGTERM");
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

      // Same race as above: wait for the marker rather than reading once.
      await waitForEntry(logDir, "shutdown");
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
