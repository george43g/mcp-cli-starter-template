import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWatchdog,
  installWatchdog,
  isMonotonicallyGrowing,
  onMemorySample,
  readWatchdogState,
  _resetForTests as resetWatchdog,
  type WatchdogBreach,
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

describe("observe-only breach hook", () => {
  /** A shutdown controller that records what the watchdog asked it to do. */
  function recordingShutdown(shutdowns: number[]): WatchdogOptions["shutdownController"] {
    return {
      registerCleanup: () => {},
      unregisterCleanup: () => {},
      isShuttingDown: () => false,
      shutdown: async (code?: number) => {
        shutdowns.push(code ?? 0);
      },
    };
  }

  it("observes an RSS breach without killing, and still logs it", async () => {
    vi.useFakeTimers();
    const breaches: WatchdogBreach[] = [];
    const events: string[] = [];
    const exits: number[] = [];
    const shutdowns: number[] = [];
    const controller = createWatchdog({
      ...INERT,
      exit: (code) => exits.push(code),
      memorySampleMs: 1_000,
      maxRssMb: 1, // any real process exceeds this on the first sample
      onDiagnostic: ({ event }) => events.push(event),
      onBreach: (breach) => {
        breaches.push(breach);
        return "observe";
      },
      shutdownController: recordingShutdown(shutdowns),
    });
    controller.install();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(breaches.map((b) => b.reason)).toEqual(["rss_exceeded"]);
    expect(breaches[0]?.data).toMatchObject({ threshold_mb: 1 });
    // The three things an observed breach must NOT do.
    expect(controller.readState().killReason).toBeNull();
    expect(shutdowns).toEqual([]);
    expect(events).not.toContain("watchdog_kill: rss_exceeded");
    // The one thing it must do.
    expect(events).toContain("watchdog_breach_observed: rss_exceeded");

    // No force-exit net was armed. 5s is the kill path's escape hatch.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(events).not.toContain("watchdog_force_exit");
    expect(exits).toEqual([]);

    controller.reset();
  });

  it("re-fires on every subsequent sample while the breach persists", async () => {
    vi.useFakeTimers();
    const reasons: string[] = [];
    const controller = createWatchdog({
      ...INERT,
      memorySampleMs: 1_000,
      maxRssMb: 1,
      onDiagnostic: () => {},
      onBreach: ({ reason }) => {
        reasons.push(reason);
        return "observe";
      },
      shutdownController: trackingShutdown(new Set()),
    });
    controller.install();

    await vi.advanceTimersByTimeAsync(3_000);

    // Deliberately unthrottled: the sampler interval is the rate limit, and a
    // consumer cannot implement "kill on the third breach" from a latched hook.
    expect(reasons).toEqual(["rss_exceeded", "rss_exceeded", "rss_exceeded"]);
    expect(controller.readState().killReason).toBeNull();
    controller.reset();
  });

  it("kills when the hook returns nothing, exactly as with no hook at all", async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const controller = createWatchdog({
      ...INERT,
      memorySampleMs: 1_000,
      maxRssMb: 1,
      onDiagnostic: ({ event }) => events.push(event),
      onBreach: () => {
        // Observes and decides nothing — void must mean today's behaviour.
      },
      shutdownController: trackingShutdown(new Set()),
    });
    controller.install();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(controller.readState().killReason).toBe("rss_exceeded");
    expect(events).toContain("watchdog_kill: rss_exceeded");
    expect(events).toContain("rss_kill_heap_forensics");
    expect(events).not.toContain("watchdog_breach_observed: rss_exceeded");
    controller.reset();
  });

  it("suppresses the kill-time heap forensics for an observed RSS breach", async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const controller = createWatchdog({
      ...INERT,
      memorySampleMs: 1_000,
      maxRssMb: 1,
      onDiagnostic: ({ event }) => events.push(event),
      onBreach: () => "observe",
      shutdownController: trackingShutdown(new Set()),
    });
    controller.install();

    await vi.advanceTimersByTimeAsync(3_000);

    // Full heap statistics plus every heap space, every 60s forever, is not a
    // payload to emit for a breach the consumer has told us to tolerate.
    expect(events).not.toContain("rss_kill_heap_forensics");
    controller.reset();
  });

  it("observes an event-loop breach without killing", async () => {
    vi.useFakeTimers();
    const breaches: WatchdogBreach[] = [];
    const controller = createWatchdog({
      ...INERT,
      eventLoopSampleMs: 1_000,
      eventLoopKillMs: 0, // an idle histogram already satisfies p99 >= 0
      // Since 0.14.0 the hard path is starvation-classified too, so this test
      // must state the host it assumes. A test process is low-CPU by nature, so
      // on a loaded CI box it lands in the STARVED quadrant and the kill is
      // deferred — which would present as flake rather than as the deliberate
      // behaviour change it is. An idle host makes it a syscall wedge: kill.
      hostLoadReader: () => 0,
      onDiagnostic: () => {},
      onBreach: (breach) => {
        breaches.push(breach);
        return "observe";
      },
      shutdownController: trackingShutdown(new Set()),
    });
    controller.install();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(breaches.map((b) => b.reason)).toEqual(["event_loop_blocked"]);
    expect(breaches[0]?.data).toMatchObject({ threshold_ms: 0 });
    expect(controller.readState().killReason).toBeNull();
    controller.reset();
  });

  it("lets the verdict differ per breach reason on one controller", async () => {
    vi.useFakeTimers();
    const reasons: string[] = [];
    const controller = createWatchdog({
      exit: () => {},
      eventLoopSampleMs: 60_000,
      memorySampleMs: 60_000,
      maxRssMb: 1_000_000,
      idleRestart: true,
      idleRestartAfterMs: 1,
      idleRestartQuietMs: 1,
      idleCheckMs: 1_000,
      onDiagnostic: () => {},
      onBreach: ({ reason }) => {
        reasons.push(reason);
        return reason === "idle_restart" ? "observe" : "kill";
      },
      shutdownController: trackingShutdown(new Set()),
    });
    controller.install();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(reasons).toEqual(["idle_restart"]);
    expect(controller.readState().killReason).toBeNull();

    controller.reconfigure({ memorySampleMs: 1_000, maxRssMb: 1 });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(reasons).toContain("rss_exceeded");
    expect(controller.readState().killReason).toBe("rss_exceeded");
    controller.reset();
  });

  it("kills when the hook throws — a broken hook must not disarm the watchdog", async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const controller = createWatchdog({
      ...INERT,
      memorySampleMs: 1_000,
      maxRssMb: 1,
      onDiagnostic: ({ event }) => events.push(event),
      onBreach: () => {
        throw new Error("consumer hook is broken");
      },
      shutdownController: trackingShutdown(new Set()),
    });
    controller.install();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(events).toContain("watchdog_breach_handler_failed");
    expect(controller.readState().killReason).toBe("rss_exceeded");
    controller.reset();
  });
});

/**
 * Starvation vs wedging — the four rows of the two-signal table.
 *
 * Fixtures and case matrix supplied by browser-tab-mcp, 2026-08-25, after they
 * and up-bank-mcp independently self-killed ~130 times each on one loaded host.
 * Adapted to this harness; the semantics are theirs.
 *
 *   lag + high CPU                 -> spinning on own work  -> KILL
 *   lag + low CPU + host saturated -> starved by the host   -> OBSERVE
 *   lag + low CPU + host idle      -> blocked in a syscall  -> KILL
 *   event_loop_blocked             -> hard stop, any CPU    -> KILL (never downgraded)
 */
describe("sustained lag: starved vs wedged", () => {
  const SAMPLE_MS = 1_000;

  /** Cumulative, monotonic microseconds — same contract as process.cpuUsage(). */
  const cpuReaderAt = (duty: number) => {
    let calls = 0;
    return () => ({ user: calls++ * duty * SAMPLE_MS * 1000, system: 0 });
  };

  async function run(opts: { duty: number; hostLoad: number }) {
    vi.useFakeTimers();
    const events: string[] = [];
    const breaches: WatchdogBreach[] = [];
    const controller = createWatchdog({
      ...INERT,
      eventLoopSampleMs: SAMPLE_MS,
      eventLoopKillMs: 1_000_000, // keep the immediate path out of the way
      eventLoopSustainedMs: 0, // an idle histogram already satisfies p99 >= 0
      eventLoopSustainedSamples: 2,
      cpuUsageReader: cpuReaderAt(opts.duty),
      hostLoadReader: () => opts.hostLoad,
      onDiagnostic: (d) => events.push(d.event),
      onBreach: (b) => {
        breaches.push(b);
        return "observe";
      },
      shutdownController: trackingShutdown(new Set()),
    });
    controller.install();
    await vi.advanceTimersByTimeAsync(SAMPLE_MS * 3);
    controller.reset();
    return { events, breaches };
  }

  it("KILLS a spinning process — high CPU means it is wedged on its own work", async () => {
    // 74% is what a real busy-spin measured at host load ~24; it is NOT ~100%,
    // because even a spinning process gets descheduled. A threshold near 1.0
    // would misread this as starvation on exactly the hosts this targets.
    const { breaches } = await run({ duty: 0.74, hostLoad: 24 });
    expect(breaches.map((b) => b.reason)).toContain("event_loop_sustained_lag");
    expect(breaches[0]?.data).toMatchObject({ verdict: "wedged_spinning" });
  });

  it("OBSERVES a starved process — low CPU on a saturated host", async () => {
    // browser-tab's measured 0.57% duty cycle, host load 24 across 118 procs.
    const { events, breaches } = await run({ duty: 0.0057, hostLoad: 24 });
    expect(breaches).toHaveLength(0);
    expect(events).toContain("event_loop_starved_not_killed");
  });

  it("KILLS an off-CPU wedge on an IDLE host — a sync syscall, not starvation", async () => {
    // The row that makes duty-cycle-alone wrong: a synchronous syscall waiting
    // on IPC parks the thread off-CPU while the loop is fully stopped.
    const { breaches } = await run({ duty: 0.0057, hostLoad: 0.2 });
    expect(breaches.map((b) => b.reason)).toContain("event_loop_sustained_lag");
    expect(breaches[0]?.data).toMatchObject({ verdict: "wedged_off_cpu" });
  });

  it("event_loop_blocked is classified too since 0.14.0 — but only DEFERRED, never cancelled", async () => {
    // SUPERSEDES what 0.13.0 asserted: that this path is never downgraded.
    // That exclusion rested on 223 starvation samples never crossing 10s, with
    // an explicit caveat that the data could not speak for a busier host.
    // up-bank-mcp then measured 11567ms at load 58 and was killed for it.
    // The safety now comes from the BOUND, not from excluding the path.
    vi.useFakeTimers();
    const breaches: WatchdogBreach[] = [];
    const controller = createWatchdog({
      ...INERT,
      eventLoopSampleMs: SAMPLE_MS,
      eventLoopKillMs: 0,
      cpuUsageReader: cpuReaderAt(0.0057),
      hostLoadReader: () => 24,
      onDiagnostic: () => {},
      onBreach: (b) => {
        breaches.push(b);
        return "observe";
      },
      shutdownController: trackingShutdown(new Set()),
    });
    controller.install();
    await vi.advanceTimersByTimeAsync(SAMPLE_MS);
    // Starved + under the bound: deferred, not killed.
    expect(breaches).toHaveLength(0);
    // ...and it does not defer forever. See the bound tests below.
    controller.reset();
  });

  it("does not invent a duty cycle when the CPU reader throws", async () => {
    // A fabricated "low" reading would suppress a real kill. No reading means
    // today's behaviour, not a guess.
    vi.useFakeTimers();
    const breaches: WatchdogBreach[] = [];
    const controller = createWatchdog({
      ...INERT,
      eventLoopSampleMs: SAMPLE_MS,
      eventLoopKillMs: 1_000_000,
      eventLoopSustainedMs: 0,
      eventLoopSustainedSamples: 2,
      cpuUsageReader: () => {
        throw new Error("no cpu for you");
      },
      hostLoadReader: () => 24,
      onDiagnostic: () => {},
      onBreach: (b) => {
        breaches.push(b);
        return "observe";
      },
      shutdownController: trackingShutdown(new Set()),
    });
    controller.install();
    await vi.advanceTimersByTimeAsync(SAMPLE_MS * 3);
    expect(breaches.map((b) => b.reason)).toContain("event_loop_sustained_lag");
    expect(breaches[0]?.data).toMatchObject({ duty_cycle: null });
    controller.reset();
  });
});

/**
 * The off-CPU wedge is PHYSICALLY REAL, not a mocking artefact.
 *
 * `Atomics.wait` parks the thread on a futex: the event loop is fully blocked
 * while the process consumes no CPU — structurally what a synchronous syscall
 * waiting on IPC does. Fixture from browser-tab-mcp, who measured
 * darwin/arm64 node v24.15.0: Atomics.wait 1500ms -> duty 0.01%; busy-spin
 * 1500ms -> duty 74.25%. Three orders of magnitude, so no delicate threshold.
 */
describe("off-CPU wedge is real, not a mock", () => {
  const dutyOf = (fn: () => void) => {
    const c0 = process.cpuUsage();
    const t0 = Date.now();
    fn();
    const c1 = process.cpuUsage(c0);
    return (c1.user + c1.system) / 1000 / Math.max(1, Date.now() - t0);
  };

  it("blocks the loop while consuming ~no CPU", () => {
    vi.useRealTimers();
    const duty = dutyOf(() => {
      const sab = new Int32Array(new SharedArrayBuffer(4));
      Atomics.wait(sab, 0, 0, 200);
    });
    expect(duty).toBeLessThan(0.05);
  });

  it("a spinning wedge is an order of magnitude above it", () => {
    // ASSERT THE SEPARATION, NOT AN ABSOLUTE FLOOR. The first version of this
    // asserted `> 0.2` and FAILED IN CI at 0.167 — a real busy-spin on a shared
    // 2-core runner gets so little CPU that it lands near the threshold. That
    // measurement is why starvationDutyCycle defaults to 0.05 rather than 0.15,
    // and it is exactly the class of environment this feature exists for, so the
    // test must not assume a machine that is idle enough to spin freely.
    vi.useRealTimers();
    const park = dutyOf(() => {
      const sab = new Int32Array(new SharedArrayBuffer(4));
      Atomics.wait(sab, 0, 0, 200);
    });
    const spin = dutyOf(() => {
      const end = Date.now() + 200;
      while (Date.now() < end) {
        /* burn */
      }
    });
    // Both measured in the SAME environment, so contention cancels out.
    expect(spin).toBeGreaterThan(park * 10);
    expect(spin).toBeGreaterThan(0.05);
  });
});

/**
 * The HARD path is classified too, since 0.14.0 — but with a bound.
 *
 * 0.13.0 deliberately excluded `event_loop_blocked`, on 223 starvation samples
 * whose worst was 7646ms and never crossed 10s. That evidence carried an explicit
 * caveat from the session that produced it: one machine at ~5x oversubscription,
 * unable to speak for a busier host. up-bank-mcp then measured **11567ms at load
 * 58** on a live service and it was killed — so the spike path was reintroducing
 * the feedback loop at a higher threshold rather than not at all.
 *
 * The bound is what makes downgrading the hard path safe: a starved verdict
 * DEFERS the kill, it does not cancel it.
 */
describe("event_loop_blocked: starvation defers, it does not cancel", () => {
  const SAMPLE_MS = 1_000;
  const cpuReaderAt = (duty: number) => {
    let calls = 0;
    return () => ({ user: calls++ * duty * SAMPLE_MS * 1000, system: 0 });
  };

  async function run(opts: { duty: number; hostLoad: number; samples: number; limit?: number }) {
    vi.useFakeTimers();
    const events: string[] = [];
    const breaches: WatchdogBreach[] = [];
    const controller = createWatchdog({
      ...INERT,
      eventLoopSampleMs: SAMPLE_MS,
      eventLoopKillMs: 0, // an idle histogram already satisfies p99 >= 0
      starvationMaxConsecutive: opts.limit ?? 5,
      cpuUsageReader: cpuReaderAt(opts.duty),
      hostLoadReader: () => opts.hostLoad,
      onDiagnostic: (d) => events.push(d.event),
      onBreach: (b) => {
        breaches.push(b);
        return "observe";
      },
      shutdownController: trackingShutdown(new Set()),
    });
    controller.install();
    await vi.advanceTimersByTimeAsync(SAMPLE_MS * opts.samples);
    controller.reset();
    return { events, breaches };
  }

  it("DEFERS the kill while starved and under the bound", async () => {
    // up-bank's shape: low duty cycle, host far past saturation.
    const { events, breaches } = await run({ duty: 0.0057, hostLoad: 58, samples: 3 });
    expect(breaches).toHaveLength(0);
    expect(events).toContain("event_loop_blocked_starved_deferring_kill");
  });

  it("KILLS ANYWAY once the bound is reached — a wedge cannot hide forever", async () => {
    // This is the answer to "a wedged process on a busy box is never recycled".
    // The worst case is bounded at starvationMaxConsecutive * eventLoopSampleMs.
    const { events, breaches } = await run({
      duty: 0.0057,
      hostLoad: 58,
      samples: 5,
      limit: 2,
    });
    expect(events).toContain("event_loop_blocked_starved_limit_reached");
    expect(breaches.map((b) => b.reason)).toContain("event_loop_blocked");
  });

  it("KILLS IMMEDIATELY when the process is on-CPU — a spinning wedge is not starved", async () => {
    const { events, breaches } = await run({ duty: 0.74, hostLoad: 58, samples: 2 });
    expect(events).not.toContain("event_loop_blocked_starved_deferring_kill");
    expect(breaches.map((b) => b.reason)).toContain("event_loop_blocked");
  });

  it("KILLS IMMEDIATELY when the host is idle — off-CPU on an idle box is a syscall wedge", async () => {
    const { breaches } = await run({ duty: 0.0057, hostLoad: 0.2, samples: 2 });
    expect(breaches.map((b) => b.reason)).toContain("event_loop_blocked");
    expect(breaches[0]?.data).toMatchObject({ verdict: "wedged_off_cpu" });
  });
});

describe("watchdog_installed is self-evidencing", () => {
  it("names the classifier and its thresholds, so an operator need not grep node_modules", async () => {
    // Before 0.14.0 this line was byte-identical between 0.12.0 and 0.13.0
    // despite a behaviour change, and a consumer nearly recorded the starvation
    // fix as not-live because of it.
    vi.useFakeTimers();
    const seen: Record<string, unknown>[] = [];
    const controller = createWatchdog({
      ...INERT,
      onDiagnostic: (d) => {
        if (d.event === "watchdog_installed" && d.data) seen.push(d.data);
      },
      shutdownController: trackingShutdown(new Set()),
    });
    controller.install();
    // EXACT values, not expect.any(Number). Presence-only is how 0.14.0
    // shipped a 0.15 duty-cycle default against its own documented, measured
    // 0.05 — the doc comment is the spec, so the defaults are pinned to it.
    // A deliberate default change must edit both, which is the point.
    expect(seen[0]).toMatchObject({
      starvation_aware: true,
      starvation_duty_cycle: 0.05,
      starvation_host_load: 1.0,
      starvation_max_consecutive: 5,
    });
    controller.reset();
  });
});
