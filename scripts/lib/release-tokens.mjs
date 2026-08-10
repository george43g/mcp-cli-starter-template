/**
 * Guard against release-control tokens appearing in commit-message PROSE.
 *
 * `@semantic-release/commit-analyzer` treats `BREAKING CHANGE` anywhere in a
 * commit body as a breaking-change footer and bumps the MAJOR. It does not
 * care that the sentence around it is describing a past incident rather than
 * declaring one.
 *
 * That is not hypothetical. A `docs:` commit whose body read
 *
 *     ... so the `!` marker and BREAKING CHANGE footer took it past 0.x.
 *
 * published `@george43g/cli-kit@2.0.0` — a major whose `dist/` was
 * byte-identical to 1.0.0. It was the second unplanned major in one session;
 * the first came from a genuine `!` whose consequence had not been checked.
 *
 * Rule: the token may appear ONLY when the subject line also carries `!`. That
 * makes a real breaking change state its intent twice, and makes an accidental
 * one impossible to express. To write ABOUT the token, lowercase it or hyphenate
 * it — "breaking change", "BREAKING-CHANGE marker" in backticks is still caught,
 * so prefer prose that does not spell it.
 */

/** The exact tokens conventional-changelog treats as a breaking-change footer. */
const BREAKING_TOKEN = /\bBREAKING[ -]CHANGE\b/;

/**
 * semantic-release's own bump commits, e.g.
 *
 *     chore(release): cli-kit 1.0.0 [skip ci]
 *
 * Their body is `${nextRelease.notes}`, which quotes the triggering commit's
 * footer — so a genuine breaking release produces a bump commit that contains
 * the token without declaring anything. Two independent reasons they are safe
 * to skip: they carry `[skip ci]` so they never trigger the release workflow,
 * and they are written by the machine AFTER the release decision was made.
 *
 * Both markers are required. A hand-written `chore(release):` subject without
 * `[skip ci]` is NOT skipped — that would be a trivial bypass.
 */
const GENERATED_BUMP = /^chore\(release\):.*\[skip ci\]/;

export function isGeneratedReleaseCommit(subject) {
  return GENERATED_BUMP.test(subject);
}

/**
 * Split `git log --format=%B%x00` output into individual commit messages.
 *
 * NUL is the only separator safe here: commit bodies contain blank lines and
 * arbitrary prose, so any textual delimiter can appear inside a message.
 *
 * @param {string} raw
 * @returns {string[]}
 */
export function splitCommitMessages(raw) {
  return raw
    .split("\0")
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
}

/** `type(scope)!:` or `type!:` — the other way to declare a breaking change. */
const SUBJECT_BANG = /^[a-z]+(\([^)]*\))?!:/;

/**
 * @param {string} message full commit message (subject + body)
 * @returns {{ ok: boolean, reason?: string }}
 */
export function checkReleaseTokens(message) {
  const lines = message.split("\n");
  const subject = lines[0] ?? "";
  const body = lines.slice(1).join("\n");

  const declaresBang = SUBJECT_BANG.test(subject);
  const bodyHasToken = BREAKING_TOKEN.test(body);
  const subjectHasToken = BREAKING_TOKEN.test(subject);

  if ((bodyHasToken || subjectHasToken) && !declaresBang) {
    return {
      ok: false,
      reason:
        'the text "BREAKING CHANGE" appears without a "!" in the subject line.\n' +
        "    semantic-release reads that token ANYWHERE in the body as a breaking-change\n" +
        "    footer and cuts a MAJOR — it does not care that the sentence is describing\n" +
        "    an incident rather than declaring one. A docs: commit published cli-kit\n" +
        "    2.0.0 this way, with a dist/ byte-identical to 1.0.0.\n" +
        "    Fix: if you MEAN a breaking change, mark the subject `type(scope)!:` too.\n" +
        "    If you are writing about the token, do not spell it — say `a breaking\n" +
        "    change` in lowercase.",
    };
  }

  if (declaresBang && !bodyHasToken && !subjectHasToken) {
    return {
      ok: false,
      reason:
        'the subject declares "!" but no "BREAKING CHANGE:" footer explains it.\n' +
        "    A major bump should say what broke and how to migrate. Add the footer.",
    };
  }

  return { ok: true };
}
