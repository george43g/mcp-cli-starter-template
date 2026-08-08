/**
 * DEFERRED #14a — CONTROL. No options passed, so the registry survives.
 * Run from the repo root after `pnpm build`; expect "CLEANUP RAN".
 * Compare with robustness-b2-test.mjs, which differs only by one option.
 */
import {
  installShutdownHandlers,
  registerCleanup,
  shutdown,
} from "../../packages/robustness/dist/index.js";

registerCleanup(() => console.log("CLEANUP RAN"));
installShutdownHandlers();
void shutdown(0);
