import { existsSync, mkdtempSync, readdirSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLogs,
  debug,
  error,
  getFileLogLines,
  getLogDirectory,
  getLogFilePath,
  getLogs,
  info,
  perf,
  pruneLogs,
  _resetForTests as resetLogger,
  setFileLogging,
  setLogEnvPrefix,
  setLogFilePrefix,
  setLogLevel,
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

describe("setLogEnvPrefix", () => {
  it("defaults to the MCP_ vocabulary", () => {
    vi.stubEnv("MCP_LOG_DIR", "/tmp/from-mcp");
    expect(getLogDirectory()).toBe("/tmp/from-mcp");
  });

  it("re-points every knob at the new prefix", () => {
    // The motivating case: a non-MCP service configured by systemd
    // `Environment=` lines should not have to write MCP_ in its unit file.
    setLogEnvPrefix("IMSG");
    vi.stubEnv("IMSG_LOG_DIR", "/tmp/from-imsg");
    vi.stubEnv("MCP_LOG_DIR", "/tmp/from-mcp");
    expect(getLogDirectory()).toBe("/tmp/from-imsg");
  });

  it("stops reading the old prefix once re-pointed", () => {
    setLogEnvPrefix("IMSG");
    vi.stubEnv("MCP_LOG_LEVEL", "silent");
    info("still emitted");
    expect(getLogs()).toHaveLength(1);
  });

  it("normalises a lowercase, trailing-underscore prefix", () => {
    setLogEnvPrefix("imsg_");
    vi.stubEnv("IMSG_LOG_DIR", "/tmp/normalised");
    expect(getLogDirectory()).toBe("/tmp/normalised");
  });

  it("rejects a prefix that cannot be a shell variable name", () => {
    // Sanitising would produce variables nobody can set; failing at
    // configuration time is the only outcome the caller can act on.
    expect(() => setLogEnvPrefix("my-app")).toThrow(/Invalid logger envPrefix/);
    expect(() => setLogEnvPrefix("9lives")).toThrow(/Invalid logger envPrefix/);
  });

  it("is independent of the log-file prefix", () => {
    // Two different jobs: one names env VARIABLES, the other names FILES.
    setLogEnvPrefix("IMSG");
    setLogFilePrefix("imsg-mcp");
    expect(getLogDirectory()).toContain("imsg-mcp");
    vi.stubEnv("IMSG_LOG_DIR", "/tmp/explicit");
    expect(getLogDirectory()).toBe("/tmp/explicit");
  });
});

describe("log level threshold", () => {
  it("emits everything by default, exactly as before the gate existed", () => {
    debug("d");
    info("i");
    warn("w");
    error("e");
    perf("p").end();
    expect(getLogs()).toHaveLength(5);
  });

  it("drops levels below the threshold", () => {
    setLogLevel("warn");
    debug("d");
    info("i");
    warn("w");
    error("e");
    expect(getLogs().map((l) => l.replace(/^\S+ /, ""))).toEqual(["[warn] w", "[error] e"]);
  });

  it("keeps perf spans at info and below, drops them above", () => {
    setLogLevel("info");
    perf("kept").end();
    expect(getLogs()).toHaveLength(1);

    clearLogs();
    setLogLevel("warn");
    perf("dropped").end();
    expect(getLogs()).toEqual([]);
  });

  it("silent drops even error", () => {
    setLogLevel("silent");
    error("gone");
    expect(getLogs()).toEqual([]);
  });

  it("reads <PREFIX>_LOG_LEVEL", () => {
    vi.stubEnv("MCP_LOG_LEVEL", "ERROR");
    info("dropped");
    error("kept");
    expect(getLogs()).toHaveLength(1);
  });

  it("an explicit setLogLevel beats the env var", () => {
    vi.stubEnv("MCP_LOG_LEVEL", "silent");
    setLogLevel("debug");
    info("kept");
    expect(getLogs()).toHaveLength(1);
  });

  it("falls back to permissive on an unrecognised value", () => {
    // A typo in a unit file must not silently delete the log trail.
    vi.stubEnv("MCP_LOG_LEVEL", "verbose");
    debug("kept");
    expect(getLogs()).toHaveLength(1);
  });

  it("gates before the sinks, so a dropped line never reaches the mirror", () => {
    setStderrMirror(true);
    setLogLevel("error");
    info("dropped");
    expect(mockedWriteSync).not.toHaveBeenCalled();
  });
});

describe("getFileLogLines", () => {
  it("prefers this process's file over a newer one from another process", () => {
    // Two instances on one machine (an MCP server + a TUI, or a respawned
    // host) previously made get_logs answer with the OTHER process's log.
    const dir = mkdtempSync(join(tmpdir(), "logger-pid-"));
    vi.stubEnv("MCP_LOG_DIR", dir);

    // Reverse-lexical sort is newest-first, so `zzz` outranks ours by name.
    writeFileSync(join(dir, `mcp-${process.pid}-2020-01-01.ndjson`), '{"msg":"mine"}\n');
    writeFileSync(join(dir, "mcp-999999-zzz.ndjson"), '{"msg":"theirs"}\n');

    expect(getFileLogLines()).toEqual(['{"msg":"mine"}']);
  });

  it("falls back to newest when this process has no file", () => {
    const dir = mkdtempSync(join(tmpdir(), "logger-pid-"));
    vi.stubEnv("MCP_LOG_DIR", dir);
    writeFileSync(join(dir, "mcp-999999-aaa.ndjson"), '{"msg":"older"}\n');
    writeFileSync(join(dir, "mcp-999999-zzz.ndjson"), '{"msg":"newer"}\n');

    expect(getFileLogLines()).toEqual(['{"msg":"newer"}']);
  });

  it("preferPid: 0 restores pure newest-first", () => {
    const dir = mkdtempSync(join(tmpdir(), "logger-pid-"));
    vi.stubEnv("MCP_LOG_DIR", dir);
    writeFileSync(join(dir, `mcp-${process.pid}-2020-01-01.ndjson`), '{"msg":"mine"}\n');
    writeFileSync(join(dir, "mcp-999999-zzz.ndjson"), '{"msg":"theirs"}\n');

    expect(getFileLogLines(50, { preferPid: 0 })).toEqual(['{"msg":"theirs"}']);
  });

  it("returns [] rather than throwing when the directory does not exist", () => {
    vi.stubEnv("MCP_LOG_DIR", join(tmpdir(), "definitely-not-a-log-dir-9f3a"));
    expect(getFileLogLines()).toEqual([]);
  });
});

describe("pruneLogs", () => {
  const DEAD_PID = 999_999_999; // above every platform's pid_max, so ESRCH
  const stamp = (n: number) => `2020-01-0${n}T00-00-00`;

  it("deletes the oldest files and KEEPS the newest, by timestamp", () => {
    // The assertion that matters: a prune with an off-by-one that keeps
    // everything looks identical to no prune at all, so name the survivors AND
    // the casualties.
    const dir = mkdtempSync(join(tmpdir(), "logger-prune-"));
    vi.stubEnv("MCP_LOG_DIR", dir);
    for (const n of [1, 2, 3, 4]) {
      writeFileSync(join(dir, `mcp-${DEAD_PID}-${stamp(n)}.ndjson`), "{}\n");
    }

    pruneLogs(dir, 2);

    expect(readdirSync(dir).sort()).toEqual([
      `mcp-${DEAD_PID}-${stamp(3)}.ndjson`,
      `mcp-${DEAD_PID}-${stamp(4)}.ndjson`,
    ]);
  });

  it("orders by the timestamp, not by the pid — a higher pid does not outrank a newer file", () => {
    // A plain reverse-lexical sort puts `mcp-9999999-<old>` ahead of
    // `mcp-101-<new>`, which would reap the newer file and keep the stale one.
    const dir = mkdtempSync(join(tmpdir(), "logger-prune-"));
    vi.stubEnv("MCP_LOG_DIR", dir);
    writeFileSync(join(dir, `mcp-${DEAD_PID}-${stamp(1)}.ndjson`), "{}\n");
    writeFileSync(join(dir, `mcp-101-${stamp(9)}.ndjson`), "{}\n");

    pruneLogs(dir, 1);

    expect(readdirSync(dir)).toEqual([`mcp-101-${stamp(9)}.ndjson`]);
  });

  it("never deletes the file a LIVE process is appending to, even when it is the oldest", () => {
    // One directory is shared by every instance with the same prefix. A plain
    // newest-N prune destroys a running peer's log silently — appendFileSync
    // reopens by path, so the peer does not even crash.
    const dir = mkdtempSync(join(tmpdir(), "logger-prune-"));
    vi.stubEnv("MCP_LOG_DIR", dir);
    const mine = `mcp-${process.pid}-${stamp(1)}.ndjson`;
    writeFileSync(join(dir, mine), "{}\n");
    for (const n of [2, 3, 4]) {
      writeFileSync(join(dir, `mcp-${DEAD_PID}-${stamp(n)}.ndjson`), "{}\n");
    }

    pruneLogs(dir, 1);

    const left = readdirSync(dir).sort();
    expect(left).toContain(mine);
    expect(left).toEqual([`mcp-${DEAD_PID}-${stamp(4)}.ndjson`, mine].sort());
  });

  it("protects only the NEWEST file of a live process — its rotated ones are reapable", () => {
    const dir = mkdtempSync(join(tmpdir(), "logger-prune-"));
    vi.stubEnv("MCP_LOG_DIR", dir);
    for (const n of [1, 2, 3]) {
      writeFileSync(join(dir, `mcp-${process.pid}-${stamp(n)}.ndjson`), "{}\n");
    }

    pruneLogs(dir, 1);

    expect(readdirSync(dir).sort()).toEqual([
      `mcp-${process.pid}-${stamp(2)}.ndjson`,
      `mcp-${process.pid}-${stamp(3)}.ndjson`,
    ]);
  });

  it("leaves another prefix's files alone", () => {
    const dir = mkdtempSync(join(tmpdir(), "logger-prune-"));
    vi.stubEnv("MCP_LOG_DIR", dir);
    writeFileSync(join(dir, `imsg-${DEAD_PID}-${stamp(1)}.ndjson`), "{}\n");
    writeFileSync(join(dir, `mcp-${DEAD_PID}-${stamp(1)}.ndjson`), "{}\n");

    pruneLogs(dir, 0);

    expect(readdirSync(dir)).toEqual([`imsg-${DEAD_PID}-${stamp(1)}.ndjson`]);
  });

  it("does not throw when the directory does not exist", () => {
    expect(() => pruneLogs(join(tmpdir(), "definitely-not-a-log-dir-9f3a"), 1)).not.toThrow();
  });

  it("reaps on rotation, through the public logging path", () => {
    const dir = mkdtempSync(join(tmpdir(), "logger-prune-"));
    vi.stubEnv("MCP_LOG_DIR", dir);
    vi.stubEnv("MCP_LOG_MAX_BYTES", "200");
    vi.stubEnv("MCP_LOG_KEEP_FILES", "1");
    // Leftovers from previous runs: reaped on FIRST open, before any rotation.
    for (const n of [1, 2, 3]) {
      writeFileSync(join(dir, `mcp-${DEAD_PID}-${stamp(n)}.ndjson`), "{}\n");
    }

    for (let i = 0; i < 40; i++) info(`rotate_${i}`, { pad: "x".repeat(64) });

    const left = readdirSync(dir);
    // 1 kept + this live process's open file. Without the prune, 40 lines at
    // ~200 bytes per file would leave a file per roll and all three leftovers.
    expect(left.length).toBeLessThanOrEqual(2);
    expect(left).toContain(getLogFilePath()?.split("/").pop());
  });
});
