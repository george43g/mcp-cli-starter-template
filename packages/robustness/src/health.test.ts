import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatHealthText, snapshotHealth } from "./health.js";
import {
  readWatchdogState,
  _resetForTests as resetWatchdog,
  type WatchdogState,
} from "./watchdog.js";

beforeEach(() => {
  resetWatchdog();
});

afterEach(() => {
  resetWatchdog();
});

describe("snapshotHealth", () => {
  it("reports healthy with zero counters and quiet watchdog", () => {
    const snap = snapshotHealth({ toolCalls: 0, recentErrors: 0 });
    expect(snap.status).toBe("healthy");
    expect(snap.issues).toEqual([]);
    expect(snap.pid).toBe(process.pid);
    expect(snap.node).toBe(process.version);
  });

  it("flags degraded on 5+ recent errors", () => {
    const snap = snapshotHealth({ toolCalls: 10, recentErrors: 5 });
    expect(snap.status).toBe("degraded");
    expect(snap.issues[0]).toMatch(/5 recent errors/);
  });

  it("returns numeric memory + event-loop fields", () => {
    const snap = snapshotHealth({ toolCalls: 0, recentErrors: 0 });
    expect(typeof snap.heap_mb).toBe("number");
    expect(typeof snap.rss_mb).toBe("number");
    expect(typeof snap.event_loop_p99_ms).toBe("number");
  });
});

/**
 * The `state` parameter exists so a CONSUMER can reach these branches. Proving
 * that here needs the same route a consumer has — build a state object and pass
 * it — rather than reaching into module internals, which is precisely what the
 * parameter replaces.
 */
describe("snapshotHealth(counters, state) — the consumer-drivable seam", () => {
  const stateWith = (over: Partial<WatchdogState>): WatchdogState => ({
    ...readWatchdogState(),
    ...over,
  });

  it("drives the unhealthy branch on event-loop p99, which the default cannot", () => {
    const quiet = snapshotHealth({ toolCalls: 0, recentErrors: 0 });
    expect(quiet.status).toBe("healthy");

    const hot = snapshotHealth(
      { toolCalls: 0, recentErrors: 0 },
      stateWith({ eventLoopP99Ms: 5000 }),
    );
    expect(hot.status).toBe("unhealthy");
    expect(hot.issues).toContain("event loop p99 5000ms");
    expect(hot.event_loop_p99_ms).toBe(5000);
  });

  it("drives the degraded branch at the 500ms threshold", () => {
    const s = snapshotHealth({ toolCalls: 0, recentErrors: 0 }, stateWith({ eventLoopP99Ms: 500 }));
    expect(s.status).toBe("degraded");
  });

  it("drives the watchdog-kill branch — the 503 case an HTTP /health test needs", () => {
    const s = snapshotHealth(
      { toolCalls: 0, recentErrors: 0 },
      stateWith({ killReason: "rss_exceeded" }),
    );
    expect(s.status).toBe("unhealthy");
    expect(s.issues).toContain("watchdog kill: rss_exceeded");
  });

  it("leaves one-argument callers on live state — the default is not a behaviour change", () => {
    const viaDefault = snapshotHealth({ toolCalls: 3, recentErrors: 0 });
    const viaExplicit = snapshotHealth({ toolCalls: 3, recentErrors: 0 }, readWatchdogState());
    expect(viaDefault.status).toBe(viaExplicit.status);
    expect(viaDefault.tool_calls).toBe(3);
    expect(viaExplicit.tool_calls).toBe(3);
  });
});

describe("formatHealthText", () => {
  it("produces multi-line text starting with Status:", () => {
    const snap = snapshotHealth({ toolCalls: 7, recentErrors: 0 });
    const text = formatHealthText(snap);
    expect(text.startsWith("Status: healthy")).toBe(true);
    expect(text).toMatch(/PID: \d+/);
    expect(text).toMatch(/Node: v/);
    expect(text).toMatch(/Tool calls: 7/);
  });

  it("includes Issues line when issues present", () => {
    const snap = snapshotHealth({ toolCalls: 0, recentErrors: 6 });
    const text = formatHealthText(snap);
    expect(text).toMatch(/Issues:/);
  });

  it("omits Issues line when healthy", () => {
    const snap = snapshotHealth({ toolCalls: 0, recentErrors: 0 });
    const text = formatHealthText(snap);
    expect(text).not.toMatch(/^Issues:/m);
  });
});
