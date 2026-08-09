import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { printAuto, printJson, printTable, resolveOutputMode } from "./output.js";

/**
 * `resolveOutputMode` reads two implicit signals it cannot be handed: whether
 * stdout is a TTY, and whether CI is set. Both are stubbed so each precedence
 * level can be exercised independently.
 */
const ENV_KEYS = ["CI", "CONTINUOUS_INTEGRATION", "GITHUB_ACTIONS", "FORCE_HUMAN"];
let original: Record<string, string | undefined>;
let originalIsTTY: boolean | undefined;

function setTTY(value: boolean): void {
  Object.defineProperty(process.stdout, "isTTY", { value, configurable: true });
}

beforeEach(() => {
  original = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  originalIsTTY = process.stdout.isTTY;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
  Object.defineProperty(process.stdout, "isTTY", {
    value: originalIsTTY,
    configurable: true,
  });
  vi.unstubAllEnvs();
});

describe("resolveOutputMode — inferred signals", () => {
  it("is human on an interactive terminal", () => {
    setTTY(true);
    expect(resolveOutputMode()).toBe("human");
  });

  it("is json when piped", () => {
    setTTY(false);
    expect(resolveOutputMode()).toBe("json");
  });

  it("is json under CI even on a TTY", () => {
    setTTY(true);
    process.env.CI = "true";
    expect(resolveOutputMode()).toBe("json");
  });
});

describe("resolveOutputMode — explicit json", () => {
  it("wins on a TTY", () => {
    setTTY(true);
    expect(resolveOutputMode({ json: true })).toBe("json");
  });
});

describe("resolveOutputMode — explicit human", () => {
  // The gap this closes: before `human`, the inferred signals had no inverse,
  // so `mytool list | less` could not render the human view at all.
  it("outranks a non-TTY stdout", () => {
    setTTY(false);
    expect(resolveOutputMode({ human: true })).toBe("human");
  });

  it("outranks CI", () => {
    setTTY(false);
    process.env.CI = "true";
    expect(resolveOutputMode({ human: true })).toBe("human");
  });

  it("loses to an explicit json request", () => {
    setTTY(true);
    expect(resolveOutputMode({ json: true, human: true })).toBe("json");
  });
});

describe("resolveOutputMode — FORCE_HUMAN", () => {
  it("forces human when piped", () => {
    setTTY(false);
    process.env.FORCE_HUMAN = "1";
    expect(resolveOutputMode()).toBe("human");
  });

  it("loses to an explicit json flag", () => {
    setTTY(false);
    process.env.FORCE_HUMAN = "1";
    expect(resolveOutputMode({ json: true })).toBe("json");
  });

  for (const falsey of ["0", "false", "", "  "]) {
    it(`treats ${JSON.stringify(falsey)} as unset`, () => {
      setTTY(false);
      process.env.FORCE_HUMAN = falsey;
      expect(resolveOutputMode()).toBe("json");
    });
  }

  it("is read at call time, not module load", () => {
    setTTY(false);
    expect(resolveOutputMode()).toBe("json");
    process.env.FORCE_HUMAN = "1";
    expect(resolveOutputMode()).toBe("human");
  });
});

/** Capture what a printer wrote to stdout without letting it reach the terminal. */
function captureStdout(fn: () => void): string {
  let out = "";
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    out += String(chunk);
    return true;
  });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return out;
}

const SPEC = { head: ["name", "n"], rows: (i: { name: string; n: number }) => [i.name, i.n] };

describe("printJson", () => {
  it("writes pretty JSON with a trailing newline", () => {
    const out = captureStdout(() => printJson({ a: 1 }));
    expect(out).toBe('{\n  "a": 1\n}\n');
  });
});

describe("printTable", () => {
  it("renders headers and every row", () => {
    const out = captureStdout(() => printTable([{ name: "alpha", n: 1 }], SPEC));
    expect(out).toContain("name");
    expect(out).toContain("alpha");
    expect(out).toContain("1");
  });

  it("says so instead of rendering an empty table", () => {
    expect(captureStdout(() => printTable([], SPEC))).toBe("(no results)\n");
  });
});

describe("printAuto", () => {
  it("follows the resolved mode to JSON", () => {
    setTTY(false);
    const out = captureStdout(() => printAuto([{ name: "alpha", n: 1 }], SPEC));
    expect(JSON.parse(out)).toEqual([{ name: "alpha", n: 1 }]);
  });

  it("follows the resolved mode to a table", () => {
    setTTY(true);
    const out = captureStdout(() => printAuto([{ name: "alpha", n: 1 }], SPEC));
    expect(out).toContain("alpha");
    expect(() => JSON.parse(out)).toThrow();
  });

  it("honours an explicit human request even when piped", () => {
    setTTY(false);
    const out = captureStdout(() => printAuto([{ name: "alpha", n: 1 }], SPEC, { human: true }));
    expect(out).toContain("alpha");
    expect(() => JSON.parse(out)).toThrow();
  });
});
