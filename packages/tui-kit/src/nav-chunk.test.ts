import { describe, expect, it } from "vitest";
import { splitNavChunk } from "./nav-chunk.js";

const NAV = new Set([..."0123456789gGjk{}"]);

describe("splitNavChunk", () => {
  it("fans out a burst of owned keys", () => {
    expect(splitNavChunk("jjjj", NAV)).toEqual(["j", "j", "j", "j"]);
  });

  it("returns null for a chunk containing ANYTHING unowned", () => {
    // All-or-nothing. A partial fan-out is the paste-drives-motion bug reborn:
    // a pasted string whose recognised characters drive navigation while the
    // rest is silently dropped.
    expect(splitNavChunk("5jq", NAV)).toBeNull();
    expect(splitNavChunk("hello world", NAV)).toBeNull();
  });

  it("never invents or drops characters when it does split", () => {
    // Deterministic LCG: a failure is reproducible from the seed alone.
    let seed = 3;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const chars = [...NAV];
    for (let trial = 0; trial < 200; trial += 1) {
      const len = Math.floor(rnd() * 12);
      const input = Array.from({ length: len }, () => chars[Math.floor(rnd() * chars.length)]).join(
        "",
      );
      const out = splitNavChunk(input, NAV);
      expect(out).not.toBeNull();
      expect(out?.join("")).toBe(input);
    }
  });

  it("keeps a surrogate pair as one element rather than comparing halves", () => {
    const owned = new Set(["j", "😀"]);
    expect(splitNavChunk("j😀j", owned)).toEqual(["j", "😀", "j"]);
  });

  it("returns an empty array for empty input, satisfying the join contract", () => {
    expect(splitNavChunk("", NAV)).toEqual([]);
  });
});
