/**
 * MemoryCache — TTL expiry, LRU eviction, and lifecycle.
 *
 * Time is driven with fake timers rather than real sleeps: the default TTL is
 * ten minutes, so a wall-clock test of expiry is not an option. `Date.now()`
 * is what the cache reads, and vitest's fake timers mock it alongside
 * setInterval, which is exactly the pair this class depends on.
 *
 * `dispose()` in afterEach is not politeness — the constructor starts an
 * interval, and a leaked one keeps firing against a cache the test has
 * finished with.
 *
 * NOT covered here: the `pressureMb` branch, which subscribes to robustness'
 * memory-sample stream. Driving it needs `installWatchdog()`, and that builds
 * a process-wide singleton whose `_resetForTests()` is not exported from the
 * robustness barrel — so a test here would leave global state dirty for every
 * later file in this suite with no way to undo it. Deliberate omission, not an
 * oversight; it is the same missing-reset gap DEFERRED #15 records.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryCache } from "./memoryCache.js";

let cache: MemoryCache<string> | null = null;

function make(opts?: ConstructorParameters<typeof MemoryCache>[0]): MemoryCache<string> {
  cache = new MemoryCache<string>(opts);
  return cache;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cache?.dispose();
  cache = null;
  vi.useRealTimers();
});

describe("MemoryCache basics", () => {
  it("round-trips a value", () => {
    const c = make();
    c.set("a", "1");
    expect(c.get("a")).toBe("1");
    expect(c.has("a")).toBe(true);
    expect(c.size()).toBe(1);
  });

  it("returns undefined for an unknown key", () => {
    expect(make().get("nope")).toBeUndefined();
  });

  it("deletes and clears", () => {
    const c = make();
    c.set("a", "1");
    c.set("b", "2");
    expect(c.delete("a")).toBe(true);
    expect(c.delete("a")).toBe(false);
    expect(c.size()).toBe(1);
    c.clear();
    expect(c.size()).toBe(0);
  });
});

describe("MemoryCache TTL", () => {
  it("expires an entry on read once past the TTL", () => {
    const c = make({ ttlMs: 1000 });
    c.set("a", "1");
    vi.advanceTimersByTime(1001);
    expect(c.get("a")).toBeUndefined();
    // Read-through expiry must also remove it, not just hide it.
    expect(c.size()).toBe(0);
  });

  it("a read refreshes lastAccess, so an actively-used key survives", () => {
    const c = make({ ttlMs: 1000 });
    c.set("a", "1");
    vi.advanceTimersByTime(600);
    expect(c.get("a")).toBe("1"); // refreshes
    vi.advanceTimersByTime(600); // 1200ms since set, but only 600 since access
    expect(c.get("a")).toBe("1");
  });

  it("sweep() drops expired entries and reports how many", () => {
    const c = make({ ttlMs: 1000 });
    c.set("old", "1");
    vi.advanceTimersByTime(1001);
    c.set("new", "2");
    expect(c.sweep()).toBe(1);
    expect(c.has("old")).toBe(false);
    expect(c.has("new")).toBe(true);
  });

  it("sweeps on its own interval without anyone calling sweep()", () => {
    // sweepIntervalMs is floored at 15s, so a small ttl alone would not prove
    // the timer runs — pass it explicitly.
    const c = make({ ttlMs: 1000, sweepIntervalMs: 500 });
    c.set("a", "1");
    vi.advanceTimersByTime(2000);
    expect(c.size()).toBe(0);
  });
});

describe("MemoryCache LRU eviction", () => {
  it("evicts the least-recently-used half", () => {
    const c = make({ ttlMs: 60_000 });
    for (const k of ["a", "b", "c", "d"]) {
      c.set(k, k);
      vi.advanceTimersByTime(10);
    }
    // Touch 'a' so it is the most recent despite being inserted first —
    // this is what distinguishes LRU from insertion order.
    expect(c.get("a")).toBe("a");

    expect(c.evictLruHalf()).toBe(2);
    expect(c.has("b")).toBe(false);
    expect(c.has("c")).toBe(false);
    expect(c.has("a")).toBe(true);
    expect(c.has("d")).toBe(true);
  });

  it("evicting an empty cache is a no-op rather than an error", () => {
    expect(make().evictLruHalf()).toBe(0);
  });

  it("rounds down on an odd count, so one entry always survives", () => {
    const c = make({ ttlMs: 60_000 });
    c.set("a", "1");
    expect(c.evictLruHalf()).toBe(0);
    expect(c.size()).toBe(1);
  });
});

describe("MemoryCache lifecycle", () => {
  it("dispose() stops the sweep timer", () => {
    const c = make({ ttlMs: 1000, sweepIntervalMs: 500 });
    c.set("a", "1");
    c.dispose();
    vi.advanceTimersByTime(5000);
    // The entry is TTL-expired but nothing swept it, so it is still resident.
    // Reading would evict it, so assert on size() instead.
    expect(c.size()).toBe(1);
  });

  it("dispose() is idempotent", () => {
    const c = make();
    c.dispose();
    expect(() => c.dispose()).not.toThrow();
  });
});
