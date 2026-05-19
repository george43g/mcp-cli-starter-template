import { describe, expect, it, vi } from "vitest";
import type { Config } from "../src/core/config.js";
import { configLeaf } from "../src/core/config-leaf.js";

// The leaf doesn't actually read any field on Config in these tests; a stub
// is fine. We type-cast through unknown to avoid wiring up the full IoC tree.
const STUB_CONFIG = {} as unknown as Config;

describe("configLeaf", () => {
  it("calls ask() on first get(), caches the value after", async () => {
    const ask = vi.fn(async () => 42);
    const leaf = configLeaf<number>({ ask })(STUB_CONFIG);

    expect(await leaf.get()).toBe(42);
    expect(await leaf.get()).toBe(42);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("peek() returns undefined before any get/set", () => {
    const leaf = configLeaf<string>({ ask: async () => "x" })(STUB_CONFIG);
    expect(leaf.peek()).toBeUndefined();
  });

  it("peek() returns the cached value after get()", async () => {
    const leaf = configLeaf<string>({ ask: async () => "x" })(STUB_CONFIG);
    await leaf.get();
    expect(leaf.peek()).toBe("x");
  });

  it("set() pre-populates and skips ask()", async () => {
    const ask = vi.fn(async () => "from-ask");
    const leaf = configLeaf<string>({ ask })(STUB_CONFIG);

    leaf.set("from-set");
    expect(await leaf.get()).toBe("from-set");
    expect(ask).not.toHaveBeenCalled();
  });

  it("skipIf=true → get() returns undefined and never calls ask()", async () => {
    const ask = vi.fn(async () => "should-not-be-called");
    const leaf = configLeaf<string>({ ask, skipIf: () => true })(STUB_CONFIG);

    expect(await leaf.get()).toBeUndefined();
    expect(ask).not.toHaveBeenCalled();
  });

  it("skipIf=false → get() proceeds normally", async () => {
    const leaf = configLeaf<string>({ ask: async () => "hi", skipIf: () => false })(STUB_CONFIG);
    expect(await leaf.get()).toBe("hi");
  });

  it("invalidate() forces ask() to fire on next get()", async () => {
    const ask = vi.fn(async () => Math.random());
    const leaf = configLeaf<number>({ ask })(STUB_CONFIG);

    const first = await leaf.get();
    leaf.invalidate();
    const second = await leaf.get();

    expect(ask).toHaveBeenCalledTimes(2);
    expect(first).not.toBe(second); // different random
  });

  it("validate() runs on set() and throws on bad input", () => {
    const leaf = configLeaf<string>({
      ask: async () => "ok",
      validate: (v) => {
        if (!v.startsWith("good-")) throw new Error("validation failed");
      },
    })(STUB_CONFIG);

    expect(() => leaf.set("bad")).toThrow("validation failed");
    expect(() => leaf.set("good-x")).not.toThrow();
  });

  it("validate() also runs on the ask() result", async () => {
    const leaf = configLeaf<string>({
      ask: async () => "rejected",
      validate: (v) => {
        if (v === "rejected") throw new Error("ask returned bad value");
      },
    })(STUB_CONFIG);

    await expect(leaf.get()).rejects.toThrow("ask returned bad value");
  });
});
