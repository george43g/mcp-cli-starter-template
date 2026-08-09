import { afterEach, describe, expect, it } from "vitest";
import {
  _resetDefaultLimiterForTests,
  acquire,
  defaultLimiterAvailable,
  TokenBucket,
} from "./rate-limit.js";

describe("TokenBucket", () => {
  it("starts at full capacity", () => {
    const b = new TokenBucket(10, 1);
    expect(b.available()).toBe(10);
  });

  it("deducts tokens on acquire", async () => {
    const b = new TokenBucket(10, 1);
    await b.acquire(3);
    expect(b.available()).toBeCloseTo(7, 0);
  });

  it("refills steadily at rps tokens/sec", () => {
    let now = 0;
    const b = new TokenBucket(10, 5, () => now);
    b.acquire(10); // drain
    now += 1000; // 1s elapsed -> +5 tokens
    expect(b.available()).toBeCloseTo(5, 0);
    now += 1000;
    expect(b.available()).toBeCloseTo(10, 0); // capped
  });

  it("acquire(0) is a no-op", async () => {
    const b = new TokenBucket(5, 1);
    await b.acquire(0);
    expect(b.available()).toBe(5);
  });

  it("rps=0 disables the limiter (returns immediately)", async () => {
    const b = new TokenBucket(0, 0);
    await b.acquire(100);
    // would hang otherwise — test passes by not timing out
    expect(b.available()).toBe(0);
  });

  it("blocks until refill when starved", async () => {
    let now = 0;
    const sleeps: number[] = [];
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        sleeps.push(ms);
        now += ms;
        resolve();
      });
    const b = new TokenBucket(1, 1, () => now, sleep);
    await b.acquire(1); // immediate
    await b.acquire(1); // must wait ~1s
    expect(sleeps.length).toBeGreaterThan(0);
    expect(sleeps[0]).toBeGreaterThanOrEqual(1);
  });

  it("rejects negative capacity / rps", () => {
    expect(() => new TokenBucket(-1, 1)).toThrow();
    expect(() => new TokenBucket(1, -1)).toThrow();
  });

  it("acquire(n > capacity) throws instead of spinning forever", async () => {
    let now = 0;
    let sleeps = 0;
    // Bounded so a regression fails the suite instead of hanging it.
    const sleep = (ms: number) => {
      sleeps += 1;
      now += ms;
      if (sleeps > 50) throw new Error("SPUN: acquire looped without making progress");
      return Promise.resolve();
    };
    const b = new TokenBucket(5, 10, () => now, sleep);
    await expect(b.acquire(6)).rejects.toThrow(/exceeds the bucket capacity/);
    expect(sleeps).toBe(0);
  });
});

describe("TokenBucket.tryAcquire", () => {
  it("succeeds and deducts while tokens remain", () => {
    const b = new TokenBucket(2, 2, () => 0);
    expect(b.tryAcquire()).toEqual({ ok: true, retryMs: 0 });
    expect(b.tryAcquire()).toEqual({ ok: true, retryMs: 0 });
    expect(b.available()).toBe(0);
  });

  it("denies with a positive retry hint once drained", () => {
    const b = new TokenBucket(2, 2, () => 0);
    b.tryAcquire();
    b.tryAcquire();
    const denied = b.tryAcquire();
    expect(denied.ok).toBe(false);
    expect(denied.retryMs).toBeGreaterThan(0);
  });

  /**
   * The contract that matters, and the one the consumer's suite pins: waiting
   * exactly as long as the hint said must be ENOUGH. A hint that is merely
   * positive would satisfy the test above while still starving a caller that
   * believes it.
   */
  it("retryMs is sufficient — waiting exactly that long makes the next call succeed", () => {
    let now = 0;
    const b = new TokenBucket(2, 2, () => now);
    expect(b.tryAcquire().ok).toBe(true);
    expect(b.tryAcquire().ok).toBe(true);
    const denied = b.tryAcquire();
    expect(denied.ok).toBe(false);
    now += denied.retryMs; // wait exactly as long as the hint said
    expect(b.tryAcquire().ok).toBe(true);
  });

  it("retryMs is sufficient across a range of bucket shapes and demands", () => {
    for (const [capacity, rps, n] of [
      [1, 1, 1],
      [2, 2, 1],
      [10, 5, 3],
      [10, 5, 10],
      [3, 0.5, 2],
      [100, 1000, 7],
    ] as const) {
      let now = 0;
      const b = new TokenBucket(capacity, rps, () => now);
      expect(b.tryAcquire(capacity).ok).toBe(true); // drain
      const denied = b.tryAcquire(n);
      expect(denied.ok, `capacity=${capacity} rps=${rps} n=${n}`).toBe(false);
      now += denied.retryMs;
      expect(
        b.tryAcquire(n).ok,
        `capacity=${capacity} rps=${rps} n=${n} after ${denied.retryMs}ms`,
      ).toBe(true);
    }
  });

  it("never blocks — it is the same bucket as acquire, just non-blocking", () => {
    let now = 0;
    const b = new TokenBucket(1, 1, () => now);
    expect(b.tryAcquire().ok).toBe(true);
    expect(b.tryAcquire().ok).toBe(false);
    now += 1000;
    expect(b.tryAcquire().ok).toBe(true);
  });

  it("tryAcquire(0) is a no-op that succeeds", () => {
    const b = new TokenBucket(5, 1, () => 0);
    expect(b.tryAcquire(0)).toEqual({ ok: true, retryMs: 0 });
    expect(b.available()).toBe(5);
  });

  it("rps=0 spends a fixed budget, then denies with retryMs 0", () => {
    // Deliberately NOT the same as acquire(), which treats rps=0 as "limiter
    // off" and returns without deducting. retryMs 0 means "never" here: the
    // bucket cannot refill, so the caller decides rather than being told to
    // wait for something that will not happen.
    const b = new TokenBucket(2, 0, () => 0);
    expect(b.tryAcquire().ok).toBe(true);
    expect(b.tryAcquire().ok).toBe(true);
    expect(b.tryAcquire()).toEqual({ ok: false, retryMs: 0 });
  });

  it("throws when n exceeds capacity, rather than hinting at a retry that can never work", () => {
    const b = new TokenBucket(5, 10, () => 0);
    expect(() => b.tryAcquire(6)).toThrow(/exceeds the bucket capacity/);
  });

  it("shares state with acquire", async () => {
    const now = 0;
    const b = new TokenBucket(2, 1, () => now);
    await b.acquire(2);
    expect(b.tryAcquire().ok).toBe(false);
  });
});

describe("the default limiter", () => {
  afterEach(() => {
    // `delete`, not `= undefined`: assigning to process.env stringifies, so the
    // latter would leave the literal "undefined" for envNum to parse.
    _resetDefaultLimiterForTests();
    delete process.env.MCP_RATE_LIMIT_RPS;
    delete process.env.MCP_RATE_LIMIT_BURST;
  });

  it("defaults to burst 30", () => {
    expect(defaultLimiterAvailable()).toBe(30);
  });

  it("is built on first use, so env set after import still applies", () => {
    process.env.MCP_RATE_LIMIT_BURST = "7";
    expect(defaultLimiterAvailable()).toBe(7);
  });

  it("acquire() deducts from the shared bucket", async () => {
    // rps must stay LOW here. The default limiter is built internally and uses
    // the real Date.now, so any wall-clock time between the acquire and the
    // read refills the bucket. At rps=1000 that is a token per millisecond,
    // which passed locally and failed on a slower CI runner. At rps=1 the
    // refill over the same gap is ~0.001 tokens. Burst 5 >= 2 keeps acquire
    // from blocking, which is what the high rps was mistakenly protecting.
    process.env.MCP_RATE_LIMIT_BURST = "5";
    process.env.MCP_RATE_LIMIT_RPS = "1";
    await acquire(2);
    const left = defaultLimiterAvailable();
    expect(left).toBeGreaterThanOrEqual(3);
    expect(left).toBeLessThan(3.5);
  });

  it("_resetDefaultLimiterForTests rebuilds from current env", () => {
    process.env.MCP_RATE_LIMIT_BURST = "4";
    expect(defaultLimiterAvailable()).toBe(4);
    process.env.MCP_RATE_LIMIT_BURST = "9";
    expect(defaultLimiterAvailable()).toBe(4); // still the cached bucket
    _resetDefaultLimiterForTests();
    expect(defaultLimiterAvailable()).toBe(9);
  });

  it("the real default sleep resolves (covers the unref timer path)", async () => {
    // Every other test injects a fake sleep, so the shipped one — the branch
    // that calls unref() so a pending limiter cannot hold the process open —
    // was never executed.
    const b = new TokenBucket(1, 1000);
    await b.acquire(1);
    await b.acquire(1); // must actually wait on the real timer
    expect(b.available()).toBeLessThanOrEqual(1);
  });
});
