import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createShutdownController,
  isShuttingDown,
  registerCleanup,
  _resetForTests as resetShutdown,
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
