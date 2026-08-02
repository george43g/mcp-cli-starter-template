/**
 * TUI entry — wraps App in ThemeProvider + fullscreen-ink, installs the
 * robustness shutdown/watchdog handlers, and returns once the user quits.
 *
 * Loaded dynamically by src/cli.ts when the `tui` subcommand runs (guarded by
 * isInteractive()), so ink/react are never touched by the plain CLI paths.
 *
 * To remove TUI support: delete this file + src/tui/, and drop the `tui`
 * subcommand from src/cli.ts.
 */

import {
  envStr,
  installShutdownHandlers,
  installWatchdog,
  logStartup,
  registerCleanup,
  setLogFilePrefix,
  startHeapMonitor,
} from "@george43g/robustness";
import { renderFullScreen, ThemeProvider } from "@george43g/tui-kit";
import { App } from "./App.js";

export async function runTui(config?: string | undefined): Promise<void> {
  setLogFilePrefix("mcpsync");

  installShutdownHandlers({ exitOnUncaughtException: false });
  installWatchdog({ idleRestart: false });
  startHeapMonitor();
  logStartup("mcpsync-tui");

  // Validate env values instead of casting blindly (imsg app-config parity):
  // an unknown theme or malformed accent falls back to the defaults.
  const rawPreset = envStr("MCPSYNC_TUI_THEME", "safe");
  const preset: "safe" | "powerline" = rawPreset === "powerline" ? "powerline" : "safe";
  const rawAccent = envStr("MCPSYNC_TUI_ACCENT", "#1982FC");
  const accent = /^#[0-9a-fA-F]{6}$/.test(rawAccent) ? rawAccent : "#1982FC";

  const screen = await renderFullScreen(
    <ThemeProvider preset={preset} accent={accent}>
      <App config={config} />
    </ThemeProvider>,
  );

  registerCleanup(() => screen.unmount());

  await screen.waitUntilExit();
}
