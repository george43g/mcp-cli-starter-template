import shared from "@george43g/vitest-config/vitest.shared";

// No overrides. This file used to re-declare `test.include` with exactly the
// preset's own value, which silently reverted the preset's `.tsx` support for
// this package the moment that was added. A local copy of a shared default is
// drift waiting to happen.
export default shared;
