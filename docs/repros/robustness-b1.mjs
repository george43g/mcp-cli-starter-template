/**
 * DEFERRED #14b — installWatchdog(options) used to silently ignore options if
 * anything read watchdog state first. Fixed 2026-08-09 by reconfiguring the
 * singleton in place instead of letting the first lazy construction win.
 *
 * Run from the repo root after `pnpm build`:
 *   node docs/repros/robustness-b1.mjs
 * Expected: "onDiagnostic honoured: true", exit 0. Before the fix it printed
 * false and exited 1. Retained as regression evidence; the CI guard is the
 * singleton test in packages/robustness/src/watchdog.test.ts.
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
