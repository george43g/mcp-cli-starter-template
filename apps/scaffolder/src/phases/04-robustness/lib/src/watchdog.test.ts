import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createWatchdog,
  isMonotonicallyGrowing,
  _resetForTests as resetWatchdog,
} from "./watchdog.js";

beforeEach(() => {
  resetWatchdog();
});

afterEach(() => {
  resetWatchdog();
});

describe("isMonotonicallyGrowing", () => {
  it("returns false for fewer than 2 samples", () => {
    expect(isMonotonicallyGrowing([])).toBe(false);
    expect(isMonotonicallyGrowing([1])).toBe(false);
  });

  it("requires >= 25MB total growth by default", () => {
    expect(isMonotonicallyGrowing([100, 105, 110, 115, 120])).toBe(false);
    expect(isMonotonicallyGrowing([100, 105, 110, 120, 125])).toBe(true);
  });

  it("accepts a consumer-specific minimum growth threshold", () => {
    expect(isMonotonicallyGrowing([100, 101, 102, 103, 105], 5)).toBe(true);
  });

  it("rejects sequences that ever decrease", () => {
    expect(isMonotonicallyGrowing([100, 102, 101, 110])).toBe(false);
  });

  it("accepts flat-then-growing sequences", () => {
    expect(isMonotonicallyGrowing([100, 100, 100, 125])).toBe(true);
  });
});

describe("createWatchdog", () => {
  it("supports an isolated lifecycle and idle-restart opt-out", () => {
    const cleanup = new Set<() => void>();
    const diagnostics: string[] = [];
    const controller = createWatchdog({
      idleRestart: false,
      eventLoopSampleMs: 60_000,
      memorySampleMs: 60_000,
      onDiagnostic: ({ event }) => diagnostics.push(event),
      shutdownController: {
        registerCleanup: (fn) => cleanup.add(fn),
        unregisterCleanup: (fn) => cleanup.delete(fn),
        isShuttingDown: () => false,
        shutdown: async () => {},
      },
    });

    controller.install();
    expect(cleanup.size).toBe(1);
    expect(diagnostics).toContain("watchdog_installed");
    controller.dispose();
    expect(cleanup.size).toBe(0);
  });

  it("validates environment prefixes", () => {
    expect(() => createWatchdog({ envPrefix: "not-valid!" })).toThrow(/Invalid watchdog envPrefix/);
    expect(() => createWatchdog({ envPrefix: "IMSG_" })).not.toThrow();
  });
});
