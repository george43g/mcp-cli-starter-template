import { describe, expect, it } from "vitest";
import { CONTENT_BUDGET, sanitize, sanitizeContent } from "./sanitize.js";

describe("sanitize", () => {
  it("returns null for null/undefined input", () => {
    expect(sanitize(null)).toBeNull();
    expect(sanitize(undefined)).toBeNull();
  });

  it("strips ANSI CSI sequences", () => {
    const input = "\x1b[31mred\x1b[0m text";
    expect(sanitize(input)).toBe("red text");
  });

  it("replaces NUL and C0 control chars with U+FFFD", () => {
    expect(sanitize("hello\x00world")).toBe("hello�world");
    expect(sanitize("a\x01b\x02c")).toBe("a�b�c");
  });

  it("preserves \\t, \\n, \\r", () => {
    expect(sanitize("a\tb\nc\rd")).toBe("a\tb\nc\rd");
  });

  it("truncates to maxLength with ellipsis", () => {
    const long = "x".repeat(5000);
    const sanitized = sanitize(long, 100);
    expect(sanitized?.length).toBe(100);
    expect(sanitized?.endsWith("…")).toBe(true);
  });

  it("default maxLength is 4096", () => {
    const long = "x".repeat(5000);
    const sanitized = sanitize(long);
    expect(sanitized?.length).toBe(4096);
  });
});

describe("sanitizeContent — the large-payload entry point", () => {
  it("returns '' for null/undefined instead of null, so callers need no guard", () => {
    expect(sanitizeContent(null)).toBe("");
    expect(sanitizeContent(undefined)).toBe("");
    // The contrast that justifies a second function existing at all.
    expect(sanitize(null)).toBeNull();
  });

  it("ANNOUNCES truncation — a silently cut document reads as a complete one", () => {
    const out = sanitizeContent("x".repeat(50), 10);
    expect(out).toBe(`${"x".repeat(10)}…[truncated]`);
    expect(out).toMatch(/\[truncated\]$/);
  });

  it("leaves a payload under budget completely untouched", () => {
    const doc = "line one\nline two\twith a tab\r\n";
    expect(sanitizeContent(doc)).toBe(doc);
  });

  it("carries a document far past sanitize()'s 4096 default", () => {
    const big = "y".repeat(500_000);
    expect(sanitizeContent(big)).toHaveLength(500_000);
    // The same input through the snippet entry point is destroyed, which is why
    // browser-tab needed this lifted rather than reusing sanitize.
    expect(sanitize(big)).toHaveLength(4096);
  });

  it("still strips ANSI escapes and control characters", () => {
    expect(sanitizeContent("\u001B[31mred\u001B[0m")).toBe("red");
    expect(sanitizeContent("a\u0000b")).toBe("a\uFFFDb");
  });

  it("CONTENT_BUDGET is the exported default, not a magic number", () => {
    expect(CONTENT_BUDGET).toBe(1_048_576);
    expect(sanitizeContent("z".repeat(CONTENT_BUDGET + 5))).toMatch(/\[truncated\]$/);
  });
});
