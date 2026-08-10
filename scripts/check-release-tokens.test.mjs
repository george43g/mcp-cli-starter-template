import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkReleaseTokens,
  isGeneratedReleaseCommit,
  RELEASE_BOT_EMAIL,
  splitCommitRecords,
} from "./lib/release-tokens.mjs";

/**
 * The regression case is REAL and is the first test: this exact message shipped
 * `@george43g/cli-kit@2.0.0` from a docs-only change, with a `dist/`
 * byte-identical to 1.0.0.
 */
const THE_ACCIDENT = `docs: correct cli-kit to 1.0.0 and record why the number differs (#40)

cli-kit published as 1.0.0, not the planned 0.4.0.
\`@semantic-release/commit-analyzer\` ships no releaseRules override here, and
its default maps any breaking change to a MAJOR without clamping 0.x — so the
\`!\` marker and BREAKING CHANGE footer took it past 0.x.`;

describe("checkReleaseTokens", () => {
  it("rejects the docs commit that actually published a major", () => {
    const result = checkReleaseTokens(THE_ACCIDENT);
    assert.equal(result.ok, false);
    assert.match(result.reason ?? "", /without a "!" in the subject/);
  });

  it("allows a genuine breaking change that marks itself twice", () => {
    const msg = `feat(cli-kit)!: model non-text content blocks

BREAKING CHANGE: ToolCallResult.content is now a discriminated union.`;
    assert.equal(checkReleaseTokens(msg).ok, true);
  });

  it("rejects a '!' subject with no footer explaining it", () => {
    const msg = `feat(cli-kit)!: change everything

No explanation of what broke.`;
    const result = checkReleaseTokens(msg);
    assert.equal(result.ok, false);
    assert.match(result.reason ?? "", /no "BREAKING CHANGE:" footer/);
  });

  it("allows ordinary commits", () => {
    assert.equal(checkReleaseTokens("fix(cli-kit): drain piped REPL input").ok, true);
    assert.equal(checkReleaseTokens("docs: update the README\n\nSome prose.").ok, true);
    assert.equal(checkReleaseTokens("chore: bump deps").ok, true);
  });

  it("allows lowercase prose about breaking changes", () => {
    // The documented escape hatch: write about it without spelling the token.
    const msg = `docs: explain why the version jumped

The commit carried a breaking change marker, which cut a major.`;
    assert.equal(checkReleaseTokens(msg).ok, true);
  });

  it("catches the hyphenated spelling too", () => {
    // conventional-changelog accepts BREAKING-CHANGE as an equivalent footer.
    const msg = `docs: a note

Mentions BREAKING-CHANGE in passing.`;
    assert.equal(checkReleaseTokens(msg).ok, false);
  });

  it("catches the token in the subject line as well as the body", () => {
    assert.equal(checkReleaseTokens("docs: describe the BREAKING CHANGE trap").ok, false);
  });

  /**
   * semantic-release's own bump commit body is `${nextRelease.notes}`, whose
   * heading is the PLURAL "BREAKING CHANGES". The token regex ends in `\b`, so
   * the trailing S denies the match. This is load-bearing and easy to break by
   * "simplifying" the regex — verified against the real 1.0.0 bump commit body.
   */
  it("tolerates the plural heading semantic-release writes into bump commits", () => {
    const msg = `chore(release): cli-kit 1.0.0 [skip ci]

# [1.0.0](https://github.com/x/y/compare/a...b) (2026-08-10)

### BREAKING CHANGES

* ToolCallResult.content is now a discriminated union.`;
    assert.equal(checkReleaseTokens(msg).ok, true);
  });
});

describe("isGeneratedReleaseCommit", () => {
  const BOT = RELEASE_BOT_EMAIL;

  it("recognises a real semantic-release bump commit", () => {
    assert.equal(isGeneratedReleaseCommit("chore(release): cli-kit 2.0.0 [skip ci]", BOT), true);
  });

  /**
   * The hole the life-stack session asked about: the first version matched on
   * the SUBJECT alone, so a human could write this exact subject, quote the
   * footer token while explaining a past break — the precise thing that caused
   * 2.0.0 — and be skipped. Identity is what closes it.
   */
  it("does NOT skip a human writing the same subject", () => {
    assert.equal(
      isGeneratedReleaseCommit("chore(release): cli-kit 9.9.9 [skip ci]", "human@example.com"),
      false,
    );
  });

  it("does not skip when the author is unknown", () => {
    assert.equal(isGeneratedReleaseCommit("chore(release): x 1.0.0 [skip ci]", undefined), false);
    assert.equal(isGeneratedReleaseCommit("chore(release): x 1.0.0 [skip ci]", ""), false);
  });

  it("still requires both subject markers, so a bot identity alone is not enough", () => {
    // Keeps the check failing CLOSED if the bot identity ever changes.
    assert.equal(isGeneratedReleaseCommit("chore(release): no skip marker", BOT), false);
    assert.equal(isGeneratedReleaseCommit("docs: something [skip ci]", BOT), false);
  });
});

describe("splitCommitRecords", () => {
  const rec = (email, msg) => `${email}\x1f${msg}`;

  it("splits records on NUL and the author off on US", () => {
    assert.deepEqual(splitCommitRecords(`${rec("a@x", "first")}\0${rec("b@y", "second")}\0`), [
      { authorEmail: "a@x", message: "first" },
      { authorEmail: "b@y", message: "second" },
    ]);
  });

  it("keeps blank lines inside a message intact", () => {
    // Why NUL and US: bodies contain blank lines and arbitrary prose, so any
    // printable delimiter can occur inside a message.
    const [only] = splitCommitRecords(rec("a@x", "subject\n\nbody line\n\nmore"));
    assert.equal(only.message, "subject\n\nbody line\n\nmore");
    assert.equal(only.authorEmail, "a@x");
  });

  it("does not mistake a US byte inside the body for the separator", () => {
    const [only] = splitCommitRecords(rec("a@x", "subject\n\nbody with \x1f in it"));
    assert.equal(only.authorEmail, "a@x");
    assert.equal(only.message, "subject\n\nbody with \x1f in it");
  });

  it("returns nothing for empty git output", () => {
    assert.deepEqual(splitCommitRecords(""), []);
    assert.deepEqual(splitCommitRecords("\0\0"), []);
  });
});
