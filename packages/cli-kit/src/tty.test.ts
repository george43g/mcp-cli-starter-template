import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { colorEnabled, isCI } from "./tty.js";

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
