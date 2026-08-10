/**
 * Contract tests for useVimKeys' input dispatch.
 *
 * These exist because the hook had NO test, and two defects lived in one line
 * for its whole life. Reported by the browser-tab consumer against a real
 * 56-row list, reproduced here through the real ink -> useInput path rather
 * than by calling a handler directly: the bug IS in how ink delivers input, so
 * a test that bypasses ink cannot see it.
 *
 * Ink delivers a keystroke burst or a paste as ONE useInput call containing the
 * whole string. Every comparison in the hook was `input === "j"`, so a burst
 * matched nothing and was dropped.
 */

import { Text } from "ink";
import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import { useVimKeys, type VimKeysHandlers } from "./useVimKeys.js";

/** Let ink's input handler and React's flush run. */
const tick = () => new Promise((r) => setTimeout(r, 0));

function Harness(props: VimKeysHandlers & { enabled?: boolean }) {
  useVimKeys(props);
  return <Text>harness</Text>;
}

function mount(handlers: Partial<VimKeysHandlers> & { enabled?: boolean } = {}) {
  const onMove = vi.fn();
  const onTop = vi.fn();
  const onBottom = vi.fn();
  const onUnhandled = vi.fn();
  const { stdin, unmount } = render(
    <Harness
      onMove={onMove}
      onTop={onTop}
      onBottom={onBottom}
      onUnhandled={onUnhandled}
      {...handlers}
    />,
  );
  return { stdin, unmount, onMove, onTop, onBottom, onUnhandled };
}

describe("useVimKeys — multi-character chunks", () => {
  it("moves once per j when a burst arrives as ONE write", async () => {
    // browser-tab measured: "jj" as one write moved 0 rows.
    const h = mount();
    h.stdin.write("jj");
    await tick();
    expect(h.onMove).toHaveBeenCalledTimes(2);
    expect(h.onMove).toHaveBeenNthCalledWith(1, 1);
    expect(h.onMove).toHaveBeenNthCalledWith(2, 1);
    h.unmount();
  });

  it("does not lose keystrokes in a longer burst", async () => {
    // "10 separate j, no delay -> 4" was the reported loss.
    const h = mount();
    h.stdin.write("jjjjjjjjjj");
    await tick();
    expect(h.onMove).toHaveBeenCalledTimes(10);
    h.unmount();
  });

  it("applies a count prefix delivered in the same chunk", async () => {
    // "5j" as one chunk was swallowed entirely.
    const h = mount();
    h.stdin.write("5j");
    await tick();
    expect(h.onMove).toHaveBeenCalledTimes(1);
    expect(h.onMove).toHaveBeenCalledWith(5);
    h.unmount();
  });

  /**
   * The nastiest half of the defect. `input >= "0" && input <= "9"` is a
   * LEXICOGRAPHIC string range, so the multi-char "5j" passed the digit guard
   * and was appended to the count buffer. The next lone `j` then replayed it as
   * count 5 — a keystroke moving 5 rows for no visible reason.
   */
  it("leaves no stale count behind after a chunked count", async () => {
    const h = mount();
    h.stdin.write("5j");
    await tick();
    h.onMove.mockClear();
    h.stdin.write("j");
    await tick();
    expect(h.onMove).toHaveBeenCalledTimes(1);
    expect(h.onMove).toHaveBeenCalledWith(1);
    h.unmount();
  });

  it("handles gg arriving as one chunk", async () => {
    const h = mount();
    h.stdin.write("gg");
    await tick();
    expect(h.onTop).toHaveBeenCalledTimes(1);
    h.unmount();
  });

  it("still handles keys delivered separately", async () => {
    // Regression guard: the separate-keystroke path already worked.
    const h = mount();
    h.stdin.write("5");
    await tick();
    h.stdin.write("j");
    await tick();
    expect(h.onMove).toHaveBeenCalledTimes(1);
    expect(h.onMove).toHaveBeenCalledWith(5);
    h.unmount();
  });
});

describe("useVimKeys — paste safety", () => {
  /**
   * Fanning out EVERY chunk per code point would make a paste fire motion and
   * destructive handlers. So the fan-out is deliberately narrow: it applies
   * only when the whole chunk is keys this hook already owns. Anything else
   * reaches onUnhandled intact, exactly as before.
   */
  it("forwards a prose paste to onUnhandled whole, and does not move", async () => {
    const h = mount();
    h.stdin.write("hello world");
    await tick();
    expect(h.onMove).not.toHaveBeenCalled();
    expect(h.onTop).not.toHaveBeenCalled();
    expect(h.onUnhandled).toHaveBeenCalledTimes(1);
    expect(h.onUnhandled).toHaveBeenCalledWith("hello world", expect.anything());
    h.unmount();
  });

  it("forwards a mixed chunk whole rather than picking motions out of it", async () => {
    // "dj" must not scroll: `d` is not ours, so the chunk is not ours.
    const h = mount();
    h.stdin.write("dj");
    await tick();
    expect(h.onMove).not.toHaveBeenCalled();
    expect(h.onUnhandled).toHaveBeenCalledWith("dj", expect.anything());
    h.unmount();
  });

  it("passes a single unhandled key through unchanged", async () => {
    const h = mount();
    h.stdin.write("x");
    await tick();
    expect(h.onUnhandled).toHaveBeenCalledWith("x", expect.anything());
    h.unmount();
  });
});

describe("useVimKeys — the rest of the key map", () => {
  // Added because loading this file for the first time revealed the real
  // branch coverage: v8 scores a never-loaded file as 100%, so the untested
  // half of this hook had been reported as covered for its whole life.

  it("moves up on k", async () => {
    const h = mount();
    h.stdin.write("k");
    await tick();
    expect(h.onMove).toHaveBeenCalledWith(-1);
    h.unmount();
  });

  it("applies a count to k", async () => {
    const h = mount();
    h.stdin.write("3k");
    await tick();
    expect(h.onMove).toHaveBeenCalledWith(-3);
    h.unmount();
  });

  it("jumps to the bottom on G", async () => {
    const h = mount();
    h.stdin.write("G");
    await tick();
    expect(h.onBottom).toHaveBeenCalledTimes(1);
    h.unmount();
  });

  it("moves on the arrow keys", async () => {
    const h = mount();
    h.stdin.write("[B"); // down
    await tick();
    h.stdin.write("[A"); // up
    await tick();
    expect(h.onMove).toHaveBeenNthCalledWith(1, 1);
    expect(h.onMove).toHaveBeenNthCalledWith(2, -1);
    h.unmount();
  });

  it("half-pages on Ctrl-D and Ctrl-U", async () => {
    const onHalfPageDown = vi.fn();
    const onHalfPageUp = vi.fn();
    const h = mount({ onHalfPageDown, onHalfPageUp });
    h.stdin.write(""); // Ctrl-D
    await tick();
    h.stdin.write(""); // Ctrl-U
    await tick();
    expect(onHalfPageDown).toHaveBeenCalledTimes(1);
    expect(onHalfPageUp).toHaveBeenCalledTimes(1);
    h.unmount();
  });

  it("does not start a count with 0 (vim convention)", async () => {
    // A leading `0` is a motion in vim, not a count — so it must not buffer.
    const h = mount();
    h.stdin.write("0j");
    await tick();
    expect(h.onMove).toHaveBeenCalledWith(1);
    h.unmount();
  });

  it("uses 0 as a digit once a count has started", async () => {
    const h = mount();
    h.stdin.write("10j");
    await tick();
    expect(h.onMove).toHaveBeenCalledWith(10);
    h.unmount();
  });

  it("clamps an absurd count rather than moving that far", async () => {
    const h = mount();
    h.stdin.write("99999j");
    await tick();
    expect(h.onMove).toHaveBeenCalledWith(9999);
    h.unmount();
  });
});

describe("useVimKeys — enabled", () => {
  it("no-ops entirely when disabled", async () => {
    const h = mount({ enabled: false });
    h.stdin.write("jj");
    await tick();
    expect(h.onMove).not.toHaveBeenCalled();
    expect(h.onUnhandled).not.toHaveBeenCalled();
    h.unmount();
  });
});
