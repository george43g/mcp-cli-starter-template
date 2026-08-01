/**
 * Golden-output drift test.
 *
 * The scaffolder's `src/phases/*\/lib\/**` directories hold verbatim copies
 * of the canonical sources under `apps/example-repo-mcp/`, `apps/rust-accel/`,
 * `packages/*`, `docs/`, `.github/`, etc. If someone edits a canonical file
 * without updating the corresponding lib/ copy (or vice versa), the
 * scaffolder will silently emit stale output. This test catches that drift.
 *
 * Mechanism: for every file in lib/, compute the canonical source path via
 * the LIB_TO_CANONICAL mapping, read both, byte-compare. Files in canonical
 * that have no lib/ counterpart (new files) are also flagged.
 *
 * Substitution note: lib/ preserves `example-repo` and `@george43g` placeholders
 * (the scaffolder substitutes them at write time, not at copy time). The
 * canonical also has these placeholders. So byte equality should hold
 * directly — no reverse-substitution needed.
 */

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCAFFOLDER_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(SCAFFOLDER_ROOT, "../..");
const PHASES_DIR = resolve(SCAFFOLDER_ROOT, "src/phases");

/**
 * Per-phase lib/ → canonical path mapping. Each entry is:
 *   [<phase>/<lib-relative-path>, canonical-path-from-repo-root]
 *
 * The lib path is matched as a prefix; everything below it inherits the
 * canonical prefix in the same nested layout.
 *
 * If you ADD a new phase that ships verbatim source, append a mapping here.
 */
const LIB_TO_CANONICAL: ReadonlyArray<readonly [string, string]> = [
  ["04-robustness/lib", "packages/robustness"],
  ["05-utility-pkgs/lib/env-loader", "packages/env-loader"],
  ["05-utility-pkgs/lib/secrets", "packages/secrets"],
  ["05-utility-pkgs/lib/cli-kit", "packages/cli-kit"],
  ["05-utility-pkgs/lib/tui-kit", "packages/tui-kit"],
  ["06-mcp-kit/lib", "packages/mcp-kit"],
  ["07-shared-types/lib", "packages/shared-types"],
  ["08-app/lib", "apps/example-repo-mcp"],
  ["09-rust-accel/lib", "apps/rust-accel"],
  ["10-docs-readme/lib/docs", "docs"],
  // 10-docs-readme/lib/README.md is the CLONED-TOOL's README (with example-repo
  // placeholders). The repo root's README.md describes the scaffolder itself
  // — different content by design. Exempt from byte-equality check; see
  // EXEMPT_PATHS below.
  ["10-docs-readme/lib/LICENSE", "LICENSE"],
  ["10-docs-readme/lib/llms-install.md", "llms-install.md"],
  ["11-agent-files/lib", "."],
  // Consumer CI intentionally omits the two meta-repo-only scaffolder drift steps.
  ["12-ci-release/lib/.github/workflows/ci.yml", "example/.github/workflows/ci.yml"],
  ["12-ci-release/lib", "."],
];

/**
 * Lib paths (relative to PHASES_DIR) that are KNOWN to diverge from their
 * canonical sibling — usually because the lib version is a template for
 * the cloned tool, while the canonical is the scaffolder repo's own.
 *
 * Adding entries here should always come with a comment justifying why.
 */
const EXEMPT_LIB_PATHS: ReadonlySet<string> = new Set([
  // Source-mode package guidance differs from the public npm package README.
  "04-robustness/lib/README.md",
  // Root README — see LIB_TO_CANONICAL comment.
  "10-docs-readme/lib/README.md",
  // Harness onboarding docs + guardrail. These are CLONED-TOOL templates whose
  // meta-repo canonical siblings are this repo's own live/self-referential
  // files — different content by design. The generated index/state/handoff are
  // authored for a freshly scaffolded repo; check-docs-links.mjs is genericized
  // (no apps/scaffolder scan roots, no scaffolder-only symlink pair). HANDOFF.md
  // and scripts/ have no LIB_TO_CANONICAL mapping at all, so the exempt-first
  // skip is what keeps them from tripping "no entry covers this path". Lib↔
  // example consistency stays enforced by the separate example/ sync check.
  "10-docs-readme/lib/docs/README.md",
  "10-docs-readme/lib/docs/PROJECT_STATE.md",
  "10-docs-readme/lib/docs/plans/README.md",
  "10-docs-readme/lib/HANDOFF.md",
  "10-docs-readme/lib/scripts/check-docs-links.mjs",
  // AGENTS.md at the repo root describes the SCAFFOLDER (the meta-tool);
  // the lib copy is the CLONED-TOOL's agent guide with example-repo placeholders.
  // Different content by design.
  "11-agent-files/lib/AGENTS.md",
  // The meta-repo's MCP client configs follow the dotfiles convention
  // (.mcp.json is canonical; .cursor/mcp.json symlinks to it; opencode.json's
  // mcp key is rendered from it — see the root AGENTS.md "MCP servers"
  // section). The lib copies are the CLONED-TOOL's starter MCP config.
  // Different content by design.
  "11-agent-files/lib/.cursor/mcp.json",
  "11-agent-files/lib/opencode.json",
  // The meta-repo's readme-check.yml carries a scaffolder-specific exclusion
  // (`grep -v '/lib/'`) so that syncing a canonical change into its golden
  // lib/ mirror under apps/scaffolder/src/phases/*/lib/** doesn't trip the
  // "source changed but README didn't" gate. That exclusion is meaningless —
  // and mildly wrong (src/lib/ is legitimate source) — in a generated repo,
  // which has no lib/ mirrors, so the lib copy ships the standard check.
  // Different content by design.
  "12-ci-release/lib/.github/workflows/readme-check.yml",
]);

async function walkFiles(root: string, acc: string[] = []): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) await walkFiles(full, acc);
    else if (entry.isFile()) acc.push(full);
  }
  return acc;
}

/** Resolve a lib/ absolute path to its canonical absolute path. */
function libToCanonical(libAbs: string): string | undefined {
  const libRel = relative(PHASES_DIR, libAbs); // e.g. "08-app/lib/src/cli.ts"
  // Find the longest matching prefix in the table.
  let best: { libPrefix: string; canonical: string } | undefined;
  for (const [libPrefix, canonical] of LIB_TO_CANONICAL) {
    if (libRel === libPrefix || libRel.startsWith(`${libPrefix}/`)) {
      if (!best || libPrefix.length > best.libPrefix.length) {
        best = { libPrefix, canonical };
      }
    }
  }
  if (!best) return undefined;
  const tail = libRel === best.libPrefix ? "" : libRel.slice(best.libPrefix.length + 1);
  const canonicalRel =
    best.canonical === "." ? tail : tail ? `${best.canonical}/${tail}` : best.canonical;
  return resolve(REPO_ROOT, canonicalRel);
}

describe("golden-output drift", () => {
  it("every lib/ file matches its canonical source byte-for-byte", async () => {
    const allLibFiles = await walkFiles(PHASES_DIR);
    // Only files under *\/lib\/** count — phase index.ts and migration files are not lib.
    const libFiles = allLibFiles.filter((f) => {
      const rel = relative(PHASES_DIR, f);
      return /^\d{2}-[^/]+\/lib(\/|$)/.test(rel);
    });

    expect(libFiles.length).toBeGreaterThan(0); // sanity

    const mismatches: Array<{ lib: string; canonical: string; reason: string }> = [];

    for (const libAbs of libFiles) {
      const libRel = relative(PHASES_DIR, libAbs);
      if (EXEMPT_LIB_PATHS.has(libRel)) continue;
      const canonicalAbs = libToCanonical(libAbs);
      if (!canonicalAbs) {
        mismatches.push({
          lib: relative(REPO_ROOT, libAbs),
          canonical: "(no mapping)",
          reason: "no LIB_TO_CANONICAL entry covers this path",
        });
        continue;
      }
      if (!existsSync(canonicalAbs)) {
        mismatches.push({
          lib: relative(REPO_ROOT, libAbs),
          canonical: relative(REPO_ROOT, canonicalAbs),
          reason: "canonical file missing — was it deleted from the live tree?",
        });
        continue;
      }
      const [libBuf, canonicalBuf] = await Promise.all([readFile(libAbs), readFile(canonicalAbs)]);
      if (!libBuf.equals(canonicalBuf)) {
        mismatches.push({
          lib: relative(REPO_ROOT, libAbs),
          canonical: relative(REPO_ROOT, canonicalAbs),
          reason: `byte mismatch (lib ${libBuf.length}B vs canonical ${canonicalBuf.length}B)`,
        });
      }
    }

    if (mismatches.length > 0) {
      const detail = mismatches
        .map((m) => `  • ${m.lib}\n    ↔ ${m.canonical}\n    ${m.reason}`)
        .join("\n");
      throw new Error(
        `golden-output drift detected (${mismatches.length} mismatch(es)):\n${detail}\n\n` +
          `Fix: re-copy the canonical file into the matching lib/ path, OR update the canonical to match.\n` +
          `Run \`pnpm --filter @george43g/mcp-scaffold build:templates\` after fixing.`,
      );
    }
  });
});
