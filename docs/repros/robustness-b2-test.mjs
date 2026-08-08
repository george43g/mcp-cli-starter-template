/**
 * DEFERRED #14a — installShutdownHandlers(opts) used to discard already-
 * registered cleanups. Identical to robustness-b2-control.mjs except one option
 * is passed. Fixed 2026-08-09: options are now applied in place.
 *
 * Run from the repo root after `pnpm build`; expect "CLEANUP RAN", matching the
 * control. Before the fix it printed nothing. Retained as regression evidence;
 * the CI guard is the singleton test in packages/robustness/src/shutdown.test.ts.
 */
import {
  installShutdownHandlers,
  registerCleanup,
  shutdown,
} from "../../packages/robustness/dist/index.js";

registerCleanup(() => console.log("CLEANUP RAN"));
installShutdownHandlers({ forceExitAfterMs: 3000 });
void shutdown(0);
