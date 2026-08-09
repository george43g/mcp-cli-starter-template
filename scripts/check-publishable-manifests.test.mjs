import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { rangeAdmits, UnmodelledRangeError } from "./lib/semver-range.mjs";

/**
 * Tests for the sibling-range check in check-publishable-manifests.mjs.
 *
 * This is the first test this script has ever had, which is why the gap below
 * survived: the original `satisfiesLoose` returned `true` for any clause its
 * one regex could not parse. That made the escape hatch indistinguishable from
 * a real match, so the honest range `>=0.1.1 <1` passed the check by opting
 * out of it. The "silently admits" block is the regression proof.
 */

/** [range, version, expected] */
const ADMITS = [
  // Caret on 0.x pins the MINOR — the behaviour the whole check exists for.
  ["^0.1.1", "0.1.1", true],
  ["^0.1.1", "0.1.9", true],
  ["^0.1.1", "0.2.0", false],
  ["^0.1.1", "1.0.0", false],
  // Caret on >=1.x pins the MAJOR.
  ["^1.2.0", "1.2.0", true],
  ["^1.2.0", "1.9.3", true],
  ["^1.2.0", "2.0.0", false],
  ["^1.2.0", "1.1.9", false],
  // Tilde pins the minor at every major.
  ["~0.1.1", "0.1.9", true],
  ["~0.1.1", "0.2.0", false],
  ["~1.2.3", "1.2.9", true],
  ["~1.2.3", "1.3.0", false],
  // Exact.
  ["0.6.0", "0.6.0", true],
  ["0.6.0", "0.6.1", false],
  // OR chains — the shape the manifests carried before this fix.
  ["^0.1.1 || ^0.2.0", "0.2.3", true],
  ["^0.1.1 || ^0.2.0", "0.3.0", false],
  ["^0.1.1 || ^0.2.0 || ^0.3.0 || ^0.4.0 || ^0.5.0 || ^0.6.0", "0.6.0", true],
  ["^0.1.1 || ^0.2.0 || ^0.3.0 || ^0.4.0 || ^0.5.0 || ^0.6.0", "0.7.0", false],
  // Comparator ranges — the replacement for the ever-growing caret chain.
  [">=0.1.1 <1", "0.1.1", true],
  [">=0.1.1 <1", "0.6.0", true],
  [">=0.1.1 <1", "0.99.99", true],
  [">=0.1.1 <1", "0.1.0", false],
  // THE discrimination case: proves the range is modelled rather than waved
  // through. The pre-fix implementation returned `true` here.
  [">=0.1.1 <1", "1.0.0", false],
  // Bare comparators.
  [">=2.0.0", "1.0.0", false],
  [">=2.0.0", "2.1.0", true],
  ["<0.7.0", "0.6.0", true],
  ["<0.7.0", "0.7.0", false],
  // Hyphen and wildcard.
  ["0.1.1 - 0.6.0", "0.5.0", true],
  ["0.1.1 - 0.6.0", "0.6.1", false],
  ["*", "1.2.3", true],
];

describe("rangeAdmits", () => {
  for (const [range, version, expected] of ADMITS) {
    it(`${expected ? "admits" : "rejects"} ${version} for "${range}"`, () => {
      assert.equal(rangeAdmits(range, version), expected);
    });
  }

  it("throws on a range it cannot model, rather than admitting it", () => {
    // The pre-fix failure mode: an unparseable clause returned `true`, so the
    // check passed by not checking. Surfacing it is the point.
    assert.throws(() => rangeAdmits("not-a-range", "1.0.0"), UnmodelledRangeError);
  });
});

describe("the ranges this repo actually ships", () => {
  // Guards the manifests directly: robustness may reach any 0.x without a
  // manifest edit, but crossing to 1.0.0 must fail loudly and force a review.
  const SHIPPED = ">=0.1.1 <1";

  it("admits every 0.x robustness release, present and future", () => {
    for (const v of ["0.1.1", "0.2.0", "0.6.0", "0.7.0", "0.12.4"]) {
      assert.equal(rangeAdmits(SHIPPED, v), true, `should admit ${v}`);
    }
  });

  it("rejects 1.0.0 so a major bump cannot land unnoticed", () => {
    assert.equal(rangeAdmits(SHIPPED, "1.0.0"), false);
  });
});
