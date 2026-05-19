/**
 * configLeaf<T> — one settable/askable value in the IoC config tree.
 *
 * Lifecycle:
 *   1. Caller may pre-populate via `.set(value)` (commander flag → setter).
 *   2. First read via `await leaf.get()`:
 *        - If `skipIf(config)` returns true → returns undefined, never asks.
 *        - If already set → returns cached value.
 *        - Else fires `ask()` (inquirer prompt), caches the answer.
 *   3. Subsequent reads always return cached value without re-prompting.
 *   4. `.peek()` returns the current value (or undefined) without prompting.
 *      Used by `skipIf` predicates and dependent leaves to avoid recursion.
 *   5. `.invalidate()` clears the cache so the next read re-asks.
 */

import type { Config } from "./config.js";

export interface ConfigLeafSpec<T> {
  /** Inquirer prompt invocation. Receives the partial config so it can branch. */
  ask: (config: Config) => Promise<T>;
  /** Optional predicate: if true at read-time, the leaf yields undefined. */
  skipIf?: (config: Config) => boolean;
  /** Optional validator. Throws to reject; returns nothing on success. */
  validate?: (value: T) => void;
  /** Default value used in non-interactive contexts when no commander flag is set. */
  defaultValue?: T;
}

export interface ConfigLeaf<T> {
  /** Read the leaf — may prompt if unset and interactive. */
  get(): Promise<T | undefined>;
  /** Read the current cached value without prompting. */
  peek(): T | undefined;
  /** Explicitly set the value (from a commander flag, scripted run, etc.). */
  set(value: T): void;
  /** Clear the cache. Next `get()` will re-ask. */
  invalidate(): void;
}

export function configLeaf<T>(spec: ConfigLeafSpec<T>): (config: Config) => ConfigLeaf<T> {
  return (config) => {
    let cached: { value: T } | undefined;

    const leaf: ConfigLeaf<T> = {
      async get() {
        if (spec.skipIf?.(config)) return undefined;
        if (cached) return cached.value;
        const next = await spec.ask(config);
        spec.validate?.(next);
        cached = { value: next };
        return next;
      },
      peek() {
        return cached?.value;
      },
      set(value) {
        spec.validate?.(value);
        cached = { value };
      },
      invalidate() {
        cached = undefined;
      },
    };

    if (spec.defaultValue !== undefined && cached === undefined) {
      // The default is NOT auto-set — it's only used in non-interactive mode.
      // Code that needs the default must call leaf.set(default) explicitly,
      // typically when --yes/--defaults is passed at the CLI.
    }

    return leaf;
  };
}
