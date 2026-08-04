import { execFileSync } from "node:child_process";
import { platform } from "node:os";

/**
 * Whether the Claude Desktop app is currently running.
 *
 * Writing `claude_desktop_config.json` while Desktop runs is destructive:
 * Desktop keeps its `mcpServers` in memory and flushes that (possibly stale)
 * state back to the file when it quits, silently overwriting whatever mcpsync
 * just wrote — the exact footgun that reverted a synced config and a
 * monorepo-relocated server path in the field. mcpsync therefore SKIPS the
 * Desktop write while it's running (unless `--force`) and tells the user to
 * quit Desktop first.
 *
 * macOS-only — Claude Desktop is a Mac app today; returns false elsewhere so a
 * non-Mac host is never falsely blocked. Never throws: a detection failure is
 * treated as "not running" (fail-open on DETECTION so it can't wedge a
 * legitimate write; the write itself still fails-closed on a positive match).
 */
export function desktopRunning(): boolean {
  if (platform() !== "darwin") return false;
  try {
    // `pgrep -x Claude` matches the exact process name of the Desktop app
    // binary (Claude.app/Contents/MacOS/Claude). It exits 0 on a match, 1 on
    // no match, 2 on error; execFileSync throws on any non-zero exit, so a
    // clean "no match" lands in catch → false.
    execFileSync("pgrep", ["-x", "Claude"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
