/**
 * Contract tests for useDevStats' sampling-source switch.
 *
 * The robustness barrel is mocked so the watchdog readings are controllable
 * and onMemorySample subscriptions are observable. Only setInterval /
 * clearInterval are faked — React and Ink schedule their own flushes through
 * other channels, and faking those stalls the render loop. Frames are
 * awaited with a real-timer tick after each state change.
 */

import { Text } from "ink";
import { render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const samplers: Array<(rssMb: number, heapMb: number) => void> = [];
  const unsubscribe = vi.fn();
  const onMemorySample = vi.fn((cb: (rssMb: number, heapMb: number) => void) => {
    samplers.push(cb);
    return unsubscribe;
  });
  const watchdog = {
    startedAt: 0,
    eventLoopP99Ms: 5,
    eventLoopMaxMs: 9,
    eventLoopSustainedCount: 0,
    lastEventLoopSampleTs: 0,
    rssMb: 100,
    heapMb: 50,
    heapHistory: [] as number[],
    lastActivityTs: 0,
    killReason: null as string | null,
  };
  return { samplers, unsubscribe, onMemorySample, watchdog };
});

vi.mock("@george43g/robustness", () => ({
  readWatchdogState: () => h.watchdog,
  onMemorySample: h.onMemorySample,
}));

import { useDevStats } from "./useDevStats.js";

function Probe({ visible }: { visible: boolean }) {
  const stats = useDevStats(visible);
  return <Text>p99={stats.eventLoopP99Ms}</Text>;
}

function ProbeDefault() {
  const stats = useDevStats();
  return <Text>p99={stats.eventLoopP99Ms}</Text>;
}

/**
 * Let React/Ink flush through their (real) scheduling channels.
 *
 * A fixed sleep is a wall-clock race: 20ms is ample on an idle laptop and not
 * always enough on a loaded CI runner, where this failed a release chain with
 * `expected 'p99=5' to contain 'p99=12'` — the assertion ran before ink had
 * repainted. Reproduced 0/15 times locally, which is the signature of a
 * load-dependent timing bug rather than a logic one.
 *
 * `flushUntil` polls for the condition instead, so a slow runner costs latency
 * rather than a false failure, and a genuine regression still fails — just at
 * the timeout rather than instantly.
 */
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

async function flushUntil(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) await tick();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  h.samplers.length = 0;
  h.unsubscribe.mockClear();
  h.onMemorySample.mockClear();
  h.watchdog.eventLoopP99Ms = 5;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useDevStats", () => {
  it("visible: samples on the 2s interval", async () => {
    const { lastFrame, unmount } = render(<Probe visible={true} />);
    expect(lastFrame()).toContain("p99=5");

    h.watchdog.eventLoopP99Ms = 12;
    vi.advanceTimersByTime(2000);
    await flushUntil(() => Boolean(lastFrame()?.includes("p99=12")));
    expect(lastFrame()).toContain("p99=12");
    expect(h.onMemorySample).not.toHaveBeenCalled();
    unmount();
  });

  it("visible: unmount clears the interval", async () => {
    const { unmount } = render(<Probe visible={true} />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    await flushUntil(() => vi.getTimerCount() === 0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("hidden: paints an immediate sample but starts no interval", async () => {
    const { lastFrame, unmount } = render(<Probe visible={false} />);
    expect(lastFrame()).toContain("p99=5");
    expect(vi.getTimerCount()).toBe(0);

    h.watchdog.eventLoopP99Ms = 20;
    vi.advanceTimersByTime(10_000);
    await flush();
    expect(lastFrame()).toContain("p99=5");
    unmount();
  });

  it("hidden: rides the watchdog memory sample", async () => {
    const { lastFrame, unmount } = render(<Probe visible={false} />);
    expect(h.onMemorySample).toHaveBeenCalledTimes(1);

    h.watchdog.eventLoopP99Ms = 20;
    h.samplers.at(-1)?.(100, 50);
    await flushUntil(() => Boolean(lastFrame()?.includes("p99=20")));
    expect(lastFrame()).toContain("p99=20");
    unmount();
  });

  it("hidden: unmount unsubscribes from the watchdog", async () => {
    const { unmount } = render(<Probe visible={false} />);
    expect(h.unsubscribe).not.toHaveBeenCalled();
    unmount();
    await flushUntil(() => h.unsubscribe.mock.calls.length === 1);
    expect(h.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("visibility flip swaps the sampling source both ways", async () => {
    const { rerender, unmount } = render(<Probe visible={true} />);
    expect(vi.getTimerCount()).toBe(1);
    expect(h.onMemorySample).not.toHaveBeenCalled();

    rerender(<Probe visible={false} />);
    await flushUntil(() => vi.getTimerCount() === 0 && h.onMemorySample.mock.calls.length === 1);
    expect(vi.getTimerCount()).toBe(0);
    expect(h.onMemorySample).toHaveBeenCalledTimes(1);

    rerender(<Probe visible={true} />);
    await flushUntil(() => vi.getTimerCount() === 1 && h.unsubscribe.mock.calls.length === 1);
    expect(vi.getTimerCount()).toBe(1);
    expect(h.unsubscribe).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("defaults to visible sampling when called with no argument", async () => {
    const { lastFrame, unmount } = render(<ProbeDefault />);
    h.watchdog.eventLoopP99Ms = 33;
    vi.advanceTimersByTime(2000);
    await flushUntil(() => Boolean(lastFrame()?.includes("p99=33")));
    expect(lastFrame()).toContain("p99=33");
    expect(h.onMemorySample).not.toHaveBeenCalled();
    unmount();
  });
});
