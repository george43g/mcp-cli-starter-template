import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkReleaseTokens } from "./lib/release-tokens.mjs";

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
});
