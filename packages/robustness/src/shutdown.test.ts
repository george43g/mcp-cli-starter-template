import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLogs, _resetForTests as resetLogger, setFileLogging } from "./logger.js";
import {
  createShutdownController,
  installShutdownHandlers,
  isShuttingDown,
  registerCleanup,
  _resetForTests as resetShutdown,
  shutdown,
  unregisterCleanup,
} from "./shutdown.js";

beforeEach(() => {
  resetShutdown();
  // The default diagnostic sink routes through the logger; keep these tests
  // from leaving NDJSON files in the real $TMPDIR.
  setFileLogging(false);
});

describe("createShutdownController", () => {
  it("isolates cleanup and exit policy", async () => {
    const calls: string[] = [];
    const exits: number[] = [];
    const controller = createShutdownController({
      exit: (code) => exits.push(code),
      onDiagnostic: ({ event }) => calls.push(event),
    });
    controller.registerCleanup(() => calls.push("cleanup"));

    await controller.shutdown(9);

    expect(calls).toEqual(["cleanup"]);
    expect(exits).toEqual([9]);
    expect(controller.isShuttingDown()).toBe(true);
    controller.reset();
    expect(controller.isShuttingDown()).toBe(false);
  });

  it("forces exit when cleanup exceeds the safety timeout", async () => {
    vi.useFakeTimers();
    const cleanup = Promise.withResolvers<void>();
    const exits: number[] = [];
    const diagnostics: string[] = [];
    const controller = createShutdownController({
      exit: (code) => exits.push(code),
      onDiagnostic: ({ event }) => diagnostics.push(event),
    });
    controller.registerCleanup(() => cleanup.promise);

    const pendingShutdown = controller.shutdown(9);
    await vi.advanceTimersByTimeAsync(3_000);

    expect(exits).toEqual([9]);
    expect(diagnostics).toContain("cleanup_timeout");

    cleanup.resolve();
    await pendingShutdown;
    expect(exits).toEqual([9]);
    controller.reset();
    vi.useRealTimers();
  });
});

describe("createShutdownController.reconfigure", () => {
  it("applies new policy while keeping registered cleanups", async () => {
    const exits: number[] = [];
    const controller = createShutdownController({ exit: () => exits.push(-1) });
    const cleanup = vi.fn();
    controller.registerCleanup(cleanup);

    controller.reconfigure({ exit: (code) => exits.push(code) });
    await controller.shutdown(4);

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(exits).toEqual([4]);
  });

  it("rejects an invalid option without applying any of the change", async () => {
    vi.useFakeTimers();
    const exits: number[] = [];
    const diagnostics: string[] = [];
    const controller = createShutdownController({
      forceExitAfterMs: 1_000,
      exit: (code) => exits.push(code),
      onDiagnostic: ({ event }) => diagnostics.push(event),
    });
    const stalled = Promise.withResolvers<void>();
    controller.registerCleanup(() => stalled.promise);

    expect(() => controller.reconfigure({ forceExitAfterMs: -1 })).toThrow(
      /positive finite number/,
    );

    // The pre-existing 1000ms budget must still be in force — a rejected
    // reconfigure may not leave the controller half-updated.
    const pending = controller.shutdown(5);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(diagnostics).toContain("cleanup_timeout");
    expect(exits).toEqual([5]);

    stalled.resolve();
    await pending;
    controller.reset();
  });

  it("relocates installed listeners onto a replacement host process", async () => {
    const first = new EventEmitter() as unknown as NodeJS.Process;
    const second = new EventEmitter() as unknown as NodeJS.Process;
    const cleanup = vi.fn();
    const controller = createShutdownController({ process: first, exit: () => {} });
    controller.registerCleanup(cleanup);
    controller.installHandlers();
    expect(first.listenerCount("SIGINT")).toBe(1);

    controller.reconfigure({ process: second });

    expect(first.listenerCount("SIGINT")).toBe(0);
    expect(second.listenerCount("SIGINT")).toBe(1);
    await controller.shutdown(0);
    expect(cleanup).toHaveBeenCalledTimes(1);
    controller.reset();
  });
});

afterEach(() => {
  resetShutdown();
  vi.useRealTimers();
});

describe("unhandledRejection policy", () => {
  it("exits by default, restoring the platform semantics listeners suppress", async () => {
    const host = new EventEmitter() as unknown as NodeJS.Process;
    const exited = Promise.withResolvers<number>();
    const diagnostics: string[] = [];
    const controller = createShutdownController({
      process: host,
      exit: (code) => exited.resolve(code),
      onDiagnostic: ({ event }) => diagnostics.push(event),
    });
    controller.installHandlers();

    host.emit("unhandledRejection", new Error("stray promise"));

    expect(await exited.promise).toBe(70);
    expect(diagnostics).toContain("unhandled_rejection");
    controller.reset();
  });

  it("only observes when exitOnUnhandledRejection is false", async () => {
    const host = new EventEmitter() as unknown as NodeJS.Process;
    const exits: number[] = [];
    const diagnostics: string[] = [];
    const controller = createShutdownController({
      process: host,
      exitOnUnhandledRejection: false,
      exit: (code) => exits.push(code),
      onDiagnostic: ({ event }) => diagnostics.push(event),
    });
    controller.installHandlers();

    host.emit("unhandledRejection", new Error("observed only"));
    await new Promise((r) => setImmediate(r));

    expect(diagnostics).toContain("unhandled_rejection");
    expect(exits).toEqual([]);
    expect(controller.isShuttingDown()).toBe(false);
    controller.reset();
  });
});

describe("default diagnostic sink", () => {
  beforeEach(() => {
    resetLogger();
    setFileLogging(false);
  });

  afterEach(() => {
    resetLogger();
  });

  it("routes info diagnostics to the package logger when no sink is wired", () => {
    const controller = createShutdownController({ exit: () => {} });
    controller.reconfigure({ forceExitAfterMs: 1_000 });

    expect(getLogs().some((l) => l.includes("shutdown: shutdown_reconfigured"))).toBe(true);
    controller.reset();
  });

  it("leaves an error-level trail for an unobserved crash", async () => {
    const host = new EventEmitter() as unknown as NodeJS.Process;
    const exited = Promise.withResolvers<number>();
    const controller = createShutdownController({
      process: host,
      exit: (code) => exited.resolve(code),
    });
    controller.installHandlers();

    host.emit("uncaughtException", new Error("nobody wired onDiagnostic"));

    expect(await exited.promise).toBe(70);
    expect(getLogs().some((l) => l.includes("shutdown: uncaught_exception"))).toBe(true);
    controller.reset();
  });

  it("survives a user sink that throws mid-shutdown", async () => {
    const exited = Promise.withResolvers<number>();
    const controller = createShutdownController({
      exit: (code) => exited.resolve(code),
      onDiagnostic: () => {
        throw new Error("bad sink");
      },
    });
    controller.registerCleanup(() => {
      throw new Error("boom");
    });

    await controller.shutdown(5);
    expect(await exited.promise).toBe(5);
    controller.reset();
  });
});

describe("registerCleanup / unregisterCleanup", () => {
  it("is not shutting down before shutdown() is called", () => {
    expect(isShuttingDown()).toBe(false);
  });

  it("registers and unregisters cleanup functions", () => {
    const fn = vi.fn();
    registerCleanup(fn);
    // No assertion on internal state — just ensure no throw.
    unregisterCleanup(fn);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("installShutdownHandlers", () => {
  it("preserves cleanups registered before it is given options", async () => {
    const exited = Promise.withResolvers<number>();
    const cleanup = vi.fn();

    // The order a TUI consumer hits naturally: mount (registers cleanup), then
    // configure. Passing ANY option used to discard the registry wholesale.
    registerCleanup(cleanup);
    installShutdownHandlers({
      forceExitAfterMs: 3_000,
      exit: (code) => exited.resolve(code),
    });
    void shutdown(0);

    expect(await exited.promise).toBe(0);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("accumulates options across repeated calls", async () => {
    const exited = Promise.withResolvers<number>();
    const diagnostics: string[] = [];

    installShutdownHandlers({ onDiagnostic: ({ event }) => diagnostics.push(event) });
    installShutdownHandlers({ exit: (code) => exited.resolve(code) });
    registerCleanup(() => {
      throw new Error("boom");
    });
    void shutdown(3);

    // The exit hook from the second call AND the diagnostic sink from the first
    // must both still be in force.
    expect(await exited.promise).toBe(3);
    expect(diagnostics).toContain("cleanup_failed");
  });
});

describe("shutdown cause", () => {
  /** A host whose stdin and ppid are steerable; `ppid` is writable per test. */
  function fakeHost(ppid = 4242): NodeJS.Process {
    const host = new EventEmitter() as unknown as NodeJS.Process;
    const stdin = new EventEmitter() as unknown as NodeJS.Process["stdin"];
    (stdin as unknown as { resume: () => void }).resume = () => {};
    Object.assign(host, { stdin, ppid });
    return host;
  }

  it("defaults to normal for an explicit shutdown", async () => {
    const controller = createShutdownController({ exit: () => {} });
    expect(controller.getShutdownCause()).toBe("normal");
    await controller.shutdown(0);
    expect(controller.getShutdownCause()).toBe("normal");
    controller.reset();
  });

  it("names the signal rather than a generic literal", async () => {
    const host = fakeHost();
    const exited = Promise.withResolvers<number>();
    const controller = createShutdownController({
      process: host,
      exit: (code) => exited.resolve(code),
      onDiagnostic: () => {},
    });
    controller.installHandlers();

    host.emit("SIGTERM", "SIGTERM");

    await exited.promise;
    expect(controller.getShutdownCause()).toBe("signal:SIGTERM");
    controller.reset();
  });

  it("distinguishes SIGINT from SIGTERM", async () => {
    const host = fakeHost();
    const exited = Promise.withResolvers<number>();
    const controller = createShutdownController({
      process: host,
      exit: (code) => exited.resolve(code),
      onDiagnostic: () => {},
    });
    controller.installHandlers();

    host.emit("SIGINT", "SIGINT");

    expect(await exited.promise).toBe(130);
    expect(controller.getShutdownCause()).toBe("signal:SIGINT");
    controller.reset();
  });

  it("records a crash", async () => {
    const host = fakeHost();
    const exited = Promise.withResolvers<number>();
    const controller = createShutdownController({
      process: host,
      exit: (code) => exited.resolve(code),
      onDiagnostic: () => {},
    });
    controller.installHandlers();

    host.emit("uncaughtException", new Error("boom"));

    await exited.promise;
    expect(controller.getShutdownCause()).toBe("uncaught_exception");
    controller.reset();
  });

  it("records an unhandled rejection", async () => {
    const host = fakeHost();
    const exited = Promise.withResolvers<number>();
    const controller = createShutdownController({
      process: host,
      exit: (code) => exited.resolve(code),
      onDiagnostic: () => {},
    });
    controller.installHandlers();

    host.emit("unhandledRejection", new Error("stray"));

    await exited.promise;
    expect(controller.getShutdownCause()).toBe("unhandled_rejection");
    controller.reset();
  });

  it("records stdin EOF, which used to shut down silently", async () => {
    const host = fakeHost();
    const exited = Promise.withResolvers<number>();
    const diagnostics: string[] = [];
    const controller = createShutdownController({
      process: host,
      exit: (code) => exited.resolve(code),
      onDiagnostic: ({ event }) => diagnostics.push(event),
    });
    controller.enableStdinEofDetection();

    host.stdin.emit("end");

    await exited.promise;
    expect(controller.getShutdownCause()).toBe("stdin_eof");
    // The cause is only half of it: before this change the whole path emitted
    // nothing at all, so a consumer sink saw a shutdown with no event.
    expect(diagnostics).toContain("stdin_eof");
    controller.reset();
  });

  it("records orphaning, which also used to shut down silently", async () => {
    vi.useFakeTimers();
    const host = fakeHost(4242);
    const exits: number[] = [];
    const diagnostics: string[] = [];
    const controller = createShutdownController({
      process: host,
      exit: (code) => exits.push(code),
      onDiagnostic: ({ event }) => diagnostics.push(event),
    });
    controller.enableOrphanWatchdog(1_000);

    Object.assign(host, { ppid: 1 });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(exits).toEqual([0]);
    expect(controller.getShutdownCause()).toBe("orphaned");
    expect(diagnostics).toContain("orphaned");
    controller.reset();
    vi.useRealTimers();
  });

  it("keeps the first writer, so a postmortem names the cause not the symptom", async () => {
    const host = fakeHost();
    const exited = Promise.withResolvers<number>();
    const controller = createShutdownController({
      process: host,
      exit: (code) => exited.resolve(code),
      onDiagnostic: () => {},
    });
    controller.installHandlers();

    controller.noteShutdownCause("watchdog:event_loop_blocked");
    // A watchdog kill that escalates to a signal must not be reported as the
    // signal — last-writer-wins would name the symptom.
    host.emit("SIGTERM", "SIGTERM");

    await exited.promise;
    expect(controller.getShutdownCause()).toBe("watchdog:event_loop_blocked");
    controller.reset();
  });

  it("clears on reset and does not leak between controllers", () => {
    const first = createShutdownController({ exit: () => {} });
    const second = createShutdownController({ exit: () => {} });

    first.noteShutdownCause("signal:SIGHUP");

    expect(first.getShutdownCause()).toBe("signal:SIGHUP");
    // Module-scoped state would have leaked here.
    expect(second.getShutdownCause()).toBe("normal");

    first.reset();
    expect(first.getShutdownCause()).toBe("normal");
  });
});
