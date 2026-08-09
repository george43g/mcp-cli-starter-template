/**
 * Token-bucket rate limiter.
 *
 * Library-eligible: no project-specific imports. The default singleton is
 * configured via `MCP_RATE_LIMIT_RPS` (steady-state requests per second) and
 * `MCP_RATE_LIMIT_BURST` (max tokens). Set RPS to 0 to disable.
 *
 * Use:
 *   await acquire();              // 1 token, default bucket
 *   await acquire(2);             // 2 tokens
 *   const b = new TokenBucket(...);
 *   await b.acquire();            // waits for capacity
 *   const { ok, retryMs } = b.tryAcquire();   // never waits
 */

import { envNum } from "./env.js";

/**
 * Outcome of a non-blocking `tryAcquire`.
 *
 * `retryMs` is only meaningful when `ok` is false, and 0 then means "never" —
 * the bucket cannot refill, so no amount of waiting helps.
 */
export interface RateLimitDecision {
  ok: boolean;
  retryMs: number;
}

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    public readonly capacity: number,
    public readonly rps: number,
    private readonly clock: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => {
        const t = setTimeout(r, ms);
        if (typeof (t as { unref?: () => void }).unref === "function") {
          (t as { unref: () => void }).unref();
        }
      }),
  ) {
    if (capacity < 0) throw new Error("capacity must be >= 0");
    if (rps < 0) throw new Error("rps must be >= 0");
    this.tokens = capacity;
    this.lastRefill = clock();
  }

  private refill(now: number): void {
    if (this.rps <= 0) return;
    const elapsedSec = Math.max(0, (now - this.lastRefill) / 1000);
    const refilled = elapsedSec * this.rps;
    this.tokens = Math.min(this.capacity, this.tokens + refilled);
    this.lastRefill = now;
  }

  /** Available tokens right now (for tests / introspection). */
  available(): number {
    this.refill(this.clock());
    return this.tokens;
  }

  /**
   * Refill caps tokens at `capacity`, so a demand above it can never be met.
   * Left unchecked `acquire` spins on that forever and `tryAcquire` hands back
   * a retry hint that will never come true, which is worse than an error.
   *
   * Only reachable while the limiter is active: with `rps <= 0` both callers
   * answer before reaching here, so a deliberately-disabled bucket (commonly
   * `new TokenBucket(0, 0)`) never throws.
   */
  private assertSatisfiable(n: number): void {
    if (n > this.capacity) {
      throw new Error(
        `rate limit: requested ${n} tokens, which exceeds the bucket capacity of ` +
          `${this.capacity}. Refill caps at capacity, so this can never be granted — ` +
          `raise the burst or request fewer tokens.`,
      );
    }
  }

  /**
   * Block until `n` tokens are available, then deduct them.
   *
   * With rps=0 this returns immediately WITHOUT deducting: rps=0 means "limiter
   * off". Note that `tryAcquire` reads rps=0 differently — see its docblock.
   *
   * @throws if `n` exceeds `capacity` while the limiter is active. That used to
   * hang the caller forever.
   */
  async acquire(n = 1): Promise<void> {
    if (n <= 0) return;
    if (this.rps <= 0) return; // disabled — never wait
    this.assertSatisfiable(n);
    // Loop instead of recursion so a stampede can't blow the stack.
    for (;;) {
      const now = this.clock();
      this.refill(now);
      if (this.tokens >= n) {
        this.tokens -= n;
        return;
      }
      const needed = n - this.tokens;
      const waitMs = Math.max(1, Math.ceil((needed / this.rps) * 1000));
      await this.sleep(waitMs);
    }
  }

  /**
   * Non-blocking `acquire`: take `n` tokens if they are there, otherwise report
   * how long until they would be. Never waits.
   *
   * For call sites that must answer NOW — an MCP tool that should fail fast
   * with "retry in 500ms" rather than silently stalling the client.
   *
   *   const { ok, retryMs } = bucket.tryAcquire();
   *   if (!ok) throw new Error(`rate limit hit. Retry in ${retryMs}ms`);
   *
   * `retryMs` is guaranteed SUFFICIENT, not merely positive: waiting exactly
   * that long makes the next call for the same `n` succeed.
   *
   * Unlike `acquire`, rps=0 is treated as a FIXED BUDGET rather than "off" —
   * the initial `capacity` tokens are spendable and never refill. Once drained
   * it returns `{ ok: false, retryMs: 0 }`, where 0 means "never": the caller
   * decides what to do instead of being handed a wait that will not help.
   *
   * @throws if `n` exceeds `capacity` while the limiter is active.
   */
  tryAcquire(n = 1): RateLimitDecision {
    if (n <= 0) return { ok: true, retryMs: 0 };
    this.refill(this.clock());
    if (this.tokens >= n) {
      this.tokens -= n;
      return { ok: true, retryMs: 0 };
    }
    if (this.rps <= 0) return { ok: false, retryMs: 0 };
    this.assertSatisfiable(n);
    const needed = n - this.tokens;
    return { ok: false, retryMs: Math.max(1, Math.ceil((needed / this.rps) * 1000)) };
  }
}

/**
 * Built on FIRST USE, not at import.
 *
 * This was `new TokenBucket(DEFAULT_BURST, DEFAULT_RPS)` at module scope, with
 * both values read from env at module load. cli-kit's `applyEnvFromFlags`
 * writes `process.env` during argv parsing, which happens after the first
 * import — so `--rate-limit-rps` and `--rate-limit-burst` set an env var that
 * the already-constructed bucket never read.
 *
 * Lazy construction also means a consumer that never rate-limits does not pay
 * for the bucket at all.
 */
let defaultLimiter: TokenBucket | null = null;

function limiter(): TokenBucket {
  if (!defaultLimiter) {
    defaultLimiter = new TokenBucket(
      envNum("MCP_RATE_LIMIT_BURST", 30),
      envNum("MCP_RATE_LIMIT_RPS", 10),
    );
  }
  return defaultLimiter;
}

/** Acquire from the default process-wide bucket. */
export async function acquire(n = 1): Promise<void> {
  return limiter().acquire(n);
}

/** Inspect the default bucket — for health_check / tests. */
export function defaultLimiterAvailable(): number {
  return limiter().available();
}

/**
 * Drop the default bucket so the next call rebuilds it from current env.
 *
 * @internal Test seam. Without it, one test setting MCP_RATE_LIMIT_RPS would
 * pin the bucket for every later test in the same process.
 */
export function _resetDefaultLimiterForTests(): void {
  defaultLimiter = null;
}
