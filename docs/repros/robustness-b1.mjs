/**
 * DEFERRED #14b — installWatchdog(options) silently ignores options if anything
 * read watchdog state first. Run from the repo root after `pnpm build`:
 *   node docs/repros/robustness-b1.mjs
 * Expected today: "onDiagnostic honoured: false" (the bug).
 */
import { installWatchdog, readWatchdogState } from "../../packages/robustness/dist/index.js";

// tui-kit's useDevStats calls this during render, before an app can configure.
readWatchdogState();

let sawDiagnostic = false;
installWatchdog({
  idleRestart: false,
  maxRssMb: 4096,
  onDiagnostic: () => {
    sawDiagnostic = true;
  },
});

console.log("onDiagnostic honoured:", sawDiagnostic, "(expected true)");
process.exit(sawDiagnostic ? 0 : 1);
