/**
 * Structured logger with performance monitoring.
 *
 * - In-memory ring buffer (default last 500 lines) for runtime introspection.
 * - NDJSON file output to MCP_LOG_DIR (default: $TMPDIR/mcp/) for post-mortem
 *   analysis. Rotates at 10MB by default. Opt out with MCP_LOG_TO_FILE=0 or
 *   `setFileLogging(false)` — a bin that reads sensitive user data should not
 *   leave $TMPDIR trails for every end user by default in its own wrapper.
 * - Optional stderr mirror (`setStderrMirror(true)`) so an MCP host's
 *   connection log surfaces info/warn/error without polluting stdout JSON-RPC.
 * - Redaction ON by default: phone numbers and secret-shaped strings in msg or
 *   data are rewritten before any sink sees them. `setLogRedaction(false)` or
 *   MCP_LOG_REDACT=0 to opt out.
 * - Performance spans: `const span = perf("op"); ... span.end({ rows: 100 })`.
 * - Heartbeat heap monitor for crash forensics.
 *
 * Library-eligible: no project-specific imports. Configurable via MCP_LOG_*.
 *
 * Critical invariant: NEVER let logger I/O failures throw. The logger is on
 * the hot path of every dispatch; a write failure must degrade silently.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { envBool, envNum, envStr } from "./env.js";
import { redactString, redactValue } from "./redact.js";

// ── Types ──────────────────────────────────────────────────────────────

export type LogLevel = "info" | "warn" | "error" | "perf";

export interface LogEntry {
  ts: string;
  level: LogLevel;
  msg: string;
  dur_ms?: number;
  mem_mb: number;
  mem_delta_mb?: number;
  data?: Record<string, unknown>;
}

export interface PerfSpan {
  end(data?: Record<string, unknown>): number;
}

// ── Config ─────────────────────────────────────────────────────────────

/**
 * Read on use, not at module load.
 *
 * These were module-level consts, frozen at the first import of this file.
 * cli-kit's `applyEnvFromFlags` sets `process.env` while parsing argv, which
 * is always later — so `--log-ring-size`, `--log-max-bytes`, `--heap-warn-mb`
 * and `--heap-check-ms` parsed successfully, set their env var, and changed
 * nothing. Function calls are the cheapest fix that keeps the contract.
 */
const maxLogLines = () => envNum("MCP_LOG_RING_SIZE", 500);
const maxFileBytes = () => envNum("MCP_LOG_MAX_BYTES", 10 * 1024 * 1024);
const heapWarnMb = () => envNum("MCP_HEAP_WARN_MB", 150);
const heapCheckIntervalMs = () => envNum("MCP_HEAP_CHECK_MS", 60_000);

/** Caller may override the log-file prefix (e.g. "example-repo-mcp"). */
let logFilePrefix = envStr("MCP_LOG_PREFIX", "mcp");

export function setLogFilePrefix(prefix: string): void {
  logFilePrefix = prefix;
}

/**
 * Programmatic overrides beat the env knobs; `null` means "env decides".
 * All three are checked at call time, not module load, for the same
 * `applyEnvFromFlags` reason as the numeric knobs above.
 */
let fileLoggingOverride: boolean | null = null;
let redactionOverride: boolean | null = null;
let stderrMirrorEnabled = false;

/** Enable/disable NDJSON file output. Overrides MCP_LOG_TO_FILE (default on). */
export function setFileLogging(enabled: boolean): void {
  fileLoggingOverride = enabled;
}

const fileLoggingEnabled = () => fileLoggingOverride ?? envBool("MCP_LOG_TO_FILE", true);

/** Enable/disable redaction of msg/data. Overrides MCP_LOG_REDACT (default on). */
export function setLogRedaction(enabled: boolean): void {
  redactionOverride = enabled;
}

const redactionEnabled = () => redactionOverride ?? envBool("MCP_LOG_REDACT", true);

/**
 * Mirror info/warn/error lines to stderr (perf spans excluded — too chatty).
 * OFF by default: a full-screen Ink TUI renders to the same terminal, and
 * stray stderr writes garble it. Enable from the MCP stdio entrypoint, where
 * the host (Claude Desktop, Cursor, ...) surfaces stderr in its connection log.
 */
export function setStderrMirror(enabled: boolean): void {
  stderrMirrorEnabled = enabled;
}

/**
 * Write a line to stderr (fd 2) SYNCHRONOUSLY. Unlike `console.error`, a
 * synchronous fd write is flushed before the process can exit, so the line
 * survives a crash microseconds later — the failure mode that makes startup
 * crashes invisible in an MCP host's log. Never throws.
 */
export function writeStderrLine(line: string): void {
  try {
    writeSync(2, `${line}\n`);
  } catch {
    // stderr may be closed mid-shutdown; never re-throw from the logger.
  }
}

// ── State ──────────────────────────────────────────────────────────────

const memoryLines: string[] = [];
let logFilePath: string | null = null;
let logFileBytes = 0;
let heapMonitorTimer: ReturnType<typeof setInterval> | null = null;

// ── File output ────────────────────────────────────────────────────────

function getLogDir(): string {
  return envStr("MCP_LOG_DIR", join(tmpdir(), logFilePrefix));
}

function ensureLogFile(): string | null {
  if (logFilePath && logFileBytes < maxFileBytes()) return logFilePath;

  try {
    const dir = getLogDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const date = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    logFilePath = join(dir, `${logFilePrefix}-${process.pid}-${date}.ndjson`);
    logFileBytes = 0;
    return logFilePath;
  } catch {
    return null;
  }
}

function writeToFile(json: string): void {
  if (!fileLoggingEnabled()) return;
  const path = ensureLogFile();
  if (!path) return;
  try {
    const line = `${json}\n`;
    appendFileSync(path, line);
    logFileBytes += line.length;
  } catch {
    // Never break the app on log I/O failures.
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function heapMB(): number {
  return Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 10) / 10;
}

/**
 * Circular or BigInt-bearing data would make JSON.stringify throw on the hot
 * path, violating the never-throw invariant. Degrade to a marker instead.
 */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "null";
  } catch {
    return '"[unserializable]"';
  }
}

function formatMemoryLine(entry: LogEntry): string {
  let line = `${entry.ts} [${entry.level}] ${entry.msg}`;
  if (entry.dur_ms != null) line += ` (${entry.dur_ms.toFixed(1)}ms)`;
  if (entry.data != null) line += ` ${safeStringify(entry.data)}`;
  return line;
}

function emit(entry: LogEntry): void {
  // Redact before ANY sink — ring buffer, file, and mirror must agree.
  const safe: LogEntry = redactionEnabled()
    ? {
        ...entry,
        msg: redactString(entry.msg),
        ...(entry.data !== undefined
          ? { data: redactValue(entry.data) as Record<string, unknown> }
          : {}),
      }
    : entry;

  const line = formatMemoryLine(safe);
  memoryLines.push(line);
  const cap = maxLogLines();
  if (memoryLines.length > cap) {
    memoryLines.splice(0, memoryLines.length - cap);
  }
  writeToFile(safeStringify(safe));
  if (stderrMirrorEnabled && safe.level !== "perf") {
    writeStderrLine(`[${logFilePrefix}] ${line}`);
  }
}

// ── Public API ─────────────────────────────────────────────────────────

function buildEntry(level: LogLevel, msg: string, data?: Record<string, unknown>): LogEntry {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    msg,
    mem_mb: heapMB(),
  };
  if (data !== undefined) entry.data = data;
  return entry;
}

export function info(msg: string, data?: Record<string, unknown>): void {
  emit(buildEntry("info", msg, data));
}

export function warn(msg: string, data?: Record<string, unknown>): void {
  emit(buildEntry("warn", msg, data));
}

export function error(msg: string, data?: Record<string, unknown>): void {
  emit(buildEntry("error", msg, data));
}

/**
 * Start a performance span. Call `.end()` to log duration + heap delta.
 *
 * ```ts
 * const span = perf("dispatch.noop");
 * // ... work ...
 * span.end({ result_size: 10 });
 * ```
 */
export function perf(msg: string): PerfSpan {
  const startTime = performance.now();
  const startHeap = heapMB();

  return {
    end(data?: Record<string, unknown>): number {
      const dur_ms = performance.now() - startTime;
      const endHeap = heapMB();
      const entry: LogEntry = {
        ts: new Date().toISOString(),
        level: "perf",
        msg,
        dur_ms,
        mem_mb: endHeap,
        mem_delta_mb: Math.round((endHeap - startHeap) * 10) / 10,
      };
      if (data !== undefined) entry.data = data;
      emit(entry);
      return dur_ms;
    },
  };
}

export function getLogs(tail?: number): string[] {
  if (tail != null && tail > 0) return memoryLines.slice(-tail);
  return [...memoryLines];
}

export function clearLogs(): void {
  memoryLines.length = 0;
}

export function getLogFilePath(): string | null {
  return logFilePath;
}

export function getLogDirectory(): string {
  return getLogDir();
}

export function logStartup(entrypoint: string): void {
  info("startup", {
    pid: process.pid,
    ppid: process.ppid,
    entrypoint,
    node: process.version,
  });
}

export function logShutdown(reason: string): void {
  info("shutdown", {
    pid: process.pid,
    reason,
    uptime_s: Math.round(process.uptime()),
  });
}

/**
 * Read the latest NDJSON log file from disk. Returns the last N lines.
 * Used by the dev-only `get_logs` MCP tool.
 */
export function getFileLogLines(tail = 50): string[] {
  try {
    const dir = getLogDir();
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".ndjson"))
      .sort()
      .reverse();
    if (files.length === 0) return [];
    const head = files[0];
    if (head === undefined) return [];

    const content = readFileSync(join(dir, head), "utf8");
    const lines = content.trim().split("\n").filter(Boolean);
    return tail > 0 ? lines.slice(-tail) : lines;
  } catch {
    return [];
  }
}

// ── Heap monitor ───────────────────────────────────────────────────────

/**
 * Start periodic heap monitoring. Logs a warning if heap exceeds the
 * threshold and a heartbeat for post-mortem baseline. Call once at startup.
 */
export function startHeapMonitor(): void {
  if (heapMonitorTimer) return;
  heapMonitorTimer = setInterval(() => {
    const heap = heapMB();
    const { rss } = process.memoryUsage();
    const rssMb = Math.round((rss / 1024 / 1024) * 10) / 10;
    const warnMb = heapWarnMb();
    if (heap > warnMb) {
      warn("heap exceeds threshold", {
        heap_mb: heap,
        rss_mb: rssMb,
        threshold_mb: warnMb,
      });
    }
    emit({
      ts: new Date().toISOString(),
      level: "info",
      msg: "heartbeat",
      mem_mb: heap,
      data: { rss_mb: rssMb, uptime_s: Math.round(process.uptime()) },
    });
  }, heapCheckIntervalMs());
  heapMonitorTimer.unref();
}

export function stopHeapMonitor(): void {
  if (heapMonitorTimer) {
    clearInterval(heapMonitorTimer);
    heapMonitorTimer = null;
  }
}

/**
 * Test-only: reset the in-memory state (lines, file pointer, heap timer).
 * @internal
 */
export function _resetForTests(): void {
  memoryLines.length = 0;
  logFilePath = null;
  logFileBytes = 0;
  fileLoggingOverride = null;
  redactionOverride = null;
  stderrMirrorEnabled = false;
  if (heapMonitorTimer) {
    clearInterval(heapMonitorTimer);
    heapMonitorTimer = null;
  }
}
