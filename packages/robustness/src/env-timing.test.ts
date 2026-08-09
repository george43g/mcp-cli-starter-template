/**
 * Env knobs must be read when they are USED, not when the module is imported.
 *
 * This is the regression suite for a whole class of silent failure. These
 * defaults used to be module-level consts, evaluated once at first import.
 * cli-kit's `applyEnvFromFlags` writes `process.env` while parsing argv, which
 * is necessarily later — so nine documented CLI flags parsed cleanly, set
 * their env var, and changed nothing at all. Nothing errored; the knob simply
 * had no effect.
 *
 * Every test here therefore sets its env var AFTER the module is already
 * imported (the imports at the top of this file run first). A test that set
 * the variable before importing would pass against the original bug and prove
 * nothing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLogs, getLogs, info } from "./logger.js";
import { _resetDefaultLimiterForTests, defaultLimiterAvailable } from "./rate-limit.js";
import { withRetry } from "./retry.js";

const TOUCHED = [
  "MCP_RETRY_MAX_ATTEMPTS",
  "MCP_RETRY_BASE_MS",
  "MCP_RATE_LIMIT_BURST",
  "MCP_RATE_LIMIT_RPS",
  "MCP_LOG_RING_SIZE",
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(TOUCHED.map((k) => [k, process.env[k]]));
});

afterEach(() => {
  for (const k of TOUCHED) {
    const v = saved[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  _resetDefaultLimiterForTests();
  clearLogs();
  vi.restoreAllMocks();
});

describe("retry defaults", () => {
  it("honours MCP_RETRY_MAX_ATTEMPTS set after import", async () => {
    process.env.MCP_RETRY_MAX_ATTEMPTS = "2";
    process.env.MCP_RETRY_BASE_MS = "0";

    let calls = 0;
    const boom = async () => {
      calls++;
      throw Object.assign(new Error("503"), { status: 503 });
    };

    await expect(
      withRetry(boom, { jitter: false, timer: (cb) => cb() as unknown }),
    ).rejects.toThrow();
    // 2 attempts total, not the built-in default of 3.
    expect(calls).toBe(2);
  });

  it("an explicit option still beats the env var", async () => {
    process.env.MCP_RETRY_MAX_ATTEMPTS = "5";
    let calls = 0;
    const boom = async () => {
      calls++;
      throw Object.assign(new Error("503"), { status: 503 });
    };

    await expect(
      withRetry(boom, { maxAttempts: 1, jitter: false, timer: (cb) => cb() as unknown }),
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });
});

describe("rate-limit defaults", () => {
  it("honours MCP_RATE_LIMIT_BURST set after import", () => {
    process.env.MCP_RATE_LIMIT_BURST = "7";
    _resetDefaultLimiterForTests();
    // The bucket starts full, so available() reports the burst size.
    expect(defaultLimiterAvailable()).toBe(7);
  });

  it("rebuilds from current env after a reset", () => {
    process.env.MCP_RATE_LIMIT_BURST = "3";
    _resetDefaultLimiterForTests();
    expect(defaultLimiterAvailable()).toBe(3);

    process.env.MCP_RATE_LIMIT_BURST = "9";
    // Without the reset the first bucket would persist for the process
    // lifetime — which is precisely the original bug, scoped to one test run.
    _resetDefaultLimiterForTests();
    expect(defaultLimiterAvailable()).toBe(9);
  });
});

describe("logger defaults", () => {
  it("honours MCP_LOG_RING_SIZE set after import", () => {
    process.env.MCP_LOG_RING_SIZE = "3";
    clearLogs();
    for (let i = 0; i < 10; i++) info(`line ${i}`);

    const lines = getLogs();
    expect(lines.length).toBeLessThanOrEqual(3);
    // The ring keeps the newest, so the last write must survive.
    expect(lines.at(-1)).toContain("line 9");
  });
});
