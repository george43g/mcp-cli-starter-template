import { describe, expect, it } from "vitest";
import { lastFour, redactString, redactValue } from "./redact.js";

describe("redaction", () => {
  it("reduces phone numbers to a suffix", () => {
    expect(redactString("call +61400111222 now")).toBe("call …1222 now");
    expect(redactString("+1 415-555-2671")).toBe("…2671");
  });

  it("keeps last-four helper consistent with display call sites", () => {
    expect(lastFour("+61400111222")).toBe("1222");
  });

  it("redacts secret-shaped strings", () => {
    expect(redactString("key sk-or-v1-abcdefghijklmnop here")).toContain("[redacted]");
    expect(redactString("github_pat_11ABCDEFGHIJKLMNOP")).toBe("[redacted]");
    expect(redactString("gho_abcdefghijklmnop123")).toBe("[redacted]");
  });

  it("deep-redacts nested structures", () => {
    const out = redactValue({
      note: "ring +61400111222",
      nested: [{ to: "+61400333444" }],
      n: 7,
    }) as { note: string; nested: Array<{ to: string }>; n: number };
    expect(out.note).toBe("ring …1222");
    expect(out.nested[0]?.to).toBe("…3444");
    expect(out.n).toBe(7);
  });

  it("leaves ordinary text alone", () => {
    expect(redactString("turn 3 took 850ms")).toBe("turn 3 took 850ms");
  });

  it("replaces circular references instead of recursing forever", () => {
    const a: Record<string, unknown> = { phone: "+61400111222" };
    a.self = a;
    a.list = [a];
    const out = redactValue(a) as Record<string, unknown>;
    expect(out.phone).toBe("…1222");
    expect(out.self).toBe("[circular]");
    expect(out.list).toEqual(["[circular]"]);
  });

  it("keeps diamond references that are not cycles", () => {
    const shared = { to: "+61400333444" };
    const out = redactValue({ a: shared, b: shared }) as {
      a: { to: string };
      b: { to: string };
    };
    expect(out.a.to).toBe("…3444");
    expect(out.b.to).toBe("…3444");
  });

  it("passes non-JSON leaves through untouched", () => {
    expect(redactValue(9n)).toBe(9n);
    expect(redactValue(undefined)).toBeUndefined();
    expect(redactValue(null)).toBeNull();
  });
});
