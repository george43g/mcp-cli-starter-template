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
import { envBool, envNum, envStr, normalizeEnvPrefix } from "./env.js";
import { redactString, redactValue } from "./redact.js";

// ── Types ──────────────────────────────────────────────────────────────

export type LogLevel = "debug" | "info" | "warn" | "error" | "perf";

/**
 * The threshold a caller can set. `perf` is deliberately absent: spans are not
 * a severity, they are a separate kind of record, and gating them behind
 * `error` would silently delete every timing.
 */
export type LogThreshold = "debug" | "info" | "warn" | "error" | "silent";

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
 * Fragment spliced into env-var NAMES: `"MCP"` → `MCP_LOG_DIR`.
 *
 * NOT the same thing as `logFilePrefix` below, and the two must not be merged
 * into one `setLogPrefix`. This one only ever appears in variable names; that
 * one is a slug that lands in the log directory, the file name and the stderr
 * tag. A service reading `IMSG_LOG_DIR` may still want files called `mcp-*`,
 * and vice versa.
 */
let envPrefix = "MCP";

/**
 * Point the logger's env knobs at a different prefix, mirroring
 * `createWatchdog({ envPrefix })`.
 *
 * `setLogEnvPrefix("IMSG")` makes every knob below read `IMSG_LOG_DIR`,
 * `IMSG_LOG_TO_FILE`, `IMSG_LOG_LEVEL` and so on. The motivating case is a
 * non-MCP service configured by systemd `Environment=` lines, which should not
 * have to write `MCP_` in its unit file. Call before the first log line;
 * the knobs are read at call time, so a later call re-points them.
 */
export function setLogEnvPrefix(prefix: string): void {
  envPrefix = normalizeEnvPrefix(prefix, "logger");
}

/** `"LOG_DIR"` → `"MCP_LOG_DIR"`, or `"IMSG_LOG_DIR"` after `setLogEnvPrefix`. */
const key = (suffix: string): string => `${envPrefix}_${suffix}`;

/**
 * Read on use, not at module load.
 *
 * These were module-level consts, frozen at the first import of this file.
 * cli-kit's `applyEnvFromFlags` sets `process.env` while parsing argv, which
 * is always later — so `--log-ring-size`, `--log-max-bytes`, `--heap-warn-mb`
 * and `--heap-check-ms` parsed successfully, set their env var, and changed
 * nothing. Function calls are the cheapest fix that keeps the contract, and
 * they are also what makes `setLogEnvPrefix` possible at all.
 */
const maxLogLines = () => envNum(key("LOG_RING_SIZE"), 500);
const maxFileBytes = () => envNum(key("LOG_MAX_BYTES"), 10 * 1024 * 1024);
const heapWarnMb = () => envNum(key("HEAP_WARN_MB"), 150);
const heapCheckIntervalMs = () => envNum(key("HEAP_CHECK_MS"), 60_000);

/**
 * Caller may override the log-file prefix (e.g. "example-repo-mcp").
 *
 * Was `let logFilePrefix = envStr("MCP_LOG_PREFIX", "mcp")` — the one eager
 * env read left in this file, and therefore the one knob `applyEnvFromFlags`
 * could not reach, despite the README promising all of them are read at call
 * time. Same `null`-means-"env decides" shape as the overrides below.
 */
let logFilePrefixOverride: string | null = null;

export function setLogFilePrefix(prefix: string): void {
  logFilePrefixOverride = prefix;
}

const logFilePrefix = (): string => logFilePrefixOverride ?? envStr(key("LOG_PREFIX"), "mcp");

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

const fileLoggingEnabled = () => fileLoggingOverride ?? envBool(key("LOG_TO_FILE"), true);

/** Enable/disable redaction of msg/data. Overrides MCP_LOG_REDACT (default on). */
export function setLogRedaction(enabled: boolean): void {
  redactionOverride = enabled;
}

const redactionEnabled = () => redactionOverride ?? envBool(key("LOG_REDACT"), true);

/**
 * Severity ranks for the threshold gate.
 *
 * `perf` sits with `info` rather than getting its own tier: a span is not a
 * severity, and the useful question is "am I still interested in routine
 * detail?". So `warn` and above drop spans, `info` and below keep them.
 */
const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  perf: 20,
  warn: 30,
  error: 40,
};

const THRESHOLD_RANK: Record<LogThreshold, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: Number.POSITIVE_INFINITY,
};

let logLevelOverride: LogThreshold | null = null;

/**
 * Set the minimum level that reaches any sink. Overrides `<PREFIX>_LOG_LEVEL`.
 *
 * Defaults to `debug`, i.e. emit everything — which is exactly what this
 * logger did before the gate existed, so no existing consumer changes
 * behaviour by upgrading. `silent` drops everything including `error`.
 *
 * Adapted from voice-mcp's `log.ts` (MIT, same author), which contributed the
 * rank-threshold shape.
 */
export function setLogLevel(level: LogThreshold): void {
  logLevelOverride = level;
}

function minLevelRank(): number {
  if (logLevelOverride !== null) return THRESHOLD_RANK[logLevelOverride];
  const raw = envStr(key("LOG_LEVEL"), "debug").trim().toLowerCase();
  // An unrecognised value must not silence the logs — fall back to permissive.
  return THRESHOLD_RANK[raw as LogThreshold] ?? THRESHOLD_RANK.debug;
}

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
  return envStr(key("LOG_DIR"), join(tmpdir(), logFilePrefix()));
}

function ensureLogFile(): string | null {
  if (logFilePath && logFileBytes < maxFileBytes()) return logFilePath;

  try {
    const dir = getLogDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const date = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    logFilePath = join(dir, `${logFilePrefix()}-${process.pid}-${date}.ndjson`);
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
  // Gate before doing any work: below the threshold nothing is redacted,
  // stringified, buffered or written.
  if (LEVEL_RANK[entry.level] < minLevelRank()) return;

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
    writeStderrLine(`[${logFilePrefix()}] ${line}`);
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

/**
 * Verbose detail, dropped by default thresholds above `debug`.
 *
 * New in this version. Nothing in the kit emits at this level yet — it exists
 * so a consumer has somewhere to put chatter that should not survive
 * `<PREFIX>_LOG_LEVEL=info`.
 */
export function debug(msg: string, data?: Record<string, unknown>): void {
  emit(buildEntry("debug", msg, data));
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

export interface FileLogOptions {
  /**
   * Prefer the log file belonging to this PID over the newest one. Defaults to
   * `process.pid`; pass `0` to restore pure newest-first.
   */
  preferPid?: number;
}

/**
 * Read an NDJSON log file from disk. Returns the last N lines.
 * Used by the dev-only `get_logs` MCP tool.
 *
 * Prefers the CURRENT process's file, falling back to newest-by-name. It used
 * to take the newest unconditionally, which is wrong whenever two instances
 * share a machine — an MCP server plus a TUI, or a host that respawned the
 * server — because `get_logs` then answers with the *other* process's log.
 * Reported by a downstream consumer who had to keep a local implementation for
 * exactly this reason.
 */
export function getFileLogLines(tail = 50, options: FileLogOptions = {}): string[] {
  try {
    const dir = getLogDir();
    // Names embed an ISO timestamp after the pid, so a reverse lexical sort is
    // newest-first without stat()ing every file.
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".ndjson"))
      .sort()
      .reverse();
    if (files.length === 0) return [];

    const preferPid = options.preferPid ?? process.pid;
    const mine = preferPid > 0 ? files.find((f) => f.includes(`-${preferPid}-`)) : undefined;
    const head = mine ?? files[0];
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
 *
 * `logFilePrefixOverride` and `envPrefix` are reset here too. The file prefix
 * was previously omitted, so one test calling `setLogFilePrefix` leaked into
 * every later test in the same file — a pre-existing isolation hole that the
 * env prefix would have widened.
 * @internal
 */
export function _resetForTests(): void {
  memoryLines.length = 0;
  logFilePath = null;
  logFileBytes = 0;
  fileLoggingOverride = null;
  redactionOverride = null;
  logFilePrefixOverride = null;
  logLevelOverride = null;
  envPrefix = "MCP";
  stderrMirrorEnabled = false;
  if (heapMonitorTimer) {
    clearInterval(heapMonitorTimer);
    heapMonitorTimer = null;
  }
}
