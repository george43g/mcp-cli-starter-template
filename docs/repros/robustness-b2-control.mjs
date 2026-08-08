/**
 * DEFERRED #14a — CONTROL. No options passed, so the registry survives.
 * Run from the repo root after `pnpm build`; expect "CLEANUP RAN".
 *
 * Compare with robustness-b2-test.mjs, which differs only by one option. Before
 * the 2026-08-09 fix the pair disagreed, which is what isolated the bug to
 * "an option was passed" rather than "something changed". They now agree.
 */
import {
  installShutdownHandlers,
  registerCleanup,
  shutdown,
} from "../../packages/robustness/dist/index.js";

registerCleanup(() => console.log("CLEANUP RAN"));
installShutdownHandlers();
void shutdown(0);
