/**
 * useVimKeys' new options, through the real ink -> useInput path. The router's
 * semantics are tested without Ink in `vim-key-router.test.ts`; this file
 * proves the hook wires them up. The original contract tests live, unchanged,
 * in `useVimKeys.test.tsx`.
 */

import { defineKeymap, vimNavigation } from "@george43g/keymap";
import { Text } from "ink";
import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import { type UseVimKeysOptions, useVimKeys } from "./useVimKeys.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

function Harness(props: UseVimKeysOptions & { onCount?: (getCount: () => number) => void }) {
  const { getCount } = useVimKeys(props);
  props.onCount?.(getCount);
  return <Text>harness</Text>;
}

describe("useVimKeys — opt-in handlers", () => {
  it("scrolls a line on Ctrl-E when onLineDown is supplied", async () => {
    const onLineDown = vi.fn();
    const onUnhandled = vi.fn();
    const { stdin, unmount } = render(
      <Harness onLineDown={onLineDown} onUnhandled={onUnhandled} />,
    );
    stdin.write("3");
    await tick();
    stdin.write("\u0005"); // Ctrl-E
    await tick();
    expect(onLineDown).toHaveBeenCalledWith(3);
    expect(onUnhandled).not.toHaveBeenCalled();
    unmount();
  });

  it("forwards Ctrl-E to onUnhandled when onLineDown is not supplied", async () => {
    const onUnhandled = vi.fn();
    const { stdin, unmount } = render(<Harness onMove={vi.fn()} onUnhandled={onUnhandled} />);
    stdin.write("\u0005");
    await tick();
    expect(onUnhandled).toHaveBeenCalledWith("e", expect.objectContaining({ ctrl: true }));
    unmount();
  });
});

describe("useVimKeys — keymap option", () => {
  it("leaves Home to onUnhandled with the default keymap", async () => {
    const onTop = vi.fn();
    const onUnhandled = vi.fn();
    const { stdin, unmount } = render(<Harness onTop={onTop} onUnhandled={onUnhandled} />);
    stdin.write("\u001b[H"); // Home
    await tick();
    expect(onTop).not.toHaveBeenCalled();
    expect(onUnhandled).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("binds Home to onTop with the full vimNavigation preset", async () => {
    const onTop = vi.fn();
    const keymap = defineKeymap(vimNavigation);
    const { stdin, unmount } = render(<Harness keymap={keymap} onTop={onTop} />);
    stdin.write("\u001b[H");
    await tick();
    expect(onTop).toHaveBeenCalledTimes(1);
    unmount();
  });
});

describe("useVimKeys — getCount", () => {
  it("returns a stable getCount that reads the typed count", async () => {
    const seen = new Set<() => number>();
    const { stdin, rerender, unmount } = render(<Harness onCount={(g) => seen.add(g)} />);
    stdin.write("42");
    await tick();
    rerender(<Harness onCount={(g) => seen.add(g)} />);
    expect(seen.size).toBe(1);
    const [getCount] = [...seen];
    expect(getCount?.()).toBe(42);
    expect(getCount?.()).toBe(1);
    unmount();
  });
});
