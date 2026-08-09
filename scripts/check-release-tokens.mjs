#!/usr/bin/env node

/**
 * Reject commit messages whose PROSE would trigger an unintended release.
 *
 * Reads the message on stdin. In CI this is the PR title + body, because a
 * squash merge makes those the commit message — so the check has to run
 * BEFORE the merge, not after.
 *
 *   printf '%s\n\n%s' "$PR_TITLE" "$PR_BODY" | node scripts/check-release-tokens.mjs
 */

import { checkReleaseTokens } from "./lib/release-tokens.mjs";

const message = await new Promise((resolve) => {
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => {
    buf += c;
  });
  process.stdin.on("end", () => resolve(buf));
});

const result = checkReleaseTokens(message);
if (!result.ok) {
  console.error(`release-token check failed:\n\n  • ${result.reason}\n`);
  process.exit(1);
}
console.log("release-token check passed.");
