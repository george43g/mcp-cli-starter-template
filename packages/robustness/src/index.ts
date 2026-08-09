// Barrel — public surface of @george43g/robustness.
// Mirrors Gmail-MCP-Server's robustness/index.ts shape so call sites can be
// lifted into other tools without diff churn.

export { envBool, envNum, envStr } from "./env.js";
export type { HealthCounters, HealthSnapshot, HealthStatus } from "./health.js";
export { formatHealthText, snapshotHealth } from "./health.js";
export type { LogEntry, LogLevel, PerfSpan } from "./logger.js";
export {
  clearLogs,
  error,
  getFileLogLines,
  getLogDirectory,
  getLogFilePath,
  getLogs,
  info,
  logShutdown,
  logStartup,
  perf,
  setFileLogging,
  setLogFilePrefix,
  setLogRedaction,
  setStderrMirror,
  startHeapMonitor,
  stopHeapMonitor,
  warn,
  writeStderrLine,
} from "./logger.js";
export {
  acquire as rateLimitAcquire,
  defaultLimiterAvailable,
  TokenBucket,
} from "./rate-limit.js";
export { lastFour, redactString, redactValue } from "./redact.js";
export type { RetryOptions } from "./retry.js";
export { isTransientError, withRetry } from "./retry.js";
export type {
  CleanupFn,
  RuntimeDiagnostic,
  ShutdownController,
  ShutdownControllerOptions,
} from "./shutdown.js";
export {
  createShutdownController,
  enableOrphanWatchdog,
  enableStdinEofDetection,
  installShutdownHandlers,
  isShuttingDown,
  registerCleanup,
  shutdown,
  unregisterCleanup,
} from "./shutdown.js";
export type {
  MemorySampleCallback,
  WatchdogController,
  WatchdogDiagnostic,
  WatchdogOptions,
  WatchdogState,
} from "./watchdog.js";
export {
  createWatchdog,
  installWatchdog,
  isMonotonicallyGrowing,
  noteActivity,
  onMemorySample,
  readWatchdogState,
} from "./watchdog.js";
export { ToolTimeoutError, withTimeout } from "./with-timeout.js";
