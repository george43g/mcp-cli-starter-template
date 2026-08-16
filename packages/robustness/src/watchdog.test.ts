import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWatchdog,
  installWatchdog,
  isMonotonicallyGrowing,
  onMemorySample,
  readWatchdogState,
  _resetForTests as resetWatchdog,
  type WatchdogDiagnostic,
  type WatchdogOptions,
} from "./watchdog.js";

beforeEach(() => {
  resetWatchdog();
});

afterEach(() => {
  resetWatchdog();
  vi.useRealTimers();
});

describe("installWatchdog", () => {
  it("honours options passed after watchdog state has been read", () => {
    // tui-kit's useDevStats calls readWatchdogState() during render, long before
    // an app gets to configure anything. That used to win the singleton race.
    readWatchdogState();

    const diagnostics: string[] = [];
    installWatchdog({
      idleRestart: false,
      eventLoopSampleMs: 60_000,
      memorySampleMs: 60_000,
      maxRssMb: 1_000_000,
      onDiagnostic: ({ event }) => diagnostics.push(event),
    });

    expect(diagnostics).toContain("watchdog_installed");
  });

  it("applies sample intervals when a subscriber constructed the singleton first", () => {
    vi.useFakeTimers();
    const samples: number[] = [];
    onMemorySample((rssMb) => samples.push(rssMb));

    installWatchdog({
      idleRestart: false,
      eventLoopSampleMs: 60_000,
      memorySampleMs: 1_000,
      maxRssMb: 1_000_000,
    });
    vi.advanceTimersByTime(1_000);

    // Proves two things at once: the option took effect, and the subscriber
    // registered beforehand survived configuration.
    expect(samples).toHaveLength(1);
  });
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

/** A shutdown controller whose cleanup registrations are observable. */
function trackingShutdown(store: Set<() => void>): WatchdogOptions["shutdownController"] {
  return {
    registerCleanup: (fn) => store.add(fn as () => void),
    unregisterCleanup: (fn) => store.delete(fn as () => void),
    isShuttingDown: () => false,
    shutdown: async () => {},
  };
}

/** Quiet, non-fatal defaults so a real process's RSS never trips a kill. */
const INERT: WatchdogOptions = {
  idleRestart: false,
  eventLoopSampleMs: 60_000,
  memorySampleMs: 60_000,
  maxRssMb: 1_000_000,
  exit: () => {},
};

describe("createWatchdog.reconfigure", () => {
  it("re-arms live timers while preserving state and subscribers", () => {
    vi.useFakeTimers();
    const samples: number[] = [];
    const controller = createWatchdog({
      ...INERT,
      shutdownController: trackingShutdown(new Set()),
    });
    controller.onMemorySample((rssMb) => samples.push(rssMb));
    controller.install();
    controller.noteActivity();
    const lastActivityTs = controller.readState().lastActivityTs;

    vi.advanceTimersByTime(60_000);
    expect(samples).toHaveLength(1);

    controller.reconfigure({ memorySampleMs: 1_000 });
    vi.advanceTimersByTime(1_000);

    expect(samples).toHaveLength(2);
    expect(controller.readState().lastActivityTs).toBe(lastActivityTs);
    controller.dispose();
  });

  it("rejects an invalid envPrefix without clobbering live policy", () => {
    const diagnostics: WatchdogDiagnostic[] = [];
    const controller = createWatchdog({
      ...INERT,
      envPrefix: "TOOL",
      onDiagnostic: (entry) => diagnostics.push(entry),
      shutdownController: trackingShutdown(new Set()),
    });

    expect(() => controller.reconfigure({ envPrefix: "not-valid!" })).toThrow(
      /Invalid watchdog envPrefix/,
    );

    controller.reconfigure({ maxRssMb: 2_048 });
    expect(diagnostics.at(-1)?.data).toMatchObject({ env_prefix: "TOOL", max_rss_mb: 2_048 });
  });

  it("moves its disposal cleanup to a replacement shutdown controller", () => {
    const first = new Set<() => void>();
    const second = new Set<() => void>();
    const controller = createWatchdog({ ...INERT, shutdownController: trackingShutdown(first) });

    controller.install();
    expect(first.size).toBe(1);

    controller.reconfigure({ shutdownController: trackingShutdown(second) });
    expect(first.size).toBe(0);
    expect(second.size).toBe(1);

    controller.dispose();
    expect(second.size).toBe(0);
  });

  it("ignores reconfiguration once a kill is already in flight", () => {
    vi.useFakeTimers();
    const diagnostics: string[] = [];
    const controller = createWatchdog({
      ...INERT,
      memorySampleMs: 1_000,
      maxRssMb: 1, // any real process exceeds this on the first sample
      onDiagnostic: ({ event }) => diagnostics.push(event),
      shutdownController: trackingShutdown(new Set()),
    });

    controller.install();
    vi.advanceTimersByTime(1_000);
    expect(controller.readState().killReason).toBe("rss_exceeded");

    controller.reconfigure({ memorySampleMs: 5_000 });

    expect(diagnostics).toContain("watchdog_reconfigure_ignored");
    expect(diagnostics).not.toContain("watchdog_reconfigured");
    controller.dispose();
  });
});

describe("force-exit net when a kill triggers shutdown", () => {
  /**
   * A shutdown controller that runs its cleanups (as a real one does) and then
   * hangs — the wedged-cleanup case the 5s force exit exists to escape.
   */
  function hangingShutdown(store: Set<() => void>): WatchdogOptions["shutdownController"] {
    let shuttingDown = false;
    return {
      registerCleanup: (fn) => store.add(fn as () => void),
      unregisterCleanup: (fn) => store.delete(fn as () => void),
      isShuttingDown: () => shuttingDown,
      shutdown: async () => {
        shuttingDown = true;
        for (const fn of [...store]) fn();
        return new Promise<void>(() => {}); // never resolves
      },
    };
  }

  it("still fires after cleanup disposes the watchdog", () => {
    vi.useFakeTimers();
    const exits: number[] = [];
    const diagnostics: string[] = [];
    const controller = createWatchdog({
      ...INERT,
      maxRssMb: 0.000_001, // any real RSS trips this on the first sample
      memorySampleMs: 1_000,
      exit: (code) => exits.push(code),
      onDiagnostic: ({ event }) => diagnostics.push(event),
      shutdownController: hangingShutdown(new Set()),
    });
    controller.install();

    vi.advanceTimersByTime(1_000);
    expect(diagnostics.some((e) => e.startsWith("watchdog_kill"))).toBe(true);

    // dispose() has already run as a shutdown cleanup. The net must survive it:
    // clearing it there left a wedged cleanup with nothing to kill the process.
    vi.advanceTimersByTime(5_000);
    expect(diagnostics).toContain("watchdog_force_exit");
    expect(exits).toEqual([137]);

    controller.reset();
  });

  it("voluntary dispose with no kill in flight still clears the timer", () => {
    vi.useFakeTimers();
    const exits: number[] = [];
    const controller = createWatchdog({ ...INERT, exit: (code) => exits.push(code) });
    controller.install();
    controller.dispose();

    vi.advanceTimersByTime(60_000);
    expect(exits).toEqual([]);
  });

  it("reset() disarms the net even mid-kill, so tests cannot leak one", () => {
    vi.useFakeTimers();
    const exits: number[] = [];
    const controller = createWatchdog({
      ...INERT,
      maxRssMb: 0.000_001,
      memorySampleMs: 1_000,
      exit: (code) => exits.push(code),
      shutdownController: hangingShutdown(new Set()),
    });
    controller.install();
    vi.advanceTimersByTime(1_000);

    controller.reset();
    vi.advanceTimersByTime(60_000);
    expect(exits).toEqual([]);
  });
});

describe("readState memory before the first sample", () => {
  it("reports live memory instead of 0MB during the pre-sample window", () => {
    // The sampler runs every memorySampleMs (60s by default) but consumers poll
    // in seconds, so a freshly started process used to report using no memory
    // during exactly the window someone debugging a startup problem watches.
    const controller = createWatchdog({
      ...INERT,
      shutdownController: trackingShutdown(new Set()),
    });
    controller.install();

    const state = controller.readState();

    expect(state.memorySampled).toBe(false);
    expect(state.rssMb).toBeGreaterThan(0);
    expect(state.heapMb).toBeGreaterThan(0);
    controller.dispose();
  });

  it("keeps the not-sampled-yet distinction available", () => {
    vi.useFakeTimers();
    const controller = createWatchdog({
      ...INERT,
      memorySampleMs: 1_000,
      shutdownController: trackingShutdown(new Set()),
    });
    controller.install();

    expect(controller.readState().memorySampled).toBe(false);
    vi.advanceTimersByTime(1_000);

    const sampled = controller.readState();
    expect(sampled.memorySampled).toBe(true);
    expect(sampled.rssMb).toBeGreaterThan(0);
    controller.dispose();
    vi.useRealTimers();
  });

  it("preserves the live state reference once sampled", () => {
    vi.useFakeTimers();
    const controller = createWatchdog({
      ...INERT,
      memorySampleMs: 1_000,
      shutdownController: trackingShutdown(new Set()),
    });
    controller.install();
    vi.advanceTimersByTime(1_000);

    // Identity is part of the existing contract: a caller holding the object
    // keeps seeing updates. Only the pre-sample case may allocate.
    expect(controller.readState()).toBe(controller.readState());
    controller.dispose();
    vi.useRealTimers();
  });
});

describe("watchdog kill attributes the shutdown cause", () => {
  it("names itself as the cause before initiating shutdown", async () => {
    vi.useFakeTimers();
    const causes: string[] = [];
    const controller = createWatchdog({
      ...INERT,
      memorySampleMs: 1_000,
      maxRssMb: 1, // any real process exceeds this
      onDiagnostic: () => {},
      shutdownController: {
        registerCleanup: () => {},
        unregisterCleanup: () => {},
        isShuttingDown: () => false,
        noteShutdownCause: (cause) => causes.push(cause),
        shutdown: async () => {},
      },
    });
    controller.install();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(causes).toEqual(["watchdog:rss_exceeded"]);
    controller.dispose();
    vi.useRealTimers();
  });

  it("works with a shutdownController that predates the hook", async () => {
    vi.useFakeTimers();
    // trackingShutdown has no noteShutdownCause — exactly the stub a consumer
    // on the previous version passes. Requiring the method would have broken
    // them at compile time and published a major.
    const controller = createWatchdog({
      ...INERT,
      memorySampleMs: 1_000,
      maxRssMb: 1,
      onDiagnostic: () => {},
      shutdownController: trackingShutdown(new Set()),
    });
    controller.install();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(controller.readState().killReason).toBe("rss_exceeded");
    controller.dispose();
    vi.useRealTimers();
  });
});
