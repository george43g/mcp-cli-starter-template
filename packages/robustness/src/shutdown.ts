/**
 * Configurable shutdown / cleanup controller.
 *
 * The factory form keeps process listeners and lifecycle policy isolated for
 * embedded consumers and tests. Convenience exports below preserve the simple
 * singleton API used by generated MCP servers.
 */

export type CleanupFn = () => void | Promise<void>;

export interface RuntimeDiagnostic {
  level: "info" | "error";
  event: string;
  data?: Record<string, unknown>;
}

export interface ShutdownControllerOptions {
  /** Exit on uncaughtException. Disable for long-running interactive TUIs. */
  exitOnUncaughtException?: boolean;
  /** Force process exit when asynchronous cleanup stalls. Defaults to 3000ms. */
  forceExitAfterMs?: number;
  /** Receive lifecycle diagnostics without coupling the controller to a logger. */
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
  /** Remove listeners/timers without exiting. Safe to call repeatedly. */
  dispose(): void;
  /** Test-only state reset. */
  reset(): void;
}

export function createShutdownController(
  options: ShutdownControllerOptions = {},
): ShutdownController {
  const hostProcess = options.process ?? process;
  const exit = options.exit ?? ((code: number) => hostProcess.exit(code));
  const forceExitAfterMs = options.forceExitAfterMs ?? 3_000;
  if (!Number.isFinite(forceExitAfterMs) || forceExitAfterMs <= 0) {
    throw new Error("forceExitAfterMs must be a positive finite number");
  }
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

  const diagnostic = (
    level: RuntimeDiagnostic["level"],
    event: string,
    data?: Record<string, unknown>,
  ) => options.onDiagnostic?.({ level, event, ...(data ? { data } : {}) });

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
        diagnostic("info", "signal_received", { signal: received });
        void shutdown(received === "SIGINT" ? 130 : 0);
      }) as (...args: unknown[]) => void);
    }

    addListener("unhandledRejection", ((reason: unknown) => {
      diagnostic("error", "unhandled_rejection", {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    }) as (...args: unknown[]) => void);

    addListener("uncaughtException", ((error: Error) => {
      diagnostic("error", "uncaught_exception", {
        message: error.message,
        stack: error.stack,
      });
      if (options.exitOnUncaughtException ?? true) void shutdown(70);
    }) as (...args: unknown[]) => void);

    addListener("exit", syncCleanup as (...args: unknown[]) => void);
  };

  const enableStdinEofDetection = (): void => {
    if (stdinListener) return;
    stdinListener = () => {
      if (!shuttingDown) void shutdown(0);
    };
    hostProcess.stdin.on("end", stdinListener);
    hostProcess.stdin.resume();
  };

  const enableOrphanWatchdog = (intervalMs = 5_000): void => {
    if (orphanTimer) return;
    const parentPid = hostProcess.ppid;
    orphanTimer = setInterval(() => {
      if (hostProcess.ppid === 1 || hostProcess.ppid !== parentPid) void shutdown(0);
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

  const reset = (): void => {
    dispose();
    registry.clear();
    shuttingDown = false;
    forceExitTriggered = false;
  };

  return {
    registerCleanup,
    unregisterCleanup,
    shutdown,
    installHandlers,
    enableStdinEofDetection,
    enableOrphanWatchdog,
    isShuttingDown: () => shuttingDown,
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
  if (Object.keys(options).length > 0) {
    defaultController.dispose();
    defaultController = createShutdownController(options);
  }
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

/** @internal */
export function _resetForTests(): void {
  defaultController.reset();
  defaultController = createShutdownController();
}
