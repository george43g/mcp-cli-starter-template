import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { color, disableColors } from "./color.js";
import { colorEnabled, isCI, isStderrTTY, isStdinTTY, isStdoutTTY } from "./tty.js";

const ENV_KEYS = [
  "CI",
  "CONTINUOUS_INTEGRATION",
  "GITHUB_ACTIONS",
  "GITLAB_CI",
  "CIRCLECI",
  "TRAVIS",
  "BUILDKITE",
  "NO_COLOR",
  "FORCE_COLOR",
];

let original: Record<string, string | undefined>;

beforeEach(() => {
  original = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

describe("isCI", () => {
  it("returns false when no CI env var set", () => {
    expect(isCI()).toBe(false);
  });

  it.each(["CI", "GITHUB_ACTIONS", "GITLAB_CI", "CIRCLECI", "TRAVIS", "BUILDKITE"])(
    "returns true when %s set",
    (key) => {
      process.env[key] = "true";
      expect(isCI()).toBe(true);
    },
  );

  /**
   * The whole suite above only ever set "true", so presence-vs-value was never
   * discriminated. `CI=false` is the documented way to tell a tool it is NOT in
   * CI — ink's own `is-in-ci` honours it — and a naive `Boolean(env.CI)` reads
   * the string "false" as true. Reported by the browser-tab consumer.
   */
  it.each(["CI", "GITHUB_ACTIONS", "GITLAB_CI", "CIRCLECI", "TRAVIS", "BUILDKITE"])(
    "returns false when %s is explicitly disabled",
    (key) => {
      for (const value of ["false", "0", ""]) {
        process.env[key] = value;
        expect(isCI(), `${key}=${JSON.stringify(value)}`).toBe(false);
      }
    },
  );

  it("still returns true for other truthy values", () => {
    for (const value of ["1", "true", "yes", "TRUE"]) {
      process.env.CI = value;
      expect(isCI(), `CI=${value}`).toBe(true);
    }
  });

  it("treats an unrelated var as independent", () => {
    // CI disabled but a provider var genuinely set: still CI.
    process.env.CI = "false";
    process.env.GITHUB_ACTIONS = "true";
    expect(isCI()).toBe(true);
  });
});

describe("colorEnabled", () => {
  it("respects NO_COLOR", () => {
    process.env.NO_COLOR = "1";
    expect(colorEnabled()).toBe(false);
  });

  it("respects FORCE_COLOR over TTY", () => {
    process.env.FORCE_COLOR = "1";
    expect(colorEnabled()).toBe(true);
  });

  it("NO_COLOR wins when both set", () => {
    process.env.NO_COLOR = "1";
    process.env.FORCE_COLOR = "1";
    expect(colorEnabled()).toBe(false);
  });
});

/**
 * TTY/env-dependent branches, exercised EXPLICITLY.
 *
 * These functions read `process.stdout.isTTY` and colour env vars, so which of
 * their branches run — and therefore this package's function-coverage number —
 * depends on the machine the suite runs on. That is why the gate passed in CI
 * and failed locally for the same commit: not flake, but genuine environment
 * sensitivity in the measurement.
 *
 * Pinning both sides of each branch makes the number deterministic wherever it
 * runs, which is the actual fix. Lowering the floor would only have hidden it.
 */
describe("TTY and colour detection, both branches pinned", () => {
  const savedTTY = process.stdout.isTTY;
  const savedEnv = { NO_COLOR: process.env.NO_COLOR, FORCE_COLOR: process.env.FORCE_COLOR };

  const setTTY = (v: boolean) => {
    Object.defineProperty(process.stdout, "isTTY", { value: v, configurable: true });
  };

  afterEach(() => {
    Object.defineProperty(process.stdout, "isTTY", { value: savedTTY, configurable: true });
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("isStdoutTTY / isStderrTTY / isStdinTTY return booleans, never the raw value", () => {
    // `process.stdout.isTTY` is `true | undefined`, not `true | false`. Callers
    // branch on it, so leaking `undefined` would be a subtle API wart.
    setTTY(false);
    expect(isStdoutTTY()).toBe(false);
    setTTY(true);
    expect(isStdoutTTY()).toBe(true);
    expect(typeof isStderrTTY()).toBe("boolean");
    expect(typeof isStdinTTY()).toBe("boolean");
  });

  it("colorEnabled: NO_COLOR wins over everything, including FORCE_COLOR", () => {
    // no-color.org says presence of NO_COLOR disables colour unconditionally.
    process.env.NO_COLOR = "1";
    process.env.FORCE_COLOR = "1";
    setTTY(true);
    expect(colorEnabled()).toBe(false);
  });

  it("colorEnabled: FORCE_COLOR enables colour on a non-TTY", () => {
    delete process.env.NO_COLOR;
    process.env.FORCE_COLOR = "1";
    setTTY(false);
    expect(colorEnabled()).toBe(true);
  });

  it("colorEnabled: falls back to the TTY check when neither var is set", () => {
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;
    setTTY(false);
    expect(colorEnabled()).toBe(false);
    setTTY(true);
    expect(colorEnabled()).toBe(true);
  });
});

describe("color wrapper follows colorEnabled", () => {
  const savedEnv = { NO_COLOR: process.env.NO_COLOR, FORCE_COLOR: process.env.FORCE_COLOR };
  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("passes text through unchanged when colour is off", () => {
    process.env.NO_COLOR = "1";
    expect(color.red("hi")).toBe("hi");
    expect(color.bold("hi")).toBe("hi");
  });

  it("emits escapes when colour is forced on", () => {
    delete process.env.NO_COLOR;
    process.env.FORCE_COLOR = "1";
    expect(color.red("hi")).not.toBe("hi");
    expect(color.red("hi")).toContain("hi");
  });

  it("disableColors() sets NO_COLOR and clears FORCE_COLOR", () => {
    process.env.FORCE_COLOR = "1";
    disableColors();
    expect(process.env.NO_COLOR).toBe("1");
    expect(process.env.FORCE_COLOR).toBeUndefined();
    expect(color.green("x")).toBe("x");
  });
});
