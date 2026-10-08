/**
 * The router behind useVimKeys, tested directly: no Ink, no React, and an
 * injected clock instead of real timers.
 *
 * The first block is the compatibility proof. `legacyRouter` below is the
 * pre-keymap hook's dispatch, copied from tui-kit 0.5.2's useVimKeys.ts with
 * only its `setTimeout` replaced by the same injected clock. Thousands of
 * seeded key sequences run through both, and every handler call must match.
 */

import { defineKeymap, vimNavigation } from "@george43g/keymap";
import { describe, expect, it, vi } from "vitest";

import {
  createVimKeyRouter,
  type KeyState,
  type VimKeysHandlers,
  vimKeyHints,
} from "./vim-key-router.js";

// ---------------------------------------------------------------------------
// The old hook, as an oracle.
// ---------------------------------------------------------------------------

const OWNED_KEY = /^[0-9gGjk]$/;
const DIGIT = /^[0-9]$/;
const NAMED_FLAGS = [
  "upArrow",
  "downArrow",
  "leftArrow",
  "rightArrow",
  "pageUp",
  "pageDown",
  "home",
  "end",
  "return",
  "escape",
  "tab",
  "backspace",
  "delete",
] as const;

interface Legacy {
  route(input: string, key: KeyState, opts: VimKeysHandlers): void;
  getCount(): number;
  /** True once the two implementations' outputs are known to part ways. */
  diverged: boolean;
}

function legacyRouter(ggTimeout: number, now: () => number): Legacy {
  let numBuffer = "";
  let ggPending = false;
  let ggAt = 0;
  // Would the NEW router have cancelled the pending g by now?
  let newCancelled = false;
  const state: Legacy = { route, getCount, diverged: false };

  function getCount(): number {
    const raw = numBuffer;
    numBuffer = "";
    if (!raw) return 1;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 9999) : 1;
  }

  function handleKey(input: string, key: KeyState, opts: VimKeysHandlers) {
    // The old setTimeout, fired lazily.
    if (ggPending && now() - ggAt >= ggTimeout) {
      ggPending = false;
      newCancelled = false;
    }
    // Divergence bookkeeping (not old behaviour): the new router feeds every
    // non-digit single key to the matcher, and anything but `g` cancels a
    // pending `g` there.
    const isDigit = DIGIT.test(input) && !key.ctrl;
    const single = Array.from(input).length === 1 || NAMED_FLAGS.some((f) => key[f]);
    const asG = input === "g" && !key.ctrl && !key.shift;
    if (ggPending && single && !isDigit && !asG) newCancelled = true;

    // --- verbatim from useVimKeys.ts @ 0.5.2 below, timer aside ---
    if (DIGIT.test(input) && !key.ctrl) {
      if (numBuffer === "" && input === "0") return;
      numBuffer = (numBuffer + input).slice(0, 4);
      return;
    }
    if (input === "g" && !key.ctrl && !key.shift) {
      if (ggPending) {
        if (newCancelled) state.diverged = true;
        ggPending = false;
        newCancelled = false;
        opts.onTop?.();
        numBuffer = "";
        return;
      }
      ggPending = true;
      ggAt = now();
      return;
    }
    if (input === "G" || (input === "g" && key.shift)) {
      opts.onBottom?.();
      return;
    }
    if (key.ctrl && input === "d") {
      opts.onHalfPageDown?.();
      return;
    }
    if (key.ctrl && input === "u") {
      opts.onHalfPageUp?.();
      return;
    }
    if (input === "j" || key.downArrow) {
      opts.onMove?.(getCount());
      return;
    }
    if (input === "k" || key.upArrow) {
      opts.onMove?.(-getCount());
      return;
    }
    opts.onUnhandled?.(input, key);
  }

  function route(input: string, key: KeyState, opts: VimKeysHandlers) {
    if (!key.ctrl && input.length > 1 && [...input].every((ch) => OWNED_KEY.test(ch))) {
      for (const ch of input) handleKey(ch, key, opts);
      return;
    }
    handleKey(input, key, opts);
  }

  return state;
}

// ---------------------------------------------------------------------------
// Seeded key sequences.
// ---------------------------------------------------------------------------

type Ev = readonly [string, KeyState];

/** Shaped like Ink's useInput arguments (uppercase sets shift, ctrl passes the name). */
const ALPHABET: readonly Ev[] = [
  ["j", {}],
  ["k", {}],
  ["g", {}],
  ["G", { shift: true }],
  ["g", { shift: true }],
  ["0", {}],
  ["1", {}],
  ["5", {}],
  ["9", {}],
  ["x", {}],
  ["d", {}],
  ["u", {}],
  ["e", {}],
  ["J", { shift: true }],
  [" ", {}],
  ["d", { ctrl: true }],
  ["u", { ctrl: true }],
  ["d", { ctrl: true, meta: true }],
  ["k", { ctrl: true }],
  ["j", { meta: true }],
  ["g", { ctrl: true }],
  ["g", { meta: true }],
  ["g", { ctrl: true, shift: true }],
  ["5", { ctrl: true }],
  ["5", { meta: true }],
  ["e", { ctrl: true }],
  ["y", { ctrl: true }],
  ["f", { ctrl: true }],
  ["b", { ctrl: true }],
  ["", { downArrow: true }],
  ["", { upArrow: true }],
  ["", { downArrow: true, shift: true }],
  ["", { upArrow: true, ctrl: true }],
  ["", { leftArrow: true }],
  ["", { home: true }],
  ["", { end: true }],
  ["", { pageDown: true }],
  ["", { pageUp: true }],
  ["", { return: true }],
  ["", { escape: true, meta: true }],
  ["", {}],
  ["jj", {}],
  ["5j", {}],
  ["gg", {}],
  ["10j", {}],
  ["99999k", {}],
  ["Gg", {}],
  ["jjgg", {}],
  ["dj", {}],
  ["hello world", {}],
  ["jx", {}],
  ["😀", {}],
];

/** Never sums to exactly 500 within a sequence: the timer edge is not compared. */
const GAPS = [0, 0, 1, 170, 1000];

/** mulberry32: a seeded PRNG whose low bits are usable (an LCG's are not). */
function rng(seed: number) {
  let a = seed >>> 0;
  return (n: number) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) % n;
  };
}

type Call = readonly unknown[];

type LegacyHandlers = Required<
  Pick<
    VimKeysHandlers,
    "onMove" | "onTop" | "onBottom" | "onHalfPageDown" | "onHalfPageUp" | "onUnhandled"
  >
>;

function recorder(log: Call[], getCount: () => number): LegacyHandlers {
  return {
    onMove: (d) => log.push(["move", d]),
    onTop: () => log.push(["top"]),
    onBottom: () => log.push(["bottom"]),
    onHalfPageDown: () => log.push(["halfDown"]),
    onHalfPageUp: () => log.push(["halfUp"]),
    // A consumer's own count-bound key: `5x` reads the count in onUnhandled.
    onUnhandled: (input, key) =>
      log.push(["unhandled", input, key, input === "x" ? getCount() : null]),
  };
}

const CONFIGS: Record<string, (full: LegacyHandlers) => VimKeysHandlers> = {
  "every legacy handler": (h) => h,
  "onUnhandled only": (h) => ({ onUnhandled: h.onUnhandled }),
  "onMove + onUnhandled": (h) => ({ onMove: h.onMove, onUnhandled: h.onUnhandled }),
  "no handlers": () => ({}),
};

describe("createVimKeyRouter — identical to the old useVimKeys", () => {
  for (const [name, pick] of Object.entries(CONFIGS)) {
    it(`matches it on 4000 seeded sequences (${name})`, () => {
      const rand = rng(name.length * 7919);
      let compared = 0;
      let divergent = 0;
      for (let seq = 0; seq < 4000; seq += 1) {
        let t = 0;
        const clock = () => t;
        const oldLog: Call[] = [];
        const newLog: Call[] = [];
        const legacy = legacyRouter(500, clock);
        const router = createVimKeyRouter({ now: clock });
        const oldH = pick(recorder(oldLog, legacy.getCount));
        const newH = pick(recorder(newLog, router.getCount));

        const len = 1 + rand(8);
        for (let i = 0; i < len; i += 1) {
          t += GAPS[rand(GAPS.length)] ?? 0;
          const [input, key] = ALPHABET[rand(ALPHABET.length)] ?? ["", {}];
          legacy.route(input, key, oldH);
          router(input, key, newH);
        }
        if (legacy.diverged) {
          divergent += 1;
          continue;
        }
        compared += 1;
        expect(newLog).toEqual(oldLog);
        expect(router.getCount()).toBe(legacy.getCount());
      }
      // The excluded class (a pending g broken by another key) stays small.
      expect(compared).toBeGreaterThan(3800);
      expect(divergent).toBeGreaterThan(0);
    });
  }

  it("passes onUnhandled the very key object it was given", () => {
    const onUnhandled = vi.fn();
    const key = { ctrl: true };
    createVimKeyRouter()("e", key, { onUnhandled });
    expect(onUnhandled.mock.calls[0]?.[1]).toBe(key);
  });
});

describe("createVimKeyRouter — the one deliberate difference", () => {
  it("cancels a pending g on any other key, so `g j g` does not jump to the top", () => {
    // The old hook moved down and THEN jumped to the top here.
    const onTop = vi.fn();
    const onMove = vi.fn();
    const route = createVimKeyRouter({ now: () => 0 });
    route("g", {}, { onTop, onMove });
    route("j", {}, { onTop, onMove });
    route("g", {}, { onTop, onMove });
    expect(onMove).toHaveBeenCalledWith(1);
    expect(onTop).not.toHaveBeenCalled();
    route("g", {}, { onTop, onMove });
    expect(onTop).toHaveBeenCalledTimes(1);
  });

  it("ignores key-release events instead of treating them as presses", () => {
    // Only under the kitty protocol with event types on; the old hook moved twice per j.
    const onMove = vi.fn();
    const onUnhandled = vi.fn();
    const route = createVimKeyRouter();
    expect(route("j", { eventType: "release" }, { onMove, onUnhandled })).toBe(false);
    expect(onMove).not.toHaveBeenCalled();
    expect(onUnhandled).toHaveBeenCalledWith("j", { eventType: "release" });
  });
});

describe("createVimKeyRouter — gg timing", () => {
  function setup(ggTimeoutMs?: number) {
    let t = 0;
    const onTop = vi.fn();
    const route = createVimKeyRouter({
      now: () => t,
      ...(ggTimeoutMs === undefined ? {} : { ggTimeoutMs }),
    });
    const press = (after: number) => {
      t += after;
      route("g", {}, { onTop });
    };
    return { press, onTop };
  }

  it("jumps to the top on g g within the window", () => {
    const { press, onTop } = setup();
    press(0);
    press(499);
    expect(onTop).toHaveBeenCalledTimes(1);
  });

  it("does not jump when the second g comes after the window", () => {
    const { press, onTop } = setup();
    press(0);
    press(600);
    expect(onTop).not.toHaveBeenCalled();
    // ...but that late g starts a new gg.
    press(100);
    expect(onTop).toHaveBeenCalledTimes(1);
  });

  it("honours ggTimeoutMs", () => {
    const { press, onTop } = setup(1000);
    press(0);
    press(600);
    expect(onTop).toHaveBeenCalledTimes(1);
  });

  it("keeps a count across the timeout, as the old timer did", () => {
    let t = 0;
    const onMove = vi.fn();
    const route = createVimKeyRouter({ now: () => t });
    route("5", {}, { onMove });
    route("g", {}, { onMove });
    t += 600;
    route("j", {}, { onMove });
    expect(onMove).toHaveBeenCalledWith(5);
  });
});

describe("createVimKeyRouter — new handlers are opt-in", () => {
  const cases = [
    ["ctrl-e", "e", { ctrl: true }, "onLineDown"],
    ["ctrl-y", "y", { ctrl: true }, "onLineUp"],
    ["ctrl-f", "f", { ctrl: true }, "onPageDown"],
    ["page down", "", { pageDown: true }, "onPageDown"],
    ["ctrl-b", "b", { ctrl: true }, "onPageUp"],
    ["page up", "", { pageUp: true }, "onPageUp"],
  ] as const;

  for (const [label, input, key, handler] of cases) {
    it(`${label} reaches onUnhandled when ${handler} is not supplied`, () => {
      const onUnhandled = vi.fn();
      expect(createVimKeyRouter()(input, key, { onUnhandled, onMove: vi.fn() })).toBe(false);
      expect(onUnhandled).toHaveBeenCalledWith(input, key);
    });

    it(`${label} calls ${handler} with the count when supplied`, () => {
      const fn = vi.fn();
      const onUnhandled = vi.fn();
      const route = createVimKeyRouter();
      route("3", {}, { [handler]: fn, onUnhandled });
      expect(route(input, key, { [handler]: fn, onUnhandled })).toBe(true);
      route(input, key, { [handler]: fn, onUnhandled });
      expect(fn.mock.calls).toEqual([[3], [1]]);
      expect(onUnhandled).not.toHaveBeenCalled();
    });
  }

  it("leaves home and end unhandled by default, even with onTop/onBottom", () => {
    const onTop = vi.fn();
    const onBottom = vi.fn();
    const onUnhandled = vi.fn();
    const route = createVimKeyRouter();
    route("", { home: true }, { onTop, onBottom, onUnhandled });
    route("", { end: true }, { onTop, onBottom, onUnhandled });
    expect(onTop).not.toHaveBeenCalled();
    expect(onBottom).not.toHaveBeenCalled();
    expect(onUnhandled).toHaveBeenCalledTimes(2);
  });

  it("binds home and end when given the full vimNavigation preset", () => {
    const onTop = vi.fn();
    const onBottom = vi.fn();
    const route = createVimKeyRouter({ keymap: defineKeymap(vimNavigation) });
    route("", { home: true }, { onTop, onBottom });
    route("", { end: true }, { onTop, onBottom });
    expect(onTop).toHaveBeenCalledTimes(1);
    expect(onBottom).toHaveBeenCalledTimes(1);
  });
});

describe("createVimKeyRouter — custom keymaps", () => {
  it("routes an overridden key, and the default key is then unhandled", () => {
    const keymap = defineKeymap(vimNavigation, { overrides: { down: "n" } });
    const onMove = vi.fn();
    const onUnhandled = vi.fn();
    const route = createVimKeyRouter({ keymap });
    route("n", {}, { onMove, onUnhandled });
    route("j", {}, { onMove, onUnhandled });
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onUnhandled).toHaveBeenCalledWith("j", {});
  });

  it("matches a bound modified key exactly instead of the old leniency", () => {
    // Without the binding, ctrl-j would move down like j (old behaviour).
    const keymap = defineKeymap(vimNavigation, { overrides: { lineDown: "ctrl+j" } });
    const onMove = vi.fn();
    const onLineDown = vi.fn();
    const route = createVimKeyRouter({ keymap });
    route("j", { ctrl: true }, { onMove, onLineDown });
    expect(onLineDown).toHaveBeenCalledWith(1);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("splits a burst of an opt-in character key only when its handler is supplied", () => {
    const keymap = defineKeymap(vimNavigation, { overrides: { lineDown: "e" } });
    const onLineDown = vi.fn();
    const onUnhandled = vi.fn();
    const route = createVimKeyRouter({ keymap });
    route("ee", {}, { onUnhandled });
    expect(onUnhandled).toHaveBeenCalledWith("ee", {});
    route("ee", {}, { onLineDown, onUnhandled });
    expect(onLineDown).toHaveBeenCalledTimes(2);
    expect(onUnhandled).toHaveBeenCalledTimes(1);
  });

  it("does not dispatch ids it does not know", () => {
    const keymap = defineKeymap([...vimNavigation, { id: "quit", keys: "q", desc: "Quit" }]);
    const onUnhandled = vi.fn();
    expect(createVimKeyRouter({ keymap })("q", {}, { onUnhandled })).toBe(false);
    expect(onUnhandled).toHaveBeenCalledWith("q", {});
  });
});

describe("createVimKeyRouter — state", () => {
  it("returns whether it consumed the key, with or without handlers", () => {
    const route = createVimKeyRouter();
    expect(route("j", {})).toBe(true);
    expect(route("x", {})).toBe(false);
  });

  it("getCount reads and clears the typed count", () => {
    const route = createVimKeyRouter();
    route("4", {});
    route("2", {});
    expect(route.getCount()).toBe(42);
    expect(route.getCount()).toBe(1);
  });

  it("reset forgets the count and a pending g", () => {
    const onTop = vi.fn();
    const route = createVimKeyRouter({ now: () => 0 });
    route("7", {});
    route("g", {}, { onTop });
    route.reset();
    route("g", {}, { onTop });
    expect(onTop).not.toHaveBeenCalled();
    expect(route.getCount()).toBe(1);
  });
});

describe("vimKeyHints", () => {
  it("renders the router's default table", () => {
    const hints = vimKeyHints();
    expect(hints).toContainEqual({ key: "j/<Down>", label: "Move down" });
    expect(hints).toContainEqual({ key: "gg", label: "Go to top" });
    expect(hints).toContainEqual({ key: "<C-e>", label: "Scroll one line down" });
  });

  it("picks ids in the order given", () => {
    expect(vimKeyHints(undefined, ["halfPageDown", "bottom"])).toEqual([
      { key: "<C-d>", label: "Half page down" },
      { key: "G", label: "Go to bottom" },
    ]);
  });

  it("renders a caller's keymap and style", () => {
    expect(vimKeyHints(defineKeymap(vimNavigation), ["top"], "plain")).toEqual([
      { key: "g g/home", label: "Go to top" },
    ]);
  });

  it("throws on an unknown id rather than dropping a key", () => {
    expect(() => vimKeyHints(undefined, ["nope"])).toThrow(/nope/);
  });
});
