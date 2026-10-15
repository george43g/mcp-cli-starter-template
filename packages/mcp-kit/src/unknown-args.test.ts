import { describe, expect, it } from "vitest";
import { closestMatch, editDistance } from "./unknown-args.js";

describe("editDistance (optimal string alignment)", () => {
  it("counts insertions, deletions and substitutions", () => {
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("", "abc")).toBe(3);
    expect(editDistance("abc", "abc")).toBe(0);
  });

  it("counts an adjacent transposition as one edit", () => {
    expect(editDistance("limti", "limit")).toBe(1);
    expect(editDistance("ab", "ba")).toBe(1);
  });

  it("stops early once the distance exceeds max", () => {
    expect(editDistance("a", "abcdef", 2)).toBe(3);
    expect(editDistance("abcdef", "uvwxyz", 2)).toBe(3);
  });
});

describe("closestMatch", () => {
  it("suggests the declared name a typo meant", () => {
    expect(closestMatch("chatIdentifer", ["limit", "chatIdentifier"])).toBe("chatIdentifier");
    expect(closestMatch("limti", ["limit", "chatIdentifier"])).toBe("limit");
  });

  it("suggests nothing beyond 2 edits", () => {
    expect(closestMatch("cursor", ["limit", "chatIdentifier"])).toBeUndefined();
  });

  it("suggests nothing when the edits are half the candidate", () => {
    expect(closestMatch("q", ["id"])).toBeUndefined();
    expect(closestMatch("idx", ["id"])).toBe("id");
  });

  it("prefers the nearer candidate, then the one listed first", () => {
    expect(closestMatch("limt", ["limits", "limit"])).toBe("limit");
    expect(closestMatch("abcx", ["abcd", "abce"])).toBe("abcd");
  });
});
