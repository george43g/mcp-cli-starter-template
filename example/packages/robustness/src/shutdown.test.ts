import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
