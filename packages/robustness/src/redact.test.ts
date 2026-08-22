import { describe, expect, it } from "vitest";
import { lastFour, redactEmail, redactString, redactValue } from "./redact.js";

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

describe("redactEmail", () => {
  it("keeps the first character of the local part and the whole domain", () => {
    expect(redactEmail("george.x@gmail.com")).toBe("g…@gmail.com");
  });

  it("hides the local part entirely when it is 2 characters or fewer", () => {
    // The reason this rule is not the `lastFour` shape: first+last of a
    // two-character local part IS the whole local part.
    expect(redactEmail("al@x.com")).toBe("…@x.com");
    expect(redactEmail("a@x.com")).toBe("…@x.com");
  });

  it("preserves the domain, which is the diagnostic half", () => {
    expect(redactEmail("someone@mail.internal.corp")).toBe("s…@mail.internal.corp");
  });

  it("splits on the LAST @, so a quoted local part cannot shift the boundary", () => {
    expect(redactEmail("a@b@example.com")).toBe("a…@example.com");
  });

  it("returns non-addresses unchanged rather than mangling them", () => {
    expect(redactEmail("no-at-sign")).toBe("no-at-sign");
    expect(redactEmail("@leading")).toBe("@leading");
  });
});

describe("email redaction is opt-in, and the default is a measurement", () => {
  // This table is the argument for the default, kept executable so it cannot
  // rot into a comment that used to be true.
  const NOT_EMAILS = [
    "clone git@github.com:george43g/mcp-cli-starter-template.git",
    "resolved lodash@4.17.21 from registry",
    "specifier @george43g/robustness@0.11.0 -> 0.11.0",
    "postgres://svc@db.internal.corp/main",
  ];

  it("leaves addresses alone by default", () => {
    expect(redactString("sending to george.x@gmail.com failed")).toBe(
      "sending to george.x@gmail.com failed",
    );
  });

  it("masks addresses when asked", () => {
    expect(redactString("sending to george.x@gmail.com failed", { emails: true })).toBe(
      "sending to g…@gmail.com failed",
    );
  });

  it("DOES corrupt specifiers and remotes when enabled — the reason it is opt-in", () => {
    // Asserting the false positives rather than describing them: if a future
    // change makes the pattern safe for these, this test fails and the default
    // should be revisited.
    for (const line of NOT_EMAILS) {
      expect(redactString(line, { emails: true })).not.toBe(line);
    }
  });

  it("leaves those same lines untouched at the default", () => {
    for (const line of NOT_EMAILS) {
      expect(redactString(line)).toBe(line);
    }
  });

  it("still redacts phones and secrets when emails are enabled", () => {
    expect(redactString("call +61 401 234 567 now", { emails: true })).toContain("…4567");
  });

  it("redactValue threads the option through nested data", () => {
    const out = redactValue({ to: ["a.person@example.com"] }, { emails: true }) as {
      to: string[];
    };
    expect(out.to[0]).toBe("a…@example.com");
  });

  it("redactValue leaves addresses alone by default", () => {
    const out = redactValue({ to: ["a.person@example.com"] }) as { to: string[] };
    expect(out.to[0]).toBe("a.person@example.com");
  });
});
