/**
 * AGENTS.md chain budget.
 *
 * Codex concatenates every AGENTS.md from the project root down to the
 * directory it runs in, against ONE combined budget — `project_doc_max_bytes`,
 * 32,768 bytes by default (codex-rs agents_md.rs) — and drops whatever is past
 * it without telling the model. So the unit that matters is the chain, not the
 * file: a 15 KB root guide and a 15 KB app guide are each fine and together
 * lose the app guide's tail.
 *
 * `checkAgentsChains` sums every root-to-leaf chain and fails any over
 * CHAIN_BUDGET_BYTES, which sits below Codex's cap on purpose: a chain at the
 * cap has no room for the next rule anyone adds, and the failure mode is
 * silent. Node builtins only.
 */

import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, posix } from "node:path";

export const CODEX_PROJECT_DOC_MAX_BYTES = 32768;
export const CHAIN_BUDGET_BYTES = 28000;

/** Codex joins the files it concatenates with a blank line. */
const JOINER_BYTES = 2;

const WALK_SKIP = new Set(["node_modules", ".git", "dist", ".turbo", "coverage"]);

function walkAgentsFiles(root, rel = "", acc = []) {
  for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
    const path = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory() && !WALK_SKIP.has(entry.name)) walkAgentsFiles(root, path, acc);
    else if (entry.isFile() && entry.name === "AGENTS.md") acc.push(path);
  }
  return acc;
}

/**
 * Repo-relative POSIX paths of every AGENTS.md git would ship (tracked plus
 * untracked-but-not-ignored). Falls back to a filesystem walk outside git, so
 * a freshly generated tree is checked before its first commit.
 */
export function listAgentsFiles(root) {
  const git = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (git.status !== 0 || git.error) return walkAgentsFiles(root).sort();
  return [
    ...new Set(git.stdout.split("\0").filter((p) => p === "AGENTS.md" || p.endsWith("/AGENTS.md"))),
  ].sort();
}

/**
 * Every root-to-leaf chain for a set of AGENTS.md paths.
 *
 * @param {string[]} paths repo-relative POSIX paths of AGENTS.md files
 * @param {(path: string) => number} sizeOf byte size of one of those paths
 * @returns {{ leaf: string, files: string[], bytes: number }[]}
 */
export function agentsChains(paths, sizeOf) {
  const present = new Set(paths);
  return paths.map((leaf) => {
    const dir = posix.dirname(leaf);
    const segments = dir === "." ? [] : dir.split("/");
    const files = [];
    for (let i = 0; i <= segments.length; i++) {
      const candidate = [...segments.slice(0, i), "AGENTS.md"].join("/");
      if (present.has(candidate)) files.push(candidate);
    }
    const bytes =
      files.reduce((sum, file) => sum + sizeOf(file), 0) +
      JOINER_BYTES * Math.max(0, files.length - 1);
    return { leaf, files, bytes };
  });
}

/**
 * Check every chain under `root`. `projectRoots` lists sub-directories that are
 * ALSO a project root of their own (e.g. a generated repo committed as a
 * snapshot): their chains are measured again starting there.
 *
 * @returns {{ chains: { root: string, leaf: string, files: string[], bytes: number }[], failures: string[] }}
 */
export function checkAgentsChains(root, { budget = CHAIN_BUDGET_BYTES, projectRoots = [] } = {}) {
  const all = listAgentsFiles(root);
  const sizeOf = (base) => (path) => statSync(join(root, base, path)).size;
  const views = [{ base: "", paths: all }];
  for (const sub of projectRoots) {
    const prefix = `${sub.replace(/\/+$/, "")}/`;
    const paths = all.filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length));
    if (paths.length > 0) views.push({ base: prefix.slice(0, -1), paths });
  }
  const chains = [];
  const failures = [];
  for (const { base, paths } of views) {
    for (const chain of agentsChains(paths, sizeOf(base))) {
      const shown = {
        root: base || ".",
        leaf: chain.leaf,
        files: chain.files.map((f) => (base ? `${base}/${f}` : f)),
        bytes: chain.bytes,
      };
      chains.push(shown);
      if (chain.bytes > budget) {
        failures.push(
          `AGENTS.md chain ${shown.files.join(" + ")} is ${chain.bytes} B, over the ${budget} B budget ` +
            `(Codex truncates past ${CODEX_PROJECT_DOC_MAX_BYTES} B without saying so)\n` +
            "    Fix: make the root AGENTS.md a router — move rationale into the doc it belongs to and leave one line plus a link.",
        );
      }
    }
  }
  return { chains, failures };
}
