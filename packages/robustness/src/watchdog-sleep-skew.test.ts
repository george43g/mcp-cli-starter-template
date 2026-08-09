/**
 * Behavioural pin for the watchdog's sleep-skew guard.
 *
 * Incident class: when macOS suspends, the perf_hooks event-loop histogram
 * keeps accumulating delays as if the loop was blocked for the entire sleep
 * duration. Without skew detection, the next sample after wake-up sees a p99 of
 * minutes (or hours) and kills the process. The guard detects a sample arriving
 * later than `sleepSkewMultiplier × eventLoopSampleMs`, resets the histogram and
 * the sustained counter, emits `sleep_detected_skipping_sample`, and must NOT
 * kill.
 *
 * That guard shipped untested. It exists because of a real incident, so an
 * upstream regression would have gone out silently — the third "our own guard
 * has no test" finding in two days, after the watchdog force-exit bug
 * (DEFERRED #24) and the REPL's piped-input truncation.
 *
 * Contributed by the EQStack agent (`apps/imsg-mcp/tests/watchdog-sleep-skew.test.ts`
 * on `refactor/kit-watchdog-shutdown`, MIT, same author), who found the gap
 * while adopting this package and wrote the test we did not have. Taken with
 * thanks and adapted only for the local import path and `_resetForTests`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWatchdog, _resetForTests as resetWatchdog } from "./watchdog.js";

interface Diag {
  level: string;
  event: string;
  data?: Record<string, unknown>;
}

/**
 * A watchdog wired so every lethal path is observable and none of them fire for
 * real: `exit` and `shutdownController` are recorded rather than executed.
 */
function makeHarness() {
  const diagnostics: Diag[] = [];
  const shutdownCalls: number[] = [];
  const exits: number[] = [];
  const wd = createWatchdog({
    eventLoopSampleMs: 1_000,
    idleRestart: false,
    onDiagnostic: (d) => diagnostics.push(d),
    exit: (code) => exits.push(code),
    shutdownController: {
      registerCleanup: () => {},
      unregisterCleanup: () => {},
      isShuttingDown: () => false,
      shutdown: async (code = 0) => {
        shutdownCalls.push(code);
      },
    },
  });
  return { wd, diagnostics, shutdownCalls, exits };
}

beforeEach(() => {
  resetWatchdog();
});

afterEach(() => {
  resetWatchdog();
  vi.useRealTimers();
});

describe("watchdog sleep-skew guard", () => {
  it("skips the sample, resets the sustained counter, and does not kill after a sleep gap", () => {
    vi.useFakeTimers();
    const { wd, diagnostics, shutdownCalls, exits } = makeHarness();
    wd.install();
    try {
      // Simulate lid-close: the wall clock jumps far past 3x the sample
      // interval before the next interval tick fires.
      vi.setSystemTime(Date.now() + 60_000);
      vi.advanceTimersByTime(1_000);

      const skip = diagnostics.find((d) => d.event === "sleep_detected_skipping_sample");
      expect(skip, "sleep gap must emit the skip diagnostic").toBeDefined();
      expect(skip?.level).toBe("info");
      // The reported gap is the real elapsed wall time, well past 3x 1000ms.
      expect(Number(skip?.data?.actual_interval_ms)).toBeGreaterThan(3_000);
      expect(skip?.data?.expected_interval_ms).toBe(1_000);

      // The guard's whole point: a sleep gap must never look like lag.
      expect(diagnostics.some((d) => d.event.startsWith("watchdog_kill"))).toBe(false);
      expect(shutdownCalls).toEqual([]);
      expect(exits).toEqual([]);
      expect(wd.readState().eventLoopSustainedCount).toBe(0);
    } finally {
      wd.reset();
    }
  });

  it("samples normally at a regular cadence, with no spurious skip", () => {
    vi.useFakeTimers();
    const { wd, diagnostics } = makeHarness();
    wd.install();
    try {
      vi.advanceTimersByTime(1_000);
      vi.advanceTimersByTime(1_000);
      expect(diagnostics.some((d) => d.event === "sleep_detected_skipping_sample")).toBe(false);
      // The sampler DID run: the state's sample timestamp tracked the ticks.
      expect(wd.readState().lastEventLoopSampleTs).toBe(Date.now());
    } finally {
      wd.reset();
    }
  });

  it("honours a custom sleepSkewMultiplier", () => {
    vi.useFakeTimers();
    const diagnostics: Diag[] = [];
    const wd = createWatchdog({
      eventLoopSampleMs: 1_000,
      sleepSkewMultiplier: 10,
      idleRestart: false,
      onDiagnostic: (d) => diagnostics.push(d),
    });
    wd.install();
    try {
      // A 5s gap trips the default multiplier of 3 but not a multiplier of 10,
      // so this fails if the option is ignored and the constant is hardcoded.
      vi.setSystemTime(Date.now() + 5_000);
      vi.advanceTimersByTime(1_000);
      expect(diagnostics.some((d) => d.event === "sleep_detected_skipping_sample")).toBe(false);
    } finally {
      wd.reset();
    }
  });
});
