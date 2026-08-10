#!/usr/bin/env node

/**
 * Reject commit messages whose PROSE would trigger an unintended release.
 *
 * Two modes, because a release can be reached by two different paths and a
 * guard that covers only one is a guard that reports success while the hole
 * stays open:
 *
 *   1. stdin — the PR title + body, checked on `pull_request`. A squash merge
 *      makes those the commit message, so this has to run BEFORE the merge.
 *
 *        printf '%s\n\n%s' "$PR_TITLE" "$PR_BODY" | node scripts/check-release-tokens.mjs
 *
 *   2. --range A..B — the actual commit messages being pushed, checked on
 *      `push` to main as a gate the release jobs depend on.
 *
 *        node scripts/check-release-tokens.mjs --range "$BEFORE".."$SHA"
 *
 * Mode 2 exists because mode 1 alone was not on the publishing path. `main` is
 * not a protected branch (verified 2026-08-10: the branch-protection API
 * returns 404), so a direct push never opens a PR and never met the check. The
 * merger can also edit a squash commit's message at merge time, which makes the
 * PR body a *prediction* of the commit message rather than the commit message.
 * Found by the life-stack session asking whether the guard was actually on the
 * path that publishes. It was not.
 *
 * Exit non-zero blocks the release jobs via `needs:` — the commit is already on
 * main by then, but nothing has published yet, and npm versions are immutable
 * so blocking is the only remedy that exists.
 */

import { execFileSync } from "node:child_process";

import {
  checkReleaseTokens,
  isGeneratedReleaseCommit,
  splitCommitMessages,
} from "./lib/release-tokens.mjs";

/** `0000000000000000000000000000000000000000` — GitHub's "no previous commit". */
const NULL_SHA = /^0{40}$/;

function readStdin() {
  return new Promise((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => {
      buf += c;
    });
    process.stdin.on("end", () => resolve(buf));
  });
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/**
 * Resolve the commit range to check.
 *
 * Falls back to HEAD alone whenever the range cannot be trusted: a new branch
 * (null before-SHA), a force push, or a rewritten history all leave `before`
 * unreachable. Checking one commit is a weaker guarantee than checking the
 * range, so say which happened rather than reporting a clean pass.
 */
function resolveMessages(range) {
  const [before, after] = range.split("..");
  const head = after && after.length > 0 ? after : "HEAD";

  if (!before || NULL_SHA.test(before)) {
    return {
      messages: splitCommitMessages(git(["log", "--format=%B%x00", "-1", head])),
      note: "no previous SHA (new branch or manual run) — checked HEAD only",
    };
  }

  try {
    // stderr piped, not inherited: an unreachable SHA is an expected branch
    // here, and git's `fatal:` on the probe reads like a real failure in logs.
    execFileSync("git", ["cat-file", "-e", `${before}^{commit}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return {
      messages: splitCommitMessages(git(["log", "--format=%B%x00", "-1", head])),
      note: `previous SHA ${before.slice(0, 8)} is unreachable (force push?) — checked HEAD only`,
    };
  }

  return {
    messages: splitCommitMessages(git(["log", "--format=%B%x00", `${before}..${head}`])),
    note: null,
  };
}

const rangeFlag = process.argv.indexOf("--range");
const failures = [];
let checked = 0;
let skipped = 0;

if (rangeFlag !== -1) {
  const range = process.argv[rangeFlag + 1];
  if (!range) {
    console.error("--range requires an argument, e.g. --range abc123..def456");
    process.exit(2);
  }
  const { messages, note } = resolveMessages(range);
  if (note) console.log(`note: ${note}`);

  for (const message of messages) {
    const subject = message.split("\n")[0] ?? "";
    if (isGeneratedReleaseCommit(subject)) {
      skipped += 1;
      continue;
    }
    checked += 1;
    const result = checkReleaseTokens(message);
    if (!result.ok) failures.push({ subject, reason: result.reason });
  }
} else {
  const message = await readStdin();
  checked = 1;
  const result = checkReleaseTokens(message);
  if (!result.ok) failures.push({ subject: message.split("\n")[0] ?? "", reason: result.reason });
}

if (failures.length > 0) {
  console.error("release-token check failed:\n");
  for (const { subject, reason } of failures) {
    console.error(`  ${subject}`);
    console.error(`  • ${reason}\n`);
  }
  process.exit(1);
}

const suffix = skipped > 0 ? ` (${skipped} generated bump commit(s) skipped)` : "";
console.log(`release-token check passed — ${checked} message(s) checked${suffix}.`);
