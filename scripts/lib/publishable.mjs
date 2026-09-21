/**
 * The packages this repo actually publishes — ONE list, two consumers.
 *
 * `check-publishable-manifests.mjs` holds each of these to the publish-shape
 * rules; `pack-publishable.mjs` dry-run packs each of them in CI. The list used
 * to live inside the manifest checker, while CI hand-listed cli-kit and tui-kit
 * for the pack step — so robustness, secret-store and mcp-kit were manifest-
 * checked and never pack-checked, and nothing could notice (DEFERRED #52).
 * Two hand-maintained lists of the same set will diverge; one cannot.
 *
 * Each entry has a release job in .github/workflows/release-packages.yml and a
 * Trusted Publisher on npmjs.com.
 *
 * `private: true` is NOT the discriminator: apps/scaffolder and
 * apps/example-repo-mcp are deliberately non-private (CI pack-checks their
 * tarball shape) but are never published, so they are not held to these rules.
 *
 * META-REPO ONLY. A scaffolded repo publishes nothing out of `packages/` — it
 * consumes the kits from npm — so neither this module nor pack-publishable.mjs
 * is stamped into generated output. See phase 10's lib/scripts/.
 */
export const PUBLISHABLE = new Set([
  "packages/robustness",
  "packages/cli-kit",
  "packages/tui-kit",
  "packages/secret-store",
  "packages/mcp-kit",
  // apps/mcpsync was here until 2026-08-22. George decided it MIGRATES WITHOUT
  // PUBLISHING (DEFERRED #10), so it is `private: true` and carries no
  // publishConfig — it leaves as a private tool installed from a local path,
  // not as a registry dependency. It was never published (npm view returned
  // E404 throughout), so nothing on npm is orphaned by the change.
]);
