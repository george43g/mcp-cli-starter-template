/**
 * Configurable self-healing watchdog.
 *
 * The factory API isolates timers and policy for MCP, CLI, and TUI consumers.
 * Convenience exports retain the singleton API used by generated tools.
 */

import { writeFileSync } from "node:fs";
import { type IntervalHistogram, monitorEventLoopDelay } from "node:perf_hooks";
import { getHeapSpaceStatistics, getHeapStatistics } from "node:v8";
import { error, info, warn } from "./logger.js";
import {
  isShuttingDown,
  registerCleanup,
  type ShutdownController,
  shutdown,
  unregisterCleanup,
} from "./shutdown.js";

export interface WatchdogState {
  startedAt: number;
  eventLoopP99Ms: number;
  eventLoopMaxMs: number;
  eventLoopSustainedCount: number;
  lastEventLoopSampleTs: number;
  rssMb: number;
  heapMb: number;
  heapHistory: number[];
  lastActivityTs: number;
  killReason: string | null;
}

export interface WatchdogDiagnostic {
  level: "info" | "warn" | "error";
  event: string;
  data?: Record<string, unknown>;
}

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
  shutdownController?: Pick<
    ShutdownController,
    "registerCleanup" | "unregisterCleanup" | "isShuttingDown" | "shutdown"
  >;
  /** Test/embed hook. Defaults to process.exit. */
  exit?: (code: number) => void;
}

export interface WatchdogController {
  install(): void;
  dispose(): void;
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
  shutdown: async (exitCode?: number) => {
    await shutdown(exitCode);
  },
};

export function createWatchdog(options: WatchdogOptions = {}): WatchdogController {
  const envPrefix = normalizeEnvPrefix(options.envPrefix ?? "MCP");
  const numberOption = (value: number | undefined, envSuffix: string, fallback: number): number =>
    value ?? readPositiveNumber(`${envPrefix}_${envSuffix}`, fallback);

  const config = {
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
  const shutdownController = options.shutdownController ?? defaultShutdownController;
  const exit = options.exit ?? ((code: number) => process.exit(code));
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
    if (options.onDiagnostic) {
      options.onDiagnostic({ level, event, ...(data ? { data } : {}) });
      return;
    }
    if (level === "error") error(event, data);
    else if (level === "warn") warn(event, data);
    else info(event, data);
  };

  const triggerKill = (reason: string, data: Record<string, unknown>): void => {
    if (state.killReason) return;
    state.killReason = reason;
    diagnostic("error", `watchdog_kill: ${reason}`, data);
    forceExitTimer = setTimeout(() => {
      diagnostic("error", "watchdog_force_exit", { reason });
      exit(137);
    }, 5_000);
    forceExitTimer.unref();
    void shutdownController?.shutdown(1).catch(() => exit(1));
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

    const p99Ms = eventLoopHistogram.percentile(99) / 1e6;
    const maxMs = eventLoopHistogram.max / 1e6;
    state.eventLoopP99Ms = p99Ms;
    state.eventLoopMaxMs = maxMs;
    eventLoopHistogram.reset();
    writeStateSnapshot(config.statePath, state);

    if (p99Ms >= config.eventLoopKillMs) {
      triggerKill("event_loop_blocked", {
        p99_ms: p99Ms,
        max_ms: maxMs,
        threshold_ms: config.eventLoopKillMs,
      });
      return;
    }
    if (p99Ms >= config.eventLoopSustainedMs) {
      state.eventLoopSustainedCount++;
      if (state.eventLoopSustainedCount >= config.eventLoopSustainedSamples) {
        triggerKill("event_loop_sustained_lag", {
          p99_ms: p99Ms,
          max_ms: maxMs,
          consecutive_samples: state.eventLoopSustainedCount,
          sample_interval_ms: config.eventLoopSampleMs,
          sustained_threshold_ms: config.eventLoopSustainedMs,
        });
        return;
      }
    } else {
      state.eventLoopSustainedCount = 0;
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
      triggerKill("rss_exceeded", { rss_mb: rssMb, threshold_mb: config.maxRssMb });
      return;
    }

    if (
      state.heapHistory.length >= config.memoryGrowthSamples &&
      isMonotonicallyGrowing(state.heapHistory, config.memoryGrowthMinMb)
    ) {
      triggerKill("memory_leak_suspected", {
        samples: state.heapHistory.slice(),
        sample_interval_ms: config.memorySampleMs,
        minimum_growth_mb: config.memoryGrowthMinMb,
      });
    }
  };

  const checkIdle = (): void => {
    if (shutdownController?.isShuttingDown()) return;
    const uptimeMs = Date.now() - state.startedAt;
    const idleMs = Date.now() - state.lastActivityTs;
    if (uptimeMs >= config.idleRestartAfterMs && idleMs >= config.idleRestartQuietMs) {
      triggerKill("idle_restart", { uptime_ms: uptimeMs, idle_ms: idleMs });
    }
  };

  const dispose = (): void => {
    if (eventLoopHistogram) eventLoopHistogram.disable();
    eventLoopHistogram = null;
    if (eventLoopTimer) clearInterval(eventLoopTimer);
    if (memoryTimer) clearInterval(memoryTimer);
    if (idleTimer) clearInterval(idleTimer);
    if (forceExitTimer) clearTimeout(forceExitTimer);
    eventLoopTimer = null;
    memoryTimer = null;
    idleTimer = null;
    forceExitTimer = null;
    shutdownController?.unregisterCleanup(dispose);
    installed = false;
  };

  const install = (): void => {
    if (installed) return;
    installed = true;
    state.lastEventLoopSampleTs = Date.now();
    eventLoopHistogram = monitorEventLoopDelay({ resolution: 20 });
    eventLoopHistogram.enable();
    eventLoopTimer = setInterval(sampleEventLoop, config.eventLoopSampleMs);
    eventLoopTimer.unref();
    memoryTimer = setInterval(sampleMemory, config.memorySampleMs);
    memoryTimer.unref();
    if (config.idleRestart) {
      idleTimer = setInterval(checkIdle, config.idleCheckMs);
      idleTimer.unref();
    }
    shutdownController?.registerCleanup(dispose);
    diagnostic("info", "watchdog_installed", {
      env_prefix: envPrefix,
      event_loop_warn_ms: config.eventLoopWarnMs,
      event_loop_kill_ms: config.eventLoopKillMs,
      event_loop_sustained_ms: config.eventLoopSustainedMs,
      event_loop_sustained_samples: config.eventLoopSustainedSamples,
      max_rss_mb: config.maxRssMb,
      memory_growth_samples: config.memoryGrowthSamples,
      memory_growth_min_mb: config.memoryGrowthMinMb,
      idle_restart: config.idleRestart,
      idle_restart_after_ms: config.idleRestartAfterMs,
    });
  };

  const reset = (): void => {
    dispose();
    Object.assign(state, initialState());
    state.heapHistory = [];
    subscribers.clear();
  };

  return {
    install,
    dispose,
    reset,
    noteActivity: () => {
      state.lastActivityTs = Date.now();
    },
    readState: () => state,
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
    rssMb: 0,
    heapMb: 0,
    heapHistory: [],
    lastActivityTs: now,
    killReason: null,
  };
}

function normalizeEnvPrefix(prefix: string): string {
  const normalized = prefix.replace(/_+$/, "").toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*$/.test(normalized)) {
    throw new Error(`Invalid watchdog envPrefix "${prefix}"`);
  }
  return normalized;
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
    writeFileSync(
      path,
      JSON.stringify({
        ts: Date.now(),
        uptimeMs: Date.now() - state.startedAt,
        eventLoopP99Ms: state.eventLoopP99Ms,
        eventLoopMaxMs: state.eventLoopMaxMs,
        eventLoopSustainedCount: state.eventLoopSustainedCount,
        rssMb: state.rssMb,
        heapMb: state.heapMb,
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

function singleton(options?: WatchdogOptions): WatchdogController {
  if (!defaultWatchdog) defaultWatchdog = createWatchdog(options);
  return defaultWatchdog;
}

export function installWatchdog(options: WatchdogOptions = {}): void {
  singleton(options).install();
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
