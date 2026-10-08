/**
 * The demo TUI's keys, driven through ink's real input path.
 *
 * The App routes every key through ONE `useInput`: the vim router first, then
 * the app's own bindings. It used to register two hooks, and the second one's
 * `input === "d"` also matched ctrl-d (ink passes the letter with
 * `key.ctrl`), so half-page-down toggled the dev stats too.
 *
 * ink-testing-library's stdout has no `rows`, so the app sees the 24-row
 * fallback: `viewportRows(24)` = 20, minus the header row = 19 list rows, and
 * half a page is 9.
 */

import { ThemeProvider } from "@george43g/tui-kit";
import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { App } from "../src/tui/App.js";
import { appAction, keymap } from "../src/tui/keymap.js";
import { moveTo, pageBy, scrollBy } from "../src/tui/scroll.js";

const CTRL_B = "\x02";
const CTRL_D = "\x04";
const CTRL_E = "\x05";
const CTRL_F = "\x06";
const CTRL_U = "\x15";
const CTRL_Y = "\x19";
const STATS = "last activity";

/** Let ink's input handler and React's flush run. */
const tick = () => new Promise((r) => setTimeout(r, 0));

function mount() {
  const app = render(
    <ThemeProvider preset="safe">
      <App />
    </ThemeProvider>,
  );
  const frame = () => app.lastFrame() ?? "";
  return {
    ...app,
    frame,
    async press(...keys: string[]) {
      for (const k of keys) {
        app.stdin.write(k);
        await tick();
      }
    },
    /** "6 / 30" → 6: the 1-based cursor row from the status bar. */
    cursor: () => Number(/(\d+) \/ 30/.exec(frame())?.[1]),
    /** The id of the first list row on screen. */
    firstVisible: () => Number(/^\s*(\d+) Item \d+ /m.exec(frame())?.[1]),
  };
}

describe("TUI keys: one input router", () => {
  it("ctrl-d moves half a page and does NOT toggle the dev stats", async () => {
    const t = mount();
    await t.press(CTRL_D);
    expect(t.frame()).not.toContain(STATS);
    expect(t.cursor()).toBe(10);
    t.unmount();
  });

  it("d toggles the dev stats", async () => {
    const t = mount();
    await t.press("d");
    expect(t.frame()).toContain(STATS);
    await t.press("d");
    expect(t.frame()).not.toContain(STATS);
    expect(t.cursor()).toBe(1);
    t.unmount();
  });

  it("ctrl-e scrolls the view one line without moving the cursor", async () => {
    const t = mount();
    await t.press("5j");
    expect(t.cursor()).toBe(6);
    expect(t.firstVisible()).toBe(1);
    await t.press(CTRL_E);
    expect(t.firstVisible()).toBe(2);
    expect(t.cursor()).toBe(6);
    t.unmount();
  });

  it("5j moves down five; gg goes back to the top", async () => {
    const t = mount();
    await t.press("5", "j");
    expect(t.cursor()).toBe(6);
    await t.press("G");
    expect(t.cursor()).toBe(30);
    await t.press("g", "g");
    expect(t.cursor()).toBe(1);
    expect(t.firstVisible()).toBe(1);
    t.unmount();
  });

  it("ctrl-u, ctrl-y, ctrl-f and ctrl-b move by their own amounts", async () => {
    const t = mount();
    await t.press(CTRL_F);
    // A page is 19 rows; the view stops where the last row is on screen.
    expect([t.cursor(), t.firstVisible()]).toEqual([20, 12]);
    await t.press(CTRL_Y);
    expect([t.cursor(), t.firstVisible()]).toEqual([20, 11]); // the view moved, the cursor did not
    await t.press(CTRL_U);
    expect([t.cursor(), t.firstVisible()]).toEqual([11, 2]); // half a page, both together
    await t.press(CTRL_B);
    expect([t.cursor(), t.firstVisible()]).toEqual([1, 1]);
    t.unmount();
  });

  it("q quits", async () => {
    const t = mount();
    expect(t.frame()).toContain("1 / 30");
    await t.press("q");
    // On exit ink unmounts the tree; its last frame is empty.
    expect(t.frame().trim()).toBe("");
    t.unmount();
  });

  it("a pasted chunk containing app keys triggers nothing", async () => {
    const t = mount();
    await t.press("dq");
    expect(t.frame()).not.toContain(STATS);
    expect(t.frame()).toContain("1 / 30");
    t.unmount();
  });
});

describe("TUI keymap", () => {
  it("declares no conflicting, ambiguous or rebound keys", () => {
    expect(keymap.diagnostics).toEqual([]);
  });

  it("maps a lone app key to its id, and nothing else", () => {
    expect(appAction("d", {})).toBe("devStats");
    expect(appAction("d", { ctrl: true })).toBeUndefined();
    expect(appAction("q", {})).toBe("quit");
    expect(appAction("", { escape: true })).toBe("quit");
    expect(appAction("dq", {})).toBeUndefined();
    expect(appAction("x", {})).toBeUndefined();
  });
});

describe("scroll arithmetic (30 items, 10 rows)", () => {
  const at = (cursor: number, top: number) => ({ cursor, top });

  it("moveTo scrolls only as far as it takes to show the cursor", () => {
    expect(moveTo(at(0, 0), 5, 30, 10)).toEqual(at(5, 0));
    expect(moveTo(at(5, 0), 12, 30, 10)).toEqual(at(12, 3));
    expect(moveTo(at(12, 3), 99, 30, 10)).toEqual(at(29, 20));
    expect(moveTo(at(29, 20), -4, 30, 10)).toEqual(at(0, 0));
  });

  it("scrollBy keeps the cursor unless it leaves the screen", () => {
    expect(scrollBy(at(5, 0), 1, 30, 10)).toEqual(at(5, 1));
    expect(scrollBy(at(0, 0), 3, 30, 10)).toEqual(at(3, 3));
    expect(scrollBy(at(9, 0), -1, 30, 10)).toEqual(at(9, 0));
    expect(scrollBy(at(25, 20), 5, 30, 10)).toEqual(at(25, 20));
    expect(scrollBy(at(29, 20), -15, 30, 10)).toEqual(at(14, 5));
  });

  it("pageBy moves the view and the cursor together", () => {
    expect(pageBy(at(2, 0), 5, 30, 10)).toEqual(at(7, 5));
    expect(pageBy(at(27, 20), 5, 30, 10)).toEqual(at(29, 20));
    expect(pageBy(at(7, 5), -5, 30, 10)).toEqual(at(2, 0));
  });
});
