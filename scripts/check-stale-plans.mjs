#!/usr/bin/env node
/**
 * check-stale-plans — an ExecPlan must say what state it is in, agree with
 * itself, and not sit non-terminal forever.
 *
 * Ported 2026-09-07 from life-stack's `check:stale-plans` (`da7e384`), offered
 * after a fleet-wide forgotten-plans sweep found four rows in this repo. Two of
 * the four were real:
 *
 *   - `2026-08-build-identity.md` said "planned, not started" for 28 days while
 *     every deliverable in it had shipped in `54917f1` the day after the plan was
 *     written. Nothing in the repo disagreed with the status line, because nothing
 *     read it.
 *   - `2026-08-tui-shared-primitives.md` had its status at line 33, under a long
 *     Goal. The sweep could not classify it at all and reported that whether it ran
 *     "can only be re-derived from the code it describes" — and re-derivation is
 *     where a wrong answer comes from.
 *
 * Three rules:
 *
 *   1. A status line in the first HEADER_LINES lines.
 *   2. A status that does not contradict a completion heading in its own body.
 *   3. A non-terminal plan with no commit in STALE_DAYS days, unless it carries
 *      a dated PARKED/SUPERSEDED.
 *
 * MEASURED AGAINST THOSE TWO REAL CASES, 2026-09-07, and the result is mixed —
 * recorded here because a guard's advertised coverage is exactly the thing that
 * rots into a false claim:
 *
 *   - tui-primitives: rule 1 CATCHES it. Verified by running this script against
 *     the pre-fix file.
 *   - build-identity: rule 3 does NOT catch it today. Its last commit was
 *     29.18 days old at the time of writing, under the 30-day line by about
 *     nineteen hours. It would have gone red tomorrow.
 *
 * The deeper limitation, which the near-miss makes visible: build-identity's
 * defect was that its status contradicted the CODE, and none of these rules read
 * code. Rule 3 would only ever have caught it as a side effect of age. A rule
 * that compared a plan's claims against the repo is the same class of problem as
 * DEFERRED #48 (symbol resolution in docs) and is deliberately not attempted
 * here. What this check honestly buys: a plan cannot go quiet, cannot hide its
 * status, and cannot contradict itself. It does not buy "the status is true".
 *
 * Rule 3 is why completed plans staying in `docs/plans/` is safe here. This repo
 * deliberately keeps them (see docs/plans/README.md: "history is evidence, not
 * clutter") rather than moving them to an `active/` directory, so the rule is
 * scoped to NON-TERMINAL plans and a `complete` plan can age indefinitely.
 *
 * TWO TRAPS, both named by life-stack from building it, both handled below:
 *
 *   - `PARTIALLY EXECUTED` contains `executed`. A substring match on terminal
 *     words exempts exactly the rottenest plans. Terminal status is matched on a
 *     word boundary against an explicit list, never as a substring.
 *   - On a SHALLOW clone, `git log -1 -- <file>` returns HEAD's timestamp for
 *     every file, so rule 3 passes vacuously for the whole directory.
 *     `actions/checkout` defaults to `fetch-depth: 1`, so that is CI's default
 *     state. This script detects shallowness and FAILS rather than passing --
 *     a staleness check that cannot see history is not a passing staleness check.
 *     (This repo's ci.yml already sets `fetch-depth: 0`; the guard is for every
 *     other context the script runs in.)
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const PLANS_DIR = resolve(process.argv[2] ?? "docs/plans");

/** How far into a plan a reader should have to look for its status. */
const HEADER_LINES = 20;

/** Days a non-terminal plan may go without a commit before it is stale. */
const STALE_DAYS = 30;

/**
 * Statuses that end a plan's life. Matched case-insensitively at the START of
 * the status value only -- see isTerminal() for why anywhere-in-string is not
 * enough, and never as a substring.
 */
const TERMINAL = ["complete", "completed", "done", "shipped", "abandoned", "superseded"];

/**
 * Deliberate, dated pauses. A plan carrying one of these with a date is exempt
 * from the staleness rule: it is parked on purpose, which is the opposite of
 * forgotten. Undated does NOT count -- "PARKED" with no date is how a plan gets
 * parked permanently.
 */
const PARKED = /\b(PARKED|SUPERSEDED)\b[^\n]*?(\d{4}-\d{2}-\d{2})/i;

/** `**Status**: value` / `Status - value`, all on one line. */
const STATUS_INLINE = /^\s*(?:\*\*)?status(?:\*\*)?\s*[:\-–—]\s*(.+)$/im;

/** `## Status` as a heading on its own, with the value on a later line. */
const STATUS_HEADING = /^#{1,6}\s*status\s*$/im;

/** A heading that declares the work finished, e.g. `## BUILT 2026-08-22`. */
const COMPLETION_HEADING = /^#{1,6}\s+.*\b(BUILT|SHIPPED|COMPLETE|COMPLETED|LANDED|DONE)\b/im;

/**
 * Both shapes real plans use here: the one-liner, and a `## Status` section
 * whose value is the first non-empty line under it. The second exists because
 * `2026-08-tui-shared-primitives.md` is written that way — a checker that only
 * understood the one-liner would report "no status at all" for a plan that has
 * a perfectly good one, which is a worse error than the one it is looking for.
 */
function extractStatus(text) {
  const inline = text.match(STATUS_INLINE);
  if (inline) return inline[1].trim();

  const heading = text.match(STATUS_HEADING);
  if (heading) {
    const rest = text.slice(heading.index + heading[0].length);
    const value = rest.split("\n").find((line) => line.trim().length > 0);
    if (value) return value.trim();
  }
  return null;
}

/**
 * Terminal words count only at the START of the status value.
 *
 * Two ways a looser match goes wrong, both measured against real fixtures:
 *   - substring: `PARTIALLY EXECUTED` contains `executed` (life-stack's trap);
 *   - anywhere-in-string: `PARTIALLY EXECUTED — two of five done` contains the
 *     whole word `done`, so even a word-boundary sweep marks the rottenest
 *     possible status as finished. That one this repo's own test found.
 *
 * A status describes state, and the state is the first thing it says. Markdown
 * and emoji are stripped first so "✅ **complete** — landed" still reads.
 */
function isTerminal(status) {
  const head = status
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();
  return TERMINAL.some((word) => new RegExp(`^${word}\\b`).test(head));
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

/**
 * Shallow clones make rule 3 lie. Detect it and say so, rather than reporting a
 * pass that means "I could not look".
 */
function assertFullHistory() {
  if (git(["rev-parse", "--is-shallow-repository"]) !== "true") return;
  console.error("check-stale-plans: FAIL — this is a SHALLOW clone.");
  console.error("");
  console.error("  `git log -1 -- <file>` returns HEAD's timestamp for every file here,");
  console.error("  so the staleness rule would pass for every plan without reading any");
  console.error("  history. That is a vacuous pass, so this fails instead.");
  console.error("");
  console.error("  Fix: `fetch-depth: 0` on actions/checkout, or `git fetch --unshallow`.");
  process.exit(1);
}

function lastCommitDays(file) {
  const iso = git(["log", "-1", "--format=%cI", "--", file]);
  if (!iso) return null; // never committed — a brand-new plan, not a stale one
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

function checkPlan(file) {
  const name = basename(file);
  const body = readFileSync(file, "utf8");
  const header = body.split("\n").slice(0, HEADER_LINES).join("\n");
  const problems = [];

  // Rule 1 — a status a reader can find without hunting.
  const status = extractStatus(header);
  if (!status) {
    const anywhere = extractStatus(body);
    problems.push(
      anywhere
        ? `no status in the first ${HEADER_LINES} lines (found one further down: ` +
            `"${anywhere.slice(0, 60)}"). Hoist it into the header.`
        : `no status line at all. Add "**Status**: active | paused | complete".`,
    );
    // Without a header status the remaining rules have nothing to read.
    return problems.map((p) => `${name}: ${p}`);
  }

  const terminal = isTerminal(status);

  // Rule 2 — the plan must not disagree with itself.
  const completion = body.match(COMPLETION_HEADING);
  if (!terminal && completion) {
    problems.push(
      `status says "${status.slice(0, 50)}" but the body carries a completion ` +
        `heading: "${completion[0].trim()}". One of them is wrong.`,
    );
  }

  // Rule 3 — a non-terminal plan cannot sit untouched forever.
  if (!terminal) {
    const days = lastCommitDays(file);
    if (days !== null && days > STALE_DAYS && !PARKED.test(body)) {
      problems.push(
        `non-terminal ("${status.slice(0, 50)}") and untouched for ` +
          `${Math.floor(days)} days. Update it, mark it complete, or add a dated ` +
          `PARKED/SUPERSEDED note saying why it is waiting.`,
      );
    }
  }

  return problems.map((p) => `${name}: ${p}`);
}

assertFullHistory();

const plans = readdirSync(PLANS_DIR)
  .filter((f) => f.endsWith(".md") && f !== "README.md")
  .map((f) => join(PLANS_DIR, f))
  .sort();

// Positive control. An empty plan set makes every rule pass vacuously, which is
// indistinguishable from a clean directory -- and this repo's own history has a
// check that enforced nothing for months while looking green.
if (plans.length === 0) {
  console.error(`check-stale-plans: FAIL — no plans found under ${PLANS_DIR}.`);
  console.error("  Nothing was checked, so this is not a pass. Wrong directory?");
  process.exit(1);
}

const failures = plans.flatMap(checkPlan);

if (failures.length > 0) {
  console.error("check-stale-plans: FAIL\n");
  for (const f of failures) console.error(`  ${f}`);
  console.error(`\n  ${failures.length} problem(s) across ${plans.length} plan(s).`);
  console.error("  Convention: docs/plans/README.md");
  process.exit(1);
}

console.log(`check-stale-plans: ${plans.length} plan(s) OK.`);
