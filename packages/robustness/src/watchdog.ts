/**
 * Configurable self-healing watchdog.
 *
 * The factory API isolates timers and policy for MCP, CLI, and TUI consumers.
 * Convenience exports retain the singleton API used by generated tools.
 */

import { writeFileSync } from "node:fs";
import { cpus, loadavg } from "node:os";
import { type IntervalHistogram, monitorEventLoopDelay } from "node:perf_hooks";
import { getHeapSpaceStatistics, getHeapStatistics } from "node:v8";
import { normalizeEnvPrefix } from "./env.js";
import { error, info, warn } from "./logger.js";
import {
  isShuttingDown,
  noteShutdownCause,
  registerCleanup,
  type ShutdownController,
  shutdown,
  unregisterCleanup,
} from "./shutdown.js";

/**
 * Normalised host load: 1-minute loadavg divided by CPU count, so 1.0 means
 * "as much runnable work as there are cores".
 *
 * `os.cpus().length` reports HOST cores, not a cgroup quota — a 1-CPU container
 * on a 64-core box understates its own saturation and this reads as idle, which
 * degrades toward killing, i.e. today's behaviour. A consumer that knows its
 * real quota should pass `hostLoadReader`.
 */
function defaultHostLoad(): number {
  const cores = cpus().length;
  const oneMinute = loadavg()[0] ?? 0;
  return cores > 0 ? oneMinute / cores : 0;
}

export interface WatchdogState {
  startedAt: number;
  eventLoopP99Ms: number;
  eventLoopMaxMs: number;
  eventLoopSustainedCount: number;
  lastEventLoopSampleTs: number;
  /** Cumulative CPU microseconds at the previous event-loop sample, or null before the first. */
  lastCpuUsageUs: number | null;
  /** Consecutive hard-threshold breaches downgraded as starvation. Bounds how long a wedge can hide. */
  blockedStarvedCount: number;
  rssMb: number;
  heapMb: number;
  heapHistory: number[];
  lastActivityTs: number;
  killReason: string | null;
  /**
   * False until the first memory sample lands. `rssMb`/`heapMb` are still
   * populated before then (read live on access), so this is the only way to
   * tell a fresh live reading from a sampler-recorded one.
   */
  memorySampled: boolean;
}

export interface WatchdogDiagnostic {
  level: "info" | "warn" | "error";
  event: string;
  data?: Record<string, unknown>;
}

/**
 * Every condition the watchdog acts on. `idle_restart` is a planned recycle
 * rather than a fault, but it reaches the same decision point, so it is part
 * of the same union: a consumer that wants to veto restarts can.
 */
export type WatchdogBreachReason =
  | "event_loop_blocked"
  | "event_loop_sustained_lag"
  | "rss_exceeded"
  | "memory_leak_suspected"
  | "idle_restart";

export interface WatchdogBreach {
  reason: WatchdogBreachReason;
  /** The same payload the `watchdog_kill: <reason>` diagnostic carries. */
  data: Record<string, unknown>;
}

export type WatchdogBreachVerdict = "kill" | "observe";

// Synchronous on purpose: the verdict is needed before the sampler can decide
// whether to shut the process down, and there is nothing sensible to do with a
// pending promise at that point. Do slow work in a queue the hook feeds.
//
// `| void`, not `| undefined`. Measured with tsc 5.9.3: against
// `WatchdogBreachVerdict | undefined`, both `() => {}` and `() => { return; }`
// fail with TS2322 ("Type 'void' is not assignable") — exactly the two shapes a
// consumer writes when it only wants to observe. `| void` is what makes "return
// nothing" mean "keep today's behaviour". The suppression has to be the last
// comment line before the declaration (biome does not carry it across another
// comment), which is why these notes are plain `//` and the docs a consumer
// hovers live on `WatchdogOptions.onBreach`.
// biome-ignore lint/suspicious/noConfusingVoidType: deliberate, see above
export type WatchdogBreachHandler = (breach: WatchdogBreach) => WatchdogBreachVerdict | void;

export interface WatchdogOptions {
  /** Environment namespace without trailing underscore. Defaults to MCP. */
  envPrefix?: string;
  /** Disable for interactive processes that must not restart while in use. */
  idleRestart?: boolean;
  eventLoopSampleMs?: number;
  eventLoopWarnMs?: number;
  eventLoopKillMs?: number;
  eventLoopSustainedMs?: number;
  eventLoopSustainedSamples?: number;
  /**
   * Duty cycle (CPU-ms per wall-ms, 0..1) at or below which the process counts
   * as OFF-CPU during a sustained-lag window. Default 0.05.
   *
   * Set LOW on purpose, and lower than first proposed. A genuinely spinning
   * process does NOT measure ~1.0 on a contended host — it gets descheduled too.
   * Four measurements, spanning two very different machines:
   *
   * | condition | duty cycle | where |
   * |---|---|---|
   * | off-CPU park (`Atomics.wait`) | **0.01%** | darwin/arm64, load ~24 |
   * | starved, real incident | **0.57%** | darwin/arm64, load ~24 |
   * | busy-spin | **74%** | darwin/arm64, load ~24 |
   * | busy-spin | **16.7%** | shared 2-core CI runner |
   *
   * That last row is why this default is 0.05 and not 0.15. It was measured by
   * this package's own test failing in CI, and it moves the worst case a long
   * way: a real spin can land at 17%, so a 0.15 threshold clears it by only ~10%.
   * Misclassifying a WEDGE as starvation is the dangerous direction — the
   * process is then never recycled and a hung server survives — so the threshold
   * belongs near the starved cluster, not near the spinning one.
   *
   * At 0.05 the margins are ~9x above the real starvation sample and ~3x below
   * the worst observed spin, instead of 26x and 1.1x.
   */
  starvationDutyCycle?: number;
  /**
   * Normalised host load (loadavg ÷ CPU count) at or above which the host counts
   * as SATURATED. Default 1.0 — i.e. more runnable work than cores.
   */
  starvationHostLoad?: number;
  /**
   * How many CONSECUTIVE hard-threshold (`event_loop_blocked`) breaches may be
   * downgraded as starvation before the watchdog kills anyway. Default 5.
   *
   * This is the bound that makes downgrading the hard path safe. Without it,
   * "starved, do not kill" on the immediate path means a genuinely wedged
   * process on a permanently busy host is never recycled — which is the exact
   * failure the watchdog exists to prevent, and the strongest argument against
   * touching this path at all.
   *
   * With it, the worst case is bounded: a wedge hides for at most
   * `starvationMaxConsecutive * eventLoopSampleMs` (default 25s) before being
   * killed regardless of what the CPU says. The counter resets on any sample
   * that does not breach.
   */
  starvationMaxConsecutive?: number;
  /**
   * Injectable CPU reader. Defaults to `process.cpuUsage`. Cumulative and
   * monotonic since process start, in microseconds.
   *
   * Exists so the starvation matrix is testable deterministically. That is not
   * a nicety: a test process on a loaded CI host sits in the low-CPU quadrant —
   * *exactly* the starved case — so a version of this feature that read the real
   * host would make the pre-existing lag test flaky in precisely the conditions
   * the feature is about, and it would present as flake rather than as a fault.
   */
  cpuUsageReader?: () => NodeJS.CpuUsage;
  /**
   * Injectable host-load reader, PRE-NORMALISED (loadavg ÷ CPUs). Defaults to
   * `os.loadavg()[0] / os.cpus().length`.
   *
   * Pre-normalised so the container caveat lives in one default rather than at
   * every call site: `os.cpus().length` reports HOST cores, not a cgroup quota,
   * so a 1-CPU container on a 64-core host understates its own saturation.
   * A consumer that knows its quota can pass a correct reader.
   */
  hostLoadReader?: () => number;
  memorySampleMs?: number;
  maxRssMb?: number;
  memoryGrowthSamples?: number;
  /** Minimum monotonic heap growth before treating samples as a leak. */
  memoryGrowthMinMb?: number;
  idleRestartAfterMs?: number;
  idleRestartQuietMs?: number;
  idleCheckMs?: number;
  /** Reset a delayed event-loop sample after this multiple of the sample interval. */
  sleepSkewMultiplier?: number;
  statePath?: string;
  onDiagnostic?: (diagnostic: WatchdogDiagnostic) => void;
  /**
   * Called synchronously on EVERY detected breach, before anything is killed.
   *
   * Return `"observe"` to keep the process alive: the breach is still logged
   * (`watchdog_breach_observed: <reason>`) but no kill reason is recorded, no
   * force-exit net is armed, and `shutdown()` is not called. Returning
   * `"kill"`, returning nothing, or throwing all leave today's behaviour
   * exactly as it was — which is why adding this cannot change an existing
   * consumer, and why the hook may not silently disarm the watchdog by
   * crashing.
   *
   * The verdict is per breach, not global: the handler receives the reason, so
   * `({ reason }) => (reason === "rss_exceeded" ? "observe" : "kill")` is the
   * whole mechanism for a per-condition policy.
   */
  onBreach?: WatchdogBreachHandler;
  /**
   * `noteShutdownCause` is optional in this shape on purpose: requiring it
   * would break every consumer (and test) that passes a hand-built stub of the
   * four original methods, and a required-member addition to a 0.x package
   * publishes a major.
   */
  shutdownController?: Pick<
    ShutdownController,
    "registerCleanup" | "unregisterCleanup" | "isShuttingDown" | "shutdown"
  > &
    Partial<Pick<ShutdownController, "noteShutdownCause">>;
  /** Test/embed hook. Defaults to process.exit. */
  exit?: (code: number) => void;
}

export interface WatchdogController {
  install(): void;
  dispose(): void;
  /**
   * Apply new options to the live controller. Merges over the current options
   * and re-reads the environment under the resolved prefix; accumulated state
   * and memory-sample subscribers survive, and live timers are re-armed only
   * when their interval actually changed. Throws without mutating anything if
   * an option is invalid.
   */
  reconfigure(options: WatchdogOptions): void;
  reset(): void;
  noteActivity(): void;
  readState(): Readonly<WatchdogState>;
  onMemorySample(callback: MemorySampleCallback): () => void;
}

export type MemorySampleCallback = (rssMb: number, heapMb: number) => void;

const defaultShutdownController: WatchdogOptions["shutdownController"] = {
  registerCleanup,
  unregisterCleanup,
  isShuttingDown,
  noteShutdownCause,
  shutdown: async (exitCode?: number) => {
    await shutdown(exitCode);
  },
};

/**
 * Resolve options + environment into concrete policy. Kept separate from the
 * controller so `reconfigure` can rebuild (and re-read the environment under a
 * new prefix) before mutating anything — `normalizeEnvPrefix` throws on a bad
 * prefix, which must leave the live controller untouched.
 */
function buildConfig(options: WatchdogOptions) {
  // "watchdog" is load-bearing: two tests pin the exact error string.
  const envPrefix = normalizeEnvPrefix(options.envPrefix ?? "MCP", "watchdog");
  const numberOption = (value: number | undefined, envSuffix: string, fallback: number): number =>
    value ?? readPositiveNumber(`${envPrefix}_${envSuffix}`, fallback);

  return {
    envPrefix,
    eventLoopSampleMs: numberOption(options.eventLoopSampleMs, "EVENT_LOOP_SAMPLE_MS", 5_000),
    eventLoopWarnMs: numberOption(options.eventLoopWarnMs, "EVENT_LOOP_WARN_MS", 500),
    eventLoopKillMs: numberOption(options.eventLoopKillMs, "EVENT_LOOP_KILL_MS", 10_000),
    eventLoopSustainedMs: numberOption(
      options.eventLoopSustainedMs,
      "EVENT_LOOP_SUSTAINED_MS",
      750,
    ),
    eventLoopSustainedSamples: numberOption(
      options.eventLoopSustainedSamples,
      "EVENT_LOOP_SUSTAINED_SAMPLES",
      6,
    ),
    starvationDutyCycle: numberOption(options.starvationDutyCycle, "STARVATION_DUTY_CYCLE", 0.15),
    starvationHostLoad: numberOption(options.starvationHostLoad, "STARVATION_HOST_LOAD", 1.0),
    starvationMaxConsecutive: numberOption(
      options.starvationMaxConsecutive,
      "STARVATION_MAX_CONSECUTIVE",
      5,
    ),
    memorySampleMs: numberOption(options.memorySampleMs, "MEMORY_SAMPLE_MS", 60_000),
    maxRssMb: numberOption(options.maxRssMb, "MAX_RSS_MB", 1_024),
    memoryGrowthSamples: numberOption(options.memoryGrowthSamples, "HEAP_GROWTH_SAMPLES", 10),
    memoryGrowthMinMb: numberOption(options.memoryGrowthMinMb, "HEAP_GROWTH_MIN_MB", 25),
    idleRestartAfterMs: numberOption(
      options.idleRestartAfterMs,
      "RESTART_AFTER_MS",
      24 * 60 * 60 * 1_000,
    ),
    idleRestartQuietMs: numberOption(
      options.idleRestartQuietMs,
      "RESTART_QUIET_MS",
      60 * 60 * 1_000,
    ),
    idleCheckMs: numberOption(options.idleCheckMs, "IDLE_CHECK_MS", 10 * 60 * 1_000),
    sleepSkewMultiplier: options.sleepSkewMultiplier ?? 3,
    idleRestart: options.idleRestart ?? true,
    statePath: options.statePath ?? process.env[`${envPrefix}_WATCHDOG_STATE_PATH`] ?? "",
  };
}

export function createWatchdog(options: WatchdogOptions = {}): WatchdogController {
  let opts: WatchdogOptions = { ...options };
  let config = buildConfig(opts);
  let shutdownController = opts.shutdownController ?? defaultShutdownController;
  let exit = opts.exit ?? ((code: number) => process.exit(code));
  const subscribers = new Set<MemorySampleCallback>();
  const state = initialState();
  let eventLoopHistogram: IntervalHistogram | null = null;
  let eventLoopTimer: ReturnType<typeof setInterval> | null = null;
  let memoryTimer: ReturnType<typeof setInterval> | null = null;
  let idleTimer: ReturnType<typeof setInterval> | null = null;
  let forceExitTimer: ReturnType<typeof setTimeout> | null = null;
  let installed = false;

  const diagnostic = (
    level: WatchdogDiagnostic["level"],
    event: string,
    data?: Record<string, unknown>,
  ): void => {
    if (opts.onDiagnostic) {
      opts.onDiagnostic({ level, event, ...(data ? { data } : {}) });
      return;
    }
    if (level === "error") error(event, data);
    else if (level === "warn") warn(event, data);
    else info(event, data);
  };

  /**
   * Ask the consumer what to do about a breach. True means "kill", which is
   * what every path did unconditionally before `onBreach` existed.
   *
   * A non-killed breach is deliberately NOT latched: the hook fires again on
   * every sample that still breaches. The sampler interval is already the rate
   * limit (5s event loop, 60s memory), the file's own `event_loop_lag` warning
   * has warned on that same cadence since day one, and a latched hook makes
   * "kill on the third consecutive breach" impossible to express without the
   * consumer rebuilding the sampler's timing itself.
   */
  const shouldKill = (reason: WatchdogBreachReason, data: Record<string, unknown>): boolean => {
    // A kill is already in flight. Neither notify nor kill again.
    if (state.killReason) return false;
    if (!opts.onBreach) return true;

    try {
      if (opts.onBreach({ reason, data }) !== "observe") return true;
    } catch (err) {
      // Fail closed. A consumer hook that throws must not be able to turn the
      // watchdog off, which is exactly what swallowing this and returning
      // false would do. Only the hook call is inside the try, so a failing
      // logger is never misreported as a failing breach handler.
      diagnostic("error", "watchdog_breach_handler_failed", {
        reason,
        error: err instanceof Error ? err.message : String(err),
      });
      return true;
    }

    // Distinct event name, not `watchdog_kill`: a log scraper keyed on the kill
    // line must not see a kill that never happened.
    diagnostic("warn", `watchdog_breach_observed: ${reason}`, data);
    return false;
  };

  const triggerKill = (reason: WatchdogBreachReason, data: Record<string, unknown>): void => {
    if (state.killReason) return;
    state.killReason = reason;
    // Before shutdown(), so the watchdog is the first writer: the shutdown it
    // initiates would otherwise be attributed to whatever fires next.
    shutdownController?.noteShutdownCause?.(`watchdog:${reason}`);
    diagnostic("error", `watchdog_kill: ${reason}`, data);
    forceExitTimer = setTimeout(() => {
      diagnostic("error", "watchdog_force_exit", { reason });
      exit(137);
    }, 5_000);
    forceExitTimer.unref();
    void shutdownController?.shutdown(1).catch(() => exit(1));
  };

  /**
   * Is sustained event-loop lag this process's fault, or the host's?
   *
   * From inside a process the two are INDISTINGUISHABLE by lag alone: "my code
   * blocked the loop" and "the OS did not schedule me" produce identical delay
   * histograms. The discriminator is CPU consumed during the window.
   *
   *   lag + high CPU                 -> spinning on its own work  -> KILL
   *   lag + low CPU + host saturated -> starved by the host       -> OBSERVE
   *   lag + low CPU + host idle      -> blocked in a syscall      -> KILL
   *
   * The third row is why duty cycle alone is not enough, and it is not
   * hypothetical: a synchronous syscall waiting on IPC parks the thread
   * off-CPU while the loop is fully stopped. A pure duty-cycle test reads that
   * as "starved, do not kill" and leaves the process wedged forever — the exact
   * failure the watchdog exists to catch.
   *
   * Why observing beats killing when starved: a restart does not give a starved
   * process CPU, and process creation is itself CPU-intensive, so killing adds
   * load to an already-saturated host and pushes more processes over the same
   * threshold. Measured in the field: 126 respawns of one consumer at a 0.57%
   * duty cycle, with a second consumer self-killing on the same signature in the
   * same window.
   *
   * Reported and designed by browser-tab-mcp, 2026-08-25, with up-bank-mcp as
   * the independent second instance.
   */
  const classifySustainedLag = (
    dutyCycle: number | null,
  ): { starved: boolean; evidence: Record<string, unknown> } => {
    // No baseline yet (the very first sample) or an unusable reading: fall
    // through to today's behaviour. NEVER invent a duty cycle — a fabricated
    // "low" reading would suppress a real kill.
    if (dutyCycle === null) {
      return { starved: false, evidence: { duty_cycle: null } };
    }

    if (dutyCycle > config.starvationDutyCycle) {
      // On-CPU: spinning on its own work. Host load is irrelevant here — a
      // spinning wedge is on-CPU whatever else the machine is doing, which is
      // what stops high load from ever suppressing a genuine kill.
      return { starved: false, evidence: { duty_cycle: dutyCycle, verdict: "wedged_spinning" } };
    }

    const readLoad = opts.hostLoadReader ?? defaultHostLoad;
    const hostLoad = (() => {
      try {
        return readLoad();
      } catch {
        return null;
      }
    })();

    // Windows returns [0,0,0] from loadavg, so hostLoad reads as idle there and
    // this degrades to today's behaviour (kill). Documented, not discovered.
    if (hostLoad === null || hostLoad < config.starvationHostLoad) {
      return {
        starved: false,
        evidence: { duty_cycle: dutyCycle, host_load: hostLoad, verdict: "wedged_off_cpu" },
      };
    }

    return {
      starved: true,
      evidence: { duty_cycle: dutyCycle, host_load: hostLoad, verdict: "starved_by_host" },
    };
  };

  const sampleEventLoop = (): void => {
    if (!eventLoopHistogram || shutdownController?.isShuttingDown()) return;
    const now = Date.now();
    const elapsed = now - state.lastEventLoopSampleTs;
    state.lastEventLoopSampleTs = now;
    if (elapsed > config.sleepSkewMultiplier * config.eventLoopSampleMs) {
      eventLoopHistogram.reset();
      state.eventLoopSustainedCount = 0;
      diagnostic("info", "sleep_detected_skipping_sample", {
        actual_interval_ms: elapsed,
        expected_interval_ms: config.eventLoopSampleMs,
      });
      return;
    }

    // Duty cycle is computed on EVERY sample, not only breaching ones, so the
    // window always covers exactly one sample interval. Computing it lazily at
    // breach time would span however many samples since the last breach — and
    // would have no baseline at all on the first one.
    const dutyCycle = ((): number | null => {
      const readCpu = opts.cpuUsageReader ?? (() => process.cpuUsage());
      let totalUs: number | null = null;
      try {
        const u = readCpu();
        totalUs = u.user + u.system;
      } catch {
        totalUs = null;
      }
      const previousUs = state.lastCpuUsageUs;
      if (totalUs !== null) state.lastCpuUsageUs = totalUs;
      if (totalUs === null || previousUs === null || elapsed <= 0) return null;
      return (totalUs - previousUs) / 1000 / elapsed;
    })();

    const p99Ms = eventLoopHistogram.percentile(99) / 1e6;
    const maxMs = eventLoopHistogram.max / 1e6;
    state.eventLoopP99Ms = p99Ms;
    state.eventLoopMaxMs = maxMs;
    eventLoopHistogram.reset();
    writeStateSnapshot(config.statePath, state);

    if (p99Ms >= config.eventLoopKillMs) {
      const data = { p99_ms: p99Ms, max_ms: maxMs, threshold_ms: config.eventLoopKillMs };

      // The hard path is classified TOO, since 0.14.0. It was excluded in
      // 0.13.0 on the evidence available then — 223 real starvation samples
      // whose worst reached 7646ms, never crossing 10s — and that evidence came
      // with an explicit caveat from the session that produced it: one machine
      // at ~5x oversubscription, and it could not speak for a far busier host.
      //
      // The caveat was right. up-bank-mcp measured an 11567ms sample at load
      // 58 on a bank-facing service, post-0.13.0, and it was killed. At load 58
      // an 11.5s stall is starvation with MORE confidence, not less — so the
      // spike path was reintroducing the feedback loop the sustained path had
      // just removed, only at a higher load threshold.
      //
      // What keeps this safe is the BOUND below, not the classification: a
      // starved verdict here defers the kill, it does not cancel it.
      const verdict = classifySustainedLag(dutyCycle);
      if (verdict.starved) {
        state.blockedStarvedCount++;
        const enriched = {
          ...data,
          ...verdict.evidence,
          consecutive_starved: state.blockedStarvedCount,
          starved_limit: config.starvationMaxConsecutive,
        };
        if (state.blockedStarvedCount < config.starvationMaxConsecutive) {
          diagnostic("warn", "event_loop_blocked_starved_deferring_kill", enriched);
          return;
        }
        // Bound reached. Whatever the CPU says, a process that has been unable
        // to run for this long is not serving anyone — kill it and let the
        // supervisor decide when to bring it back.
        diagnostic("error", "event_loop_blocked_starved_limit_reached", enriched);
        if (shouldKill("event_loop_blocked", enriched)) triggerKill("event_loop_blocked", enriched);
        return;
      }

      state.blockedStarvedCount = 0;
      const enriched = { ...data, ...verdict.evidence };
      if (shouldKill("event_loop_blocked", enriched)) triggerKill("event_loop_blocked", enriched);
      // Returns even when observed: the control flow below (sustained counter,
      // lag warning) is unreachable at this p99 anyway, and keeping the shape
      // identical to the kill path is one less thing to reason about.
      return;
    }
    if (p99Ms >= config.eventLoopSustainedMs) {
      state.eventLoopSustainedCount++;
      if (state.eventLoopSustainedCount >= config.eventLoopSustainedSamples) {
        // The counter is deliberately not reset when the breach is observed:
        // `consecutive_samples` keeps climbing, which is the number a consumer
        // needs to escalate on its own schedule.
        const data = {
          p99_ms: p99Ms,
          max_ms: maxMs,
          consecutive_samples: state.eventLoopSustainedCount,
          sample_interval_ms: config.eventLoopSampleMs,
          sustained_threshold_ms: config.eventLoopSustainedMs,
        };
        // STARVATION CHECK. Applies to THIS reason only — never to
        // `event_loop_blocked` above. See `starvationDutyCycle` for why.
        const verdict = classifySustainedLag(dutyCycle);
        const enriched = { ...data, ...verdict.evidence };
        if (verdict.starved) {
          // Deliberately NOT a kill, and deliberately not silent. The label is
          // the whole point: two sessions lost an evening to `watchdog_kill:
          // event_loop_sustained_lag` on a process that was never on-CPU.
          diagnostic("warn", "event_loop_starved_not_killed", enriched);
          return;
        }
        if (shouldKill("event_loop_sustained_lag", enriched)) {
          triggerKill("event_loop_sustained_lag", enriched);
        }
        return;
      }
    } else {
      state.eventLoopSustainedCount = 0;
      state.blockedStarvedCount = 0;
    }
    if (p99Ms >= config.eventLoopWarnMs) {
      diagnostic("warn", "event_loop_lag", {
        p99_ms: p99Ms,
        max_ms: maxMs,
        threshold_ms: config.eventLoopWarnMs,
      });
    }
  };

  const sampleMemory = (): void => {
    if (shutdownController?.isShuttingDown()) return;
    const usage = process.memoryUsage();
    const rssMb = round1(usage.rss / 1_024 / 1_024);
    const heapMb = round1(usage.heapUsed / 1_024 / 1_024);
    state.rssMb = rssMb;
    state.heapMb = heapMb;
    state.memorySampled = true;

    for (const callback of subscribers) {
      try {
        callback(rssMb, heapMb);
      } catch {
        // Subscriber failures must not compromise the watchdog.
      }
    }

    state.heapHistory.push(heapMb);
    if (state.heapHistory.length > config.memoryGrowthSamples) state.heapHistory.shift();

    if (rssMb >= config.maxRssMb) {
      const data = { rss_mb: rssMb, threshold_mb: config.maxRssMb };
      // Forensics are gathered only on the kill path. Their order relative to
      // `watchdog_kill` is unchanged, but an observed breach re-fires every
      // memory sample, and full heap statistics plus every heap space is not a
      // payload to emit every 60s forever for a condition the consumer has
      // explicitly chosen to tolerate.
      if (shouldKill("rss_exceeded", data)) {
        try {
          diagnostic("error", "rss_kill_heap_forensics", {
            heap_stats: getHeapStatistics(),
            heap_spaces: getHeapSpaceStatistics().map((space) => ({
              name: space.space_name,
              used_mb: round1(space.space_used_size / 1_024 / 1_024),
            })),
            memory_usage: {
              rss_mb: rssMb,
              heap_used_mb: heapMb,
              external_mb: round1(usage.external / 1_024 / 1_024),
              array_buffers_mb: round1(usage.arrayBuffers / 1_024 / 1_024),
            },
          });
        } catch {
          // Forensics must never delay the kill.
        }
        triggerKill("rss_exceeded", data);
      }
      return;
    }

    if (
      state.heapHistory.length >= config.memoryGrowthSamples &&
      isMonotonicallyGrowing(state.heapHistory, config.memoryGrowthMinMb)
    ) {
      const data = {
        samples: state.heapHistory.slice(),
        sample_interval_ms: config.memorySampleMs,
        minimum_growth_mb: config.memoryGrowthMinMb,
      };
      if (shouldKill("memory_leak_suspected", data)) triggerKill("memory_leak_suspected", data);
    }
  };

  const checkIdle = (): void => {
    if (shutdownController?.isShuttingDown()) return;
    const uptimeMs = Date.now() - state.startedAt;
    const idleMs = Date.now() - state.lastActivityTs;
    if (uptimeMs >= config.idleRestartAfterMs && idleMs >= config.idleRestartQuietMs) {
      const data = { uptime_ms: uptimeMs, idle_ms: idleMs };
      if (shouldKill("idle_restart", data)) triggerKill("idle_restart", data);
    }
  };

  const rearmTimers = (): void => {
    if (eventLoopTimer) clearInterval(eventLoopTimer);
    if (memoryTimer) clearInterval(memoryTimer);
    if (idleTimer) clearInterval(idleTimer);
    idleTimer = null;
    // A changed sample window must not read as a machine sleep to the next
    // sample — see the skew guard in sampleEventLoop.
    state.lastEventLoopSampleTs = Date.now();
    state.blockedStarvedCount = 0;
    // SEED the CPU baseline at install, not on the first sample. Without this
    // the very first breach after startup has no previous reading, so it cannot
    // be classified and kills unclassified — which is precisely the immediate
    // post-start window where a host is busiest (module loading, several
    // services coming up at once) and starvation is most likely.
    state.lastCpuUsageUs = (() => {
      try {
        const u = (opts.cpuUsageReader ?? (() => process.cpuUsage()))();
        return u.user + u.system;
      } catch {
        return null;
      }
    })();
    eventLoopTimer = setInterval(sampleEventLoop, config.eventLoopSampleMs);
    eventLoopTimer.unref();
    memoryTimer = setInterval(sampleMemory, config.memorySampleMs);
    memoryTimer.unref();
    if (config.idleRestart) {
      idleTimer = setInterval(checkIdle, config.idleCheckMs);
      idleTimer.unref();
    }
  };

  const dispose = (): void => {
    if (eventLoopHistogram) eventLoopHistogram.disable();
    eventLoopHistogram = null;
    if (eventLoopTimer) clearInterval(eventLoopTimer);
    if (memoryTimer) clearInterval(memoryTimer);
    if (idleTimer) clearInterval(idleTimer);
    eventLoopTimer = null;
    memoryTimer = null;
    idleTimer = null;
    // The force-exit timer is deliberately NOT cleared while a kill is in
    // flight. `dispose` is itself a registered shutdown cleanup, so a kill
    // reaches it via shutdown() — clearing here disarmed the last-resort net
    // during the exact hang it exists to escape, leaving a wedged cleanup with
    // nothing to kill the process. Voluntary disposal (tests, embedding) has no
    // kill in flight and still clears it.
    if (forceExitTimer && !state.killReason) {
      clearTimeout(forceExitTimer);
      forceExitTimer = null;
    }
    shutdownController?.unregisterCleanup(dispose);
    installed = false;
  };

  const install = (): void => {
    if (installed) return;
    installed = true;
    eventLoopHistogram = monitorEventLoopDelay({ resolution: 20 });
    eventLoopHistogram.enable();
    rearmTimers();
    shutdownController?.registerCleanup(dispose);
    diagnostic("info", "watchdog_installed", {
      env_prefix: config.envPrefix,
      event_loop_warn_ms: config.eventLoopWarnMs,
      event_loop_kill_ms: config.eventLoopKillMs,
      event_loop_sustained_ms: config.eventLoopSustainedMs,
      event_loop_sustained_samples: config.eventLoopSustainedSamples,
      max_rss_mb: config.maxRssMb,
      memory_growth_samples: config.memoryGrowthSamples,
      memory_growth_min_mb: config.memoryGrowthMinMb,
      idle_restart: config.idleRestart,
      idle_restart_after_ms: config.idleRestartAfterMs,
      // Emitted so an OPERATOR can tell which classifier is running from the
      // logs alone. Before 0.14.0 this line was byte-identical between 0.12.0
      // and 0.13.0 despite a behaviour change, and a consumer nearly recorded
      // the starvation fix as not-live on that basis — the only way to know was
      // to grep the installed package. A diagnostic that cannot distinguish two
      // behaviours it configures is not doing its job.
      starvation_aware: true,
      starvation_duty_cycle: config.starvationDutyCycle,
      starvation_host_load: config.starvationHostLoad,
      starvation_max_consecutive: config.starvationMaxConsecutive,
    });
  };

  const reconfigure = (next: WatchdogOptions): void => {
    if (state.killReason) {
      // A kill is already in flight; do not resurrect a dying process.
      diagnostic("warn", "watchdog_reconfigure_ignored", { kill_reason: state.killReason });
      return;
    }

    const merged: WatchdogOptions = { ...opts, ...next };
    // Throws on an invalid envPrefix BEFORE anything is mutated.
    const nextConfig = buildConfig(merged);
    const nextShutdownController = merged.shutdownController ?? defaultShutdownController;

    // Thresholds are read live by the samplers; only these four shape the
    // timers themselves.
    const timersNeedRearm =
      installed &&
      (nextConfig.eventLoopSampleMs !== config.eventLoopSampleMs ||
        nextConfig.memorySampleMs !== config.memorySampleMs ||
        nextConfig.idleCheckMs !== config.idleCheckMs ||
        nextConfig.idleRestart !== config.idleRestart);
    const shutdownControllerChanged = installed && nextShutdownController !== shutdownController;

    if (shutdownControllerChanged) shutdownController?.unregisterCleanup(dispose);
    opts = merged;
    config = nextConfig;
    shutdownController = nextShutdownController;
    exit = merged.exit ?? ((code: number) => process.exit(code));
    if (shutdownControllerChanged) shutdownController?.registerCleanup(dispose);
    if (timersNeedRearm) rearmTimers();

    // state and subscribers are deliberately untouched — they are exactly what
    // a dispose-and-recreate "fix" would drop.
    diagnostic("info", "watchdog_reconfigured", {
      env_prefix: config.envPrefix,
      idle_restart: config.idleRestart,
      max_rss_mb: config.maxRssMb,
      timers_rearmed: timersNeedRearm,
    });
  };

  const reset = (): void => {
    dispose();
    // Unlike dispose, reset is unconditional teardown: drop the force-exit
    // timer even mid-kill so a test cannot leave one armed for the next case.
    if (forceExitTimer) {
      clearTimeout(forceExitTimer);
      forceExitTimer = null;
    }
    Object.assign(state, initialState());
    state.heapHistory = [];
    subscribers.clear();
  };

  return {
    install,
    dispose,
    reconfigure,
    reset,
    noteActivity: () => {
      state.lastActivityTs = Date.now();
    },
    // Identity is preserved once sampled — a caller holding the reference keeps
    // seeing live updates, as before. Only the pre-first-sample case allocates.
    // Identity is preserved once sampled — a caller holding the reference keeps
    // seeing live updates, as before. Only the pre-first-sample case allocates.
    readState: () => (state.memorySampled ? state : { ...state, ...resolveMemory(state) }),
    onMemorySample: (callback) => {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
  };
}

function initialState(): WatchdogState {
  const now = Date.now();
  return {
    startedAt: now,
    eventLoopP99Ms: 0,
    eventLoopMaxMs: 0,
    eventLoopSustainedCount: 0,
    lastEventLoopSampleTs: now,
    lastCpuUsageUs: null,
    blockedStarvedCount: 0,
    rssMb: 0,
    heapMb: 0,
    heapHistory: [],
    lastActivityTs: now,
    killReason: null,
    memorySampled: false,
  };
}

/**
 * Memory figures with the pre-first-sample hole filled in.
 *
 * The sampler runs every `memorySampleMs` (default 60s) but consumers poll far
 * faster — dev panels every few seconds, health endpoints on demand — so until
 * the first sample landed both figures read 0. A freshly started process
 * reported using no memory during exactly the window someone debugging a
 * startup problem is watching. Reading live costs one `process.memoryUsage()`
 * call and is the same measurement the sampler takes; `memorySampled` keeps the
 * "not sampled yet" distinction available rather than erasing it.
 */
function resolveMemory(state: WatchdogState): { rssMb: number; heapMb: number } {
  if (state.memorySampled) return { rssMb: state.rssMb, heapMb: state.heapMb };
  const usage = process.memoryUsage();
  return {
    rssMb: round1(usage.rss / 1_024 / 1_024),
    heapMb: round1(usage.heapUsed / 1_024 / 1_024),
  };
}

function readPositiveNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function writeStateSnapshot(path: string, state: WatchdogState): void {
  if (!path) return;
  try {
    // Same fill-in as readState: the event-loop sampler writes this snapshot
    // every 5s by default, twelve times before the first 60s memory sample.
    const { rssMb, heapMb } = resolveMemory(state);
    writeFileSync(
      path,
      JSON.stringify({
        ts: Date.now(),
        uptimeMs: Date.now() - state.startedAt,
        eventLoopP99Ms: state.eventLoopP99Ms,
        eventLoopMaxMs: state.eventLoopMaxMs,
        eventLoopSustainedCount: state.eventLoopSustainedCount,
        rssMb,
        heapMb,
        memorySampled: state.memorySampled,
        killReason: state.killReason,
      }),
    );
  } catch {
    // Observer writes are best-effort.
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function isMonotonicallyGrowing(samples: readonly number[], minimumGrowthMb = 25): boolean {
  if (samples.length < 2) return false;
  const first = samples[0];
  const last = samples.at(-1);
  if (first === undefined || last === undefined) return false;
  let previous = first;
  for (let index = 1; index < samples.length; index++) {
    const value = samples[index];
    if (value === undefined || value < previous) return false;
    previous = value;
  }
  return last - first >= minimumGrowthMb;
}

let defaultWatchdog: WatchdogController | undefined;

function singleton(): WatchdogController {
  if (!defaultWatchdog) defaultWatchdog = createWatchdog();
  return defaultWatchdog;
}

export function installWatchdog(options: WatchdogOptions = {}): void {
  const controller = singleton();
  // Reconfigure rather than construct-with-options: readWatchdogState(),
  // noteActivity() and onMemorySample() all build the singleton lazily, so
  // whichever ran first used to win and later options were silently dropped.
  if (Object.keys(options).length > 0) controller.reconfigure(options);
  controller.install();
}

export function noteActivity(): void {
  singleton().noteActivity();
}

export function readWatchdogState(): Readonly<WatchdogState> {
  return singleton().readState();
}

export function onMemorySample(callback: MemorySampleCallback): () => void {
  return singleton().onMemorySample(callback);
}

/** @internal */
export function _resetForTests(): void {
  defaultWatchdog?.reset();
  defaultWatchdog = undefined;
}
