/**
 * Configurable shutdown / cleanup controller.
 *
 * The factory form keeps process listeners and lifecycle policy isolated for
 * embedded consumers and tests. Convenience exports below preserve the simple
 * singleton API used by generated MCP servers.
 *
 * Configuration is applied in place (`reconfigure`) rather than by replacing the
 * controller, so cleanups registered before a consumer configures the singleton
 * still run. Replacing it silently dropped them.
 *
 * Diagnostics have a default sink (the package logger + a synchronous stderr
 * line for error-level events). Installing an uncaughtException listener
 * suppresses Node's own stderr report, so before the default sink existed, a
 * consumer that never wired `onDiagnostic` had crashes vanish without trace.
 */

import { error as logError, info as logInfo, writeStderrLine } from "./logger.js";

export type CleanupFn = () => void | Promise<void>;

export interface RuntimeDiagnostic {
  level: "info" | "error";
  event: string;
  data?: Record<string, unknown>;
}

export interface ShutdownControllerOptions {
  /** Exit on uncaughtException. Disable for long-running interactive TUIs. */
  exitOnUncaughtException?: boolean;
  /**
   * Exit on unhandledRejection. Defaults to true — Node itself treats an
   * unhandled rejection as fatal, and merely installing a listener (which the
   * controller must, to observe the event) suppresses that platform default
   * for the whole consumer app. Disable for long-running interactive TUIs,
   * alongside exitOnUncaughtException.
   */
  exitOnUnhandledRejection?: boolean;
  /** Force process exit when asynchronous cleanup stalls. Defaults to 3000ms. */
  forceExitAfterMs?: number;
  /**
   * Receive lifecycle diagnostics. When omitted, a default sink logs every
   * event via the package logger and writes error-level events to stderr
   * synchronously, so an unobserved crash still leaves a trail. Pass a no-op
   * to silence diagnostics entirely.
   */
  onDiagnostic?: (diagnostic: RuntimeDiagnostic) => void;
  /** Test/embed hook. Defaults to process.exit. */
  exit?: (code: number) => void;
  /** Test/embed hook. Defaults to the current Node process. */
  process?: NodeJS.Process;
}

export interface ShutdownController {
  registerCleanup(fn: CleanupFn): void;
  unregisterCleanup(fn: CleanupFn): void;
  shutdown(exitCode?: number): Promise<void>;
  installHandlers(): void;
  enableStdinEofDetection(): void;
  enableOrphanWatchdog(intervalMs?: number): void;
  isShuttingDown(): boolean;
  /**
   * Why this process is shutting down: "signal:SIGTERM", "uncaught_exception",
   * "unhandled_rejection", "stdin_eof", "orphaned", "watchdog:<reason>", or a
   * consumer-supplied string. Defaults to "normal" — an explicit `shutdown()`
   * with no recorded cause is a clean exit.
   *
   * Exists so a final shutdown log line names the cause instead of a hardcoded
   * literal: a user quit, a supervisor SIGTERM, a watchdog self-kill and a
   * crash otherwise produce an identical last line.
   */
  getShutdownCause(): string;
  /**
   * Record why shutdown is happening. FIRST WRITER WINS: the initiating cause
   * must beat the follow-on events it triggers, or a postmortem's first line
   * names the symptom rather than the cause. Call before `shutdown()`.
   */
  noteShutdownCause(cause: string): void;
  /**
   * Apply new options to the live controller. Merges over the current options;
   * registered cleanups, installed handlers, and shutdown state all survive.
   * Throws without mutating anything if an option is invalid.
   */
  reconfigure(options: ShutdownControllerOptions): void;
  /** Remove listeners/timers without exiting. Safe to call repeatedly. */
  dispose(): void;
  /** Test-only state reset. */
  reset(): void;
}

function defaultDiagnosticSink(d: RuntimeDiagnostic): void {
  if (d.level === "error") {
    logError(`shutdown: ${d.event}`, d.data);
    let suffix = "";
    if (d.data !== undefined) {
      try {
        suffix = ` ${JSON.stringify(d.data)}`;
      } catch {
        // Diagnostic data is controller-built and serializable, but the sink
        // runs during crashes — degrade rather than throw.
      }
    }
    writeStderrLine(`[shutdown] ${d.event}${suffix}`);
  } else {
    logInfo(`shutdown: ${d.event}`, d.data);
  }
}

function resolveForceExitAfterMs(value: number | undefined): number {
  const forceExitAfterMs = value ?? 3_000;
  if (!Number.isFinite(forceExitAfterMs) || forceExitAfterMs <= 0) {
    throw new Error("forceExitAfterMs must be a positive finite number");
  }
  return forceExitAfterMs;
}

export function createShutdownController(
  options: ShutdownControllerOptions = {},
): ShutdownController {
  let config: ShutdownControllerOptions = { ...options };
  let hostProcess = config.process ?? process;
  let exit = config.exit ?? ((code: number) => hostProcess.exit(code));
  let forceExitAfterMs = resolveForceExitAfterMs(config.forceExitAfterMs);
  let orphanIntervalMs = 5_000;
  const registry = new Set<CleanupFn>();
  const listeners: Array<
    readonly [
      NodeJS.Signals | "exit" | "unhandledRejection" | "uncaughtException",
      (...args: unknown[]) => void,
    ]
  > = [];
  let shuttingDown = false;
  let forceExitTimer: ReturnType<typeof setTimeout> | null = null;
  let forceExitTriggered = false;
  let orphanTimer: ReturnType<typeof setInterval> | null = null;
  let handlersInstalled = false;
  let stdinListener: (() => void) | undefined;
  // Closure-scoped, not module-scoped: two controllers (an embedded one and the
  // singleton) must not share a cause.
  let shutdownCause: string | null = null;

  const noteShutdownCause = (cause: string): void => {
    if (shutdownCause === null) shutdownCause = cause;
  };

  const diagnostic = (
    level: RuntimeDiagnostic["level"],
    event: string,
    data?: Record<string, unknown>,
  ) => {
    const sink = config.onDiagnostic ?? defaultDiagnosticSink;
    try {
      sink({ level, event, ...(data ? { data } : {}) });
    } catch {
      // A throwing sink mid-shutdown would mask the event it was reporting.
    }
  };

  const registerCleanup = (fn: CleanupFn): void => {
    registry.add(fn);
  };

  const unregisterCleanup = (fn: CleanupFn): void => {
    registry.delete(fn);
  };

  const stopOrphanTimer = (): void => {
    if (!orphanTimer) return;
    clearInterval(orphanTimer);
    orphanTimer = null;
  };

  const runCleanup = async (): Promise<void> => {
    for (const fn of registry) {
      try {
        await fn();
      } catch (error) {
        diagnostic("error", "cleanup_failed", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    registry.clear();
  };

  const shutdown = async (exitCode = 0): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopOrphanTimer();
    forceExitTimer = setTimeout(() => {
      forceExitTriggered = true;
      diagnostic("error", "cleanup_timeout", {
        timeout_ms: forceExitAfterMs,
      });
      exit(exitCode);
    }, forceExitAfterMs);
    forceExitTimer.unref();
    await runCleanup();
    if (forceExitTimer) clearTimeout(forceExitTimer);
    forceExitTimer = null;
    if (!forceExitTriggered) exit(exitCode);
  };

  const syncCleanup = (): void => {
    for (const fn of registry) {
      try {
        const result = fn();
        if (result && typeof result.catch === "function") result.catch(() => {});
      } catch {
        // Last-resort cleanup cannot recover.
      }
    }
  };

  const addListener = (
    event: NodeJS.Signals | "exit" | "unhandledRejection" | "uncaughtException",
    listener: (...args: unknown[]) => void,
  ): void => {
    hostProcess.on(event, listener);
    listeners.push([event, listener]);
  };

  const installHandlers = (): void => {
    if (handlersInstalled) return;
    handlersInstalled = true;

    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"] as const) {
      addListener(signal, ((received: NodeJS.Signals) => {
        noteShutdownCause(`signal:${received}`);
        diagnostic("info", "signal_received", { signal: received });
        void shutdown(received === "SIGINT" ? 130 : 0);
      }) as (...args: unknown[]) => void);
    }

    addListener("unhandledRejection", ((reason: unknown) => {
      noteShutdownCause("unhandled_rejection");
      diagnostic("error", "unhandled_rejection", {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      });
      if (config.exitOnUnhandledRejection ?? true) void shutdown(70);
    }) as (...args: unknown[]) => void);

    addListener("uncaughtException", ((error: Error) => {
      noteShutdownCause("uncaught_exception");
      diagnostic("error", "uncaught_exception", {
        message: error.message,
        stack: error.stack,
      });
      if (config.exitOnUncaughtException ?? true) void shutdown(70);
    }) as (...args: unknown[]) => void);

    addListener("exit", syncCleanup as (...args: unknown[]) => void);
  };

  const enableStdinEofDetection = (): void => {
    if (stdinListener) return;
    stdinListener = () => {
      if (shuttingDown) return;
      noteShutdownCause("stdin_eof");
      // Previously silent: this path and the orphan watchdog below shut the
      // process down without emitting anything, so a consumer sink observed a
      // shutdown with no cause at all.
      diagnostic("info", "stdin_eof");
      void shutdown(0);
    };
    hostProcess.stdin.on("end", stdinListener);
    hostProcess.stdin.resume();
  };

  const enableOrphanWatchdog = (intervalMs = 5_000): void => {
    if (orphanTimer) return;
    // Recorded only once armed, so a relocation re-arms with the interval that
    // is actually in force rather than one a later no-op call requested.
    orphanIntervalMs = intervalMs;
    const parentPid = hostProcess.ppid;
    orphanTimer = setInterval(() => {
      if (hostProcess.ppid !== 1 && hostProcess.ppid === parentPid) return;
      noteShutdownCause("orphaned");
      diagnostic("info", "orphaned", { parent_pid: parentPid, current_ppid: hostProcess.ppid });
      void shutdown(0);
    }, intervalMs);
    orphanTimer.unref();
  };

  const dispose = (): void => {
    stopOrphanTimer();
    if (forceExitTimer) clearTimeout(forceExitTimer);
    forceExitTimer = null;
    for (const [event, listener] of listeners.splice(0)) {
      hostProcess.removeListener(event, listener);
    }
    handlersInstalled = false;
    if (stdinListener) {
      hostProcess.stdin.removeListener("end", stdinListener);
      stdinListener = undefined;
    }
  };

  const reconfigure = (next: ShutdownControllerOptions): void => {
    const merged: ShutdownControllerOptions = { ...config, ...next };
    // Validate first: an invalid option must leave the controller untouched
    // rather than half-applied.
    const nextForceExitAfterMs = resolveForceExitAfterMs(merged.forceExitAfterMs);
    const nextHostProcess = merged.process ?? process;
    const relocating = nextHostProcess !== hostProcess;

    // dispose() detaches listeners and timers but deliberately leaves the
    // cleanup registry alone; discarding the whole controller is what used to
    // drop consumer state.
    const hadHandlers = handlersInstalled;
    const hadStdinDetection = Boolean(stdinListener);
    const hadOrphanWatchdog = orphanTimer !== null;
    if (relocating) dispose();

    config = merged;
    forceExitAfterMs = nextForceExitAfterMs;
    hostProcess = nextHostProcess;
    exit = merged.exit ?? ((code: number) => hostProcess.exit(code));

    if (relocating) {
      if (hadHandlers) installHandlers();
      if (hadStdinDetection) enableStdinEofDetection();
      if (hadOrphanWatchdog) enableOrphanWatchdog(orphanIntervalMs);
    }

    diagnostic("info", "shutdown_reconfigured", {
      force_exit_after_ms: forceExitAfterMs,
      exit_on_uncaught_exception: merged.exitOnUncaughtException ?? true,
      exit_on_unhandled_rejection: merged.exitOnUnhandledRejection ?? true,
      host_process_replaced: relocating,
    });
  };

  const reset = (): void => {
    dispose();
    registry.clear();
    shuttingDown = false;
    forceExitTriggered = false;
    shutdownCause = null;
  };

  return {
    registerCleanup,
    unregisterCleanup,
    shutdown,
    installHandlers,
    enableStdinEofDetection,
    enableOrphanWatchdog,
    isShuttingDown: () => shuttingDown,
    getShutdownCause: () => shutdownCause ?? "normal",
    noteShutdownCause,
    reconfigure,
    dispose,
    reset,
  };
}

let defaultController = createShutdownController();

export function registerCleanup(fn: CleanupFn): void {
  defaultController.registerCleanup(fn);
}

export function unregisterCleanup(fn: CleanupFn): void {
  defaultController.unregisterCleanup(fn);
}

export async function shutdown(exitCode = 0): Promise<never> {
  await defaultController.shutdown(exitCode);
  return new Promise<never>(() => {});
}

export function installShutdownHandlers(options: ShutdownControllerOptions = {}): void {
  if (Object.keys(options).length > 0) defaultController.reconfigure(options);
  defaultController.installHandlers();
}

export function enableStdinEofDetection(): void {
  defaultController.enableStdinEofDetection();
}

export function enableOrphanWatchdog(intervalMs = 5_000): void {
  defaultController.enableOrphanWatchdog(intervalMs);
}

export function isShuttingDown(): boolean {
  return defaultController.isShuttingDown();
}

/** See {@link ShutdownController.getShutdownCause}. */
export function getShutdownCause(): string {
  return defaultController.getShutdownCause();
}

/** See {@link ShutdownController.noteShutdownCause}. First writer wins. */
export function noteShutdownCause(cause: string): void {
  defaultController.noteShutdownCause(cause);
}

/** @internal */
export function _resetForTests(): void {
  defaultController.reset();
  defaultController = createShutdownController();
}
