/**
 * 10-docs-readme/m1-docs-readme — port docs/ + README.md + LICENSE + llms-install.md.
 *
 * Lays down the full documentation scaffold the user will customize:
 *   - docs/ — Mintlify config (docs.json) + MDX pages (introduction,
 *     installation, quickstart, surfaces/*, internals/*) + the canonical
 *     markdown reference (ARCHITECTURE.md, HTTP_MODE.md, RUST_ACCELERATION.md,
 *     TUI_DESIGN.md, GUARDRAILS_MCP_RESPONSES.md, RELEASE.md).
 *   - README.md — public-style: a CI badge for the target's own GitHub remote
 *     (a comment when there is none), hero-GIF slots left as comments until
 *     the screenshots workflow renders them, local-install first and npm
 *     installs marked "once published", one-click JSON snippets, tools table.
 *   - LICENSE — MIT.
 *   - llms-install.md — user-facing setup guide for end users of cloned tools.
 *   - scripts/ — the repo guards the generated CI actually invokes:
 *     check-docs-links.mjs, check-stdout-purity.mjs,
 *     check-release-tokens.mjs (+ its scripts/lib/release-tokens.mjs), and
 *     for-each-mcp-app.mjs + mcp-apps.mjs (+ their scripts/lib/mcp-apps.mjs),
 *     which the generated ci.yml uses to select apps for its usage, pack and
 *     stress gates. A workflow that runs a script this phase does not stamp is
 *     a guard the generated repo cannot run; release-tokens was exactly that
 *     until 2026-09-04.
 *     NOT stamped: pack-publishable.mjs — a scaffolded repo publishes nothing
 *     out of packages/, so it has no publishable set to pack.
 *
 * All `example-repo` placeholders are substituted at write time by portPackage.
 */

import { realpathSync } from "node:fs";
import { githubSlug } from "../../core/git.js";
import { Migration, type MigrationContext, type MigrationResult } from "../../core/migration.js";
import { portPackage } from "../../core/package-port.js";

/** README placeholder for the target's own `owner/repo`. */
export const GITHUB_SLUG_TOKEN = "__GITHUB_SLUG__";

/**
 * The target's GitHub `owner/repo`, from its `origin` remote — but only when
 * the target IS the repository root. A target nested in another checkout (the
 * committed example/ inside this repo, a scratch dir inside a monorepo) would
 * otherwise inherit the parent's remote and badge the wrong project's CI.
 */
async function targetGithubSlug(ctx: MigrationContext): Promise<string | undefined> {
  const root = await ctx.git.root();
  if (!root) return undefined;
  try {
    // `.native`: on Windows git reports the long path while a temp cwd can be
    // an 8.3 short name (RUNNER~1); only the native realpath expands both.
    if (realpathSync.native(root) !== realpathSync.native(ctx.cwd)) return undefined;
  } catch {
    return undefined;
  }
  return githubSlug(await ctx.git.remoteUrl("origin"));
}

export default class DocsReadmeMigration extends Migration {
  readonly id = "10-docs-readme/m1-docs-readme";
  readonly title = "Port docs/ (Mintlify + reference markdown) + README + LICENSE";
  readonly appliesTo = "both" as const;

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    const slug = await targetGithubSlug(ctx);
    return portPackage(ctx, {
      // pkgDir "." — lib files land directly at the repo root.
      pkgDir: ".",
      libPrefix: "10-docs-readme/lib/",
      // The README's CI badge points at the target's own workflow when its
      // remote is known, and is left as a comment when it is not — never at
      // the template repo's CI, which is what every generated README showed.
      flags: { "github-remote": slug !== undefined },
      transform: (path, content) =>
        path === "README.md" && slug ? content.replaceAll(GITHUB_SLUG_TOKEN, slug) : content,
    });
  }
}
