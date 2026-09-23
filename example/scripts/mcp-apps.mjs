#!/usr/bin/env node
/**
 * mcp-apps.mjs — print the package NAME of every MCP app workspace, one per
 * line. None is a legitimate answer: stdout stays empty (it is a list), a
 * one-line notice goes to stderr, and the exit is 0.
 *
 * A thin CLI over scripts/lib/mcp-apps.mjs, which holds the marker, the
 * selection rule and the unnamed-workspace failure, and which for-each-mcp-app.mjs
 * imports directly. Deliberately NOT a module that also self-detects "was I run
 * directly?" — the argv/realpath comparison that needs is wrong under macOS's
 * /var → /private/var symlink and fails by printing nothing and exiting 0
 * even when MCP apps exist — silence that would read as "this repo has none",
 * with no notice on stderr to say otherwise.
 *
 * Useful by hand, and as the thing a human can run to see what the gates will
 * actually cover: `node scripts/mcp-apps.mjs`.
 */

import { noMcpAppsNotice, selectMcpApps } from "./lib/mcp-apps.mjs";

const apps = selectMcpApps("mcp-apps");
if (apps.length === 0) console.error(noMcpAppsNotice("mcp-apps"));
for (const app of apps) console.log(app.name);
