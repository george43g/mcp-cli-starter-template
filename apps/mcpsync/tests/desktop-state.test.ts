import { describe, expect, it } from "vitest";
import { desktopRunning } from "../src/core/hosts/desktop-state.js";

describe("desktopRunning", () => {
  it("returns a boolean and never throws (detection is fail-open)", () => {
    // Exercises the real pgrep path on macOS / the false short-circuit
    // elsewhere; either way the contract is a non-throwing boolean.
    expect(typeof desktopRunning()).toBe("boolean");
  });
});
