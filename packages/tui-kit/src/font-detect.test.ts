/**
 * Ported from the consumer this was lifted from, minus its app-specific
 * warning builder.
 *
 * `spawnSync` is awkward to mock cleanly, so the suite exercises the shape and
 * cache contract against the real binary when it is present, and asserts the
 * behaviour that matters most — that a missing `fc-list` yields `null`, never
 * `false`.
 */

import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { _resetDetectNerdFontCache, detectNerdFont } from "./font-detect.js";

describe("detectNerdFont", () => {
  it("returns a stable, exhaustively-narrowable shape", () => {
    _resetDetectNerdFontCache();
    const result = detectNerdFont();
    expect(["fc-list", "unavailable"]).toContain(result.source);
    if (result.source === "fc-list") {
      expect(typeof result.detected).toBe("boolean");
    } else {
      expect(result.detected).toBeNull();
      expect(typeof result.reason).toBe("string");
    }
  });

  it("caches per process (same object reference)", () => {
    _resetDetectNerdFontCache();
    const a = detectNerdFont();
    const b = detectNerdFont();
    expect(a).toBe(b);
  });

  it("agrees with reality on this machine when fc-list is present", () => {
    _resetDetectNerdFontCache();
    const probe = spawnSync("fc-list", ["--version"], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    if (probe.error) return; // no fc-list here — nothing to compare against
    const truth = spawnSync("fc-list", [":family"], { encoding: "utf8" });
    const realHasNerd = /Nerd/i.test(truth.stdout ?? "");
    const result = detectNerdFont();
    expect(result.source).toBe("fc-list");
    expect(result.detected).toBe(realHasNerd);
  });

  it("reports null, never false, when the result is unknown", () => {
    // The whole reason this is a three-variant type. Default macOS has no
    // fontconfig, and those users routinely DO have a patched font — so
    // answering `false` fires the warning at exactly the wrong people.
    _resetDetectNerdFontCache();
    const result = detectNerdFont();
    if (result.source === "unavailable") {
      expect(result.detected).toBeNull();
      expect(result.reason.length).toBeGreaterThan(0);
    } else {
      // fc-list exists here, so assert the contract structurally instead.
      expect(result.detected).not.toBeNull();
    }
  });

  it("_resetDetectNerdFontCache forces a fresh probe", () => {
    const first = detectNerdFont();
    _resetDetectNerdFontCache();
    const second = detectNerdFont();
    expect(second).not.toBe(first); // different object — it re-ran
    expect(second).toEqual(first); // same answer — the machine did not change
  });
});
