/**
 * Does a dependency range admit a given version?
 *
 * Split out of check-publishable-manifests.mjs so it can be tested without
 * running the check (that script executes on import).
 *
 * This used to be a hand-rolled `satisfiesLoose` matching a single regex,
 * `/^([\^~]?)(\d+)\.(\d+)/`, with `if (!m) return true` for anything it could
 * not parse. That escape hatch was indistinguishable from a real match, and it
 * had two holes:
 *
 *   1. Every comparator range was waved through. `>=0.1.1 <1` "passed" without
 *      being evaluated — so the honest replacement for an ever-growing caret
 *      chain silently disabled the check it was meant to satisfy.
 *   2. The caret branch ignored the range's LOWER bound. `^1.2.0` compared only
 *      the major, so it admitted `1.1.9` — a version it excludes.
 *
 * Both are the same class of defect: a checker that reports success when it has
 * not checked. Hand-rolling the full desugar (carets, tildes, comparators,
 * hyphen ranges, partials, wildcards) is ~120 lines of exactly the logic that
 * develops quiet bugs, so this delegates to `semver` instead. It is a root
 * devDependency used by a CI script — nothing here ships in any tarball, so the
 * no-dependency rule for published packages is untouched.
 */

import semver from "semver";

/** A range string `semver` cannot parse. Surfaced, never treated as a match. */
export class UnmodelledRangeError extends Error {
  constructor(range) {
    super(
      `not a valid semver range: ${JSON.stringify(range)}. ` +
        `Rewrite it as semver, or skip this specifier at the call site — do not ` +
        `let it default to "admitted", which is the bug this replaced.`,
    );
    this.name = "UnmodelledRangeError";
    this.range = range;
  }
}

/**
 * @param {string} range   e.g. "^0.1.1 || ^0.2.0", ">=0.1.1 <1"
 * @param {string} version e.g. "0.6.0"
 * @returns {boolean}
 * @throws {UnmodelledRangeError} if `range` is not a valid semver range.
 */
export function rangeAdmits(range, version) {
  if (semver.validRange(range) === null) throw new UnmodelledRangeError(range);
  return semver.satisfies(version, range);
}
