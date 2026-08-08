/**
 * DEFERRED #14a — installShutdownHandlers(opts) discards already-registered
 * cleanups. Identical to robustness-b2-control.mjs except one option is passed.
 * Run from the repo root after `pnpm build`; today "CLEANUP RAN" never prints.
 */
import {
  installShutdownHandlers,
  registerCleanup,
  shutdown,
} from "../../packages/robustness/dist/index.js";

registerCleanup(() => console.log("CLEANUP RAN"));
installShutdownHandlers({ forceExitAfterMs: 3000 });
void shutdown(0);
