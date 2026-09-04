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
 * Their body is `${nextRelease.notes}`, which can quote the triggering commit's
 * footer — so a genuine breaking release could produce a bump commit containing
 * the token without declaring anything.
 *
 * Skipping is keyed on the AUTHOR, not on the message. Message text is
 * attacker-and-accident-writable: a human can type any subject they like,
 * including this one. The life-stack session asked exactly that — "does quoting
 * inside a `chore(release):` subject become the new hole?" — and it did, because
 * the first version of this matched on the subject alone. It is a narrow hole (a
 * non-HEAD commit in a multi-commit push, since `[skip ci]` on the head commit
 * stops the workflow entirely) but a real one.
 *
 * Identity closes it: only semantic-release-bot's own commits are skipped, and
 * nothing a human writes can impersonate that without commit-author control.
 *
 * All three conditions are required, and the subject markers are kept as a
 * second signal so a future change of bot identity fails CLOSED (checking a
 * commit that could have been skipped) rather than open.
 *
 * Worth knowing: no bump commit in this repo's history has ever contained the
 * token, because conventional-changelog's heading is the PLURAL "BREAKING
 * CHANGES" and the regex above ends in `\b`. So this skip is belt-and-braces,
 * not load-bearing — which is the right posture for a bypass.
 */
const GENERATED_BUMP = /^chore\(release\):.*\[skip ci\]/;

/** semantic-release's committer identity, verified against this repo's tags. */
export const RELEASE_BOT_EMAIL = "semantic-release-bot@martynus.net";

/**
 * @param {string} subject first line of the commit message
 * @param {string | undefined} authorEmail commit author email (`%ae`)
 */
export function isGeneratedReleaseCommit(subject, authorEmail) {
  return authorEmail === RELEASE_BOT_EMAIL && GENERATED_BUMP.test(subject);
}

/**
 * Split `git log --format=%ae%x1f%B%x00` output into commit records.
 *
 * NUL separates records and US (0x1f) separates the author email from the
 * body. Both are chosen because a commit body contains blank lines and
 * arbitrary prose, so any printable delimiter can occur inside one.
 *
 * @param {string} raw
 * @returns {Array<{ authorEmail: string, message: string }>}
 */
export function splitCommitRecords(raw) {
  return raw
    .split("\0")
    .map((record) => {
      const sep = record.indexOf("");
      if (sep === -1) return { authorEmail: "", message: record.trim() };
      return {
        authorEmail: record.slice(0, sep).trim(),
        message: record.slice(sep + 1).trim(),
      };
    })
    .filter((r) => r.message.length > 0);
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
