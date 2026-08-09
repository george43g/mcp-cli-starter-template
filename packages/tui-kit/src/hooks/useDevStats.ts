/**
 * Dev stats hook — samples process metrics + watchdog state.
 *
 * Generalized from imsg-mcp/src/tui/hooks/useDevStats.ts. The TUI renders
 * the result via DevStatsPanel; toggled with the `d` key in the host App.
 *
 * `visible` selects the sampling source. While the stats are on screen the
 * hook samples on a 2s interval; while hidden it rides the watchdog's
 * existing 60s memory sample instead. A 2s setState with the panel hidden
 * re-renders the entire app 30x/min forever — measured at ~17-20MB/min of
 * heap churn/retention in two real rss_exceeded kills (2026-07-12). The
 * watchdog cadence keeps an always-visible compact readout (status bar,
 * footer) fresh to within a minute at 1/30th the render rate.
 */

import { onMemorySample, readWatchdogState } from "@george43g/robustness";
import { useEffect, useRef, useState } from "react";

export interface DevStats {
  pid: number;
  uptimeSec: number;
  cpuPercent: number;
  heapMb: number;
  rssMb: number;
  eventLoopP99Ms: number;
  eventLoopMaxMs: number;
  lastActivityAgoSec: number;
  killReason: string | null;
}

const SAMPLE_INTERVAL_MS = 2000;

function readNow(
  prevCpu: NodeJS.CpuUsage | null,
  prevHrTime: bigint | null,
): {
  stats: DevStats;
  cpu: NodeJS.CpuUsage;
  hrTime: bigint;
} {
  const cpu = process.cpuUsage();
  const hrTime = process.hrtime.bigint();
  const memory = process.memoryUsage();
  const watchdog = readWatchdogState();

  let cpuPercent = 0;
  if (prevCpu && prevHrTime !== null) {
    const userDelta = cpu.user - prevCpu.user;
    const sysDelta = cpu.system - prevCpu.system;
    const cpuUsec = userDelta + sysDelta;
    const wallNs = Number(hrTime - prevHrTime);
    const wallUsec = wallNs / 1000;
    if (wallUsec > 0) cpuPercent = Math.min(999, (cpuUsec / wallUsec) * 100);
  }

  return {
    stats: {
      pid: process.pid,
      uptimeSec: Math.round(process.uptime()),
      cpuPercent: Math.round(cpuPercent * 10) / 10,
      heapMb: Math.round((memory.heapUsed / 1024 / 1024) * 10) / 10,
      rssMb: Math.round((memory.rss / 1024 / 1024) * 10) / 10,
      eventLoopP99Ms: Math.round(watchdog.eventLoopP99Ms * 10) / 10,
      eventLoopMaxMs: Math.round(watchdog.eventLoopMaxMs * 10) / 10,
      lastActivityAgoSec: Math.round((Date.now() - watchdog.lastActivityTs) / 1000),
      killReason: watchdog.killReason,
    },
    cpu,
    hrTime,
  };
}

/**
 * @param visible Pass the panel's visibility. `true` (default) samples every
 * 2s; `false` drops to the watchdog's 60s memory-sample cadence so a hidden
 * panel does not keep re-rendering the app.
 */
export function useDevStats(visible = true): DevStats {
  // Lazy init + refs: the previous version called readNow() in the component
  // body and keyed the effect on the fresh objects it returned, so every
  // render re-created the interval.
  const [stats, setStats] = useState<DevStats>(() => readNow(null, null).stats);
  const prevCpuRef = useRef<NodeJS.CpuUsage | null>(null);
  const prevHrTimeRef = useRef<bigint | null>(null);

  useEffect(() => {
    const sample = () => {
      const r = readNow(prevCpuRef.current, prevHrTimeRef.current);
      prevCpuRef.current = r.cpu;
      prevHrTimeRef.current = r.hrTime;
      setStats(r.stats);
    };

    // Paint real numbers immediately on mount and on visibility flips.
    sample();

    if (visible) {
      const id = setInterval(sample, SAMPLE_INTERVAL_MS);
      id.unref();
      return () => clearInterval(id);
    }

    return onMemorySample(() => sample());
  }, [visible]);

  return stats;
}
