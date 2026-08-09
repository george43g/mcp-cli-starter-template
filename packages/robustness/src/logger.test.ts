import { existsSync, mkdtempSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLogs,
  getLogFilePath,
  getLogs,
  info,
  perf,
  _resetForTests as resetLogger,
  setFileLogging,
  setLogRedaction,
  setStderrMirror,
  warn,
  writeStderrLine,
} from "./logger.js";

// Only writeSync is faked (it is writeStderrLine's sole dependency); file I/O
// stays real so the file-output tests exercise the actual code path.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, writeSync: vi.fn() };
});

const mockedWriteSync = vi.mocked(writeSync);

beforeEach(() => {
  resetLogger();
  mockedWriteSync.mockReset();
});

afterEach(() => {
  resetLogger();
  vi.unstubAllEnvs();
});

describe("logger ring buffer", () => {
  it("captures info/warn/error in memoryLines", () => {
    info("test_info");
    warn("test_warn");
    const lines = getLogs();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/\[info\] test_info/);
    expect(lines[1]).toMatch(/\[warn\] test_warn/);
  });

  it("clearLogs empties the ring", () => {
    info("a");
    info("b");
    expect(getLogs()).toHaveLength(2);
    clearLogs();
    expect(getLogs()).toHaveLength(0);
  });

  it("getLogs(tail) returns last N lines", () => {
    for (let i = 0; i < 10; i++) info(`msg${i}`);
    expect(getLogs(3)).toHaveLength(3);
    expect(getLogs(3)[2]).toMatch(/msg9/);
  });
});

describe("perf span", () => {
  it("records duration and structured data", async () => {
    const span = perf("test_span");
    await new Promise((r) => setTimeout(r, 5));
    const dur = span.end({ rows: 42 });
    expect(dur).toBeGreaterThan(0);
    const lines = getLogs();
    expect(lines[0]).toMatch(/\[perf\] test_span/);
    expect(lines[0]).toMatch(/"rows":42/);
  });
});

describe("file logging opt-out", () => {
  const freshLogDir = () => mkdtempSync(join(tmpdir(), "robustness-logger-"));

  it("writes NDJSON by default", () => {
    vi.stubEnv("MCP_LOG_DIR", freshLogDir());
    info("on_disk");
    const path = getLogFilePath();
    expect(path).not.toBeNull();
    expect(existsSync(path as string)).toBe(true);
  });

  it("MCP_LOG_TO_FILE=0 disables file output, read at call time", () => {
    vi.stubEnv("MCP_LOG_DIR", freshLogDir());
    // Set AFTER import: the knob must not be frozen at module load
    // (applyEnvFromFlags sets env while parsing argv, which is always later).
    vi.stubEnv("MCP_LOG_TO_FILE", "0");
    info("not_on_disk");
    expect(getLogFilePath()).toBeNull();
  });

  it("setFileLogging beats the env knob in both directions", () => {
    vi.stubEnv("MCP_LOG_DIR", freshLogDir());
    vi.stubEnv("MCP_LOG_TO_FILE", "0");
    setFileLogging(true);
    info("forced_on");
    expect(getLogFilePath()).not.toBeNull();

    resetLogger();
    vi.stubEnv("MCP_LOG_DIR", freshLogDir());
    vi.stubEnv("MCP_LOG_TO_FILE", "1");
    setFileLogging(false);
    info("forced_off");
    expect(getLogFilePath()).toBeNull();
  });
});

describe("redaction", () => {
  it("redacts msg and data in every sink by default", () => {
    info("call +61400111222", { token: "github_pat_11ABCDEFGHIJKLMNOP" });
    const line = getLogs()[0];
    expect(line).toContain("…1222");
    expect(line).toContain("[redacted]");
    expect(line).not.toContain("+61400111222");
    expect(line).not.toContain("github_pat_11ABCDEFGHIJKLMNOP");
  });

  it("setLogRedaction(false) preserves raw values", () => {
    setLogRedaction(false);
    info("call +61400111222");
    expect(getLogs()[0]).toContain("+61400111222");
  });

  it("MCP_LOG_REDACT=0 preserves raw values, read at call time", () => {
    vi.stubEnv("MCP_LOG_REDACT", "0");
    info("call +61400111222");
    expect(getLogs()[0]).toContain("+61400111222");
  });
});

describe("never-throw hardening", () => {
  it("survives circular data", () => {
    const data: Record<string, unknown> = { note: "+61400111222" };
    data.self = data;
    expect(() => info("circular", data)).not.toThrow();
    expect(getLogs()[0]).toContain("[circular]");
  });

  it("survives unserializable data even with redaction off", () => {
    setLogRedaction(false);
    const data: Record<string, unknown> = {};
    data.self = data;
    expect(() => info("circular_raw", data)).not.toThrow();
    expect(getLogs()[0]).toContain("[unserializable]");
  });

  it("survives BigInt data", () => {
    expect(() => info("bigint", { n: 9n as unknown as number })).not.toThrow();
    expect(getLogs()[0]).toContain("[unserializable]");
  });
});

describe("stderr mirror", () => {
  it("is off by default", () => {
    info("quiet");
    expect(mockedWriteSync).not.toHaveBeenCalled();
  });

  it("mirrors info/warn/error with the prefix when enabled", () => {
    setStderrMirror(true);
    info("mirrored");
    expect(mockedWriteSync).toHaveBeenCalledTimes(1);
    const [fd, line] = mockedWriteSync.mock.calls[0] as [number, string];
    expect(fd).toBe(2);
    expect(line).toMatch(/^\[mcp\] .*\[info\] mirrored\n$/);
  });

  it("excludes perf spans from the mirror", () => {
    setStderrMirror(true);
    perf("span").end();
    expect(mockedWriteSync).not.toHaveBeenCalled();
  });

  it("mirrors redacted lines, never raw ones", () => {
    setStderrMirror(true);
    info("call +61400111222");
    const [, line] = mockedWriteSync.mock.calls[0] as [number, string];
    expect(line).toContain("…1222");
    expect(line).not.toContain("+61400111222");
  });

  it("writeStderrLine writes synchronously to fd 2 and never throws", () => {
    writeStderrLine("direct");
    expect(mockedWriteSync).toHaveBeenCalledWith(2, "direct\n");

    mockedWriteSync.mockImplementationOnce(() => {
      throw new Error("EBADF");
    });
    expect(() => writeStderrLine("after_close")).not.toThrow();
  });
});
