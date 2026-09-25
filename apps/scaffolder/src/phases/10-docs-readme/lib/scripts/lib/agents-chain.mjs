/**
 * AGENTS.md chain budget.
 *
 * Codex concatenates one instruction file per directory, from the project root
 * down to the directory it runs in, against ONE combined budget:
 * `project_doc_max_bytes`, 32,768 bytes by default (codex-rs agents_md.rs). It
 * drops whatever is past that without telling the model. So the unit that
 * matters is the chain, not the file.
 *
 * Selection mirrors Codex, and the shared checker `check-instruction-chain`
 * (harness-engineering skill), whose pinned cases scripts/agents-chain.test.mjs
 * repeats:
 *   - per directory, the first EXISTING of AGENTS.override.md, AGENTS.md;
 *   - a whitespace-only winner contributes nothing and still hides the file
 *     beside it (Codex does not fall through);
 *   - a missing or dangling winner is skipped, and the next name is tried;
 *   - a symlink counts its target's bytes, every time it appears;
 *   - only TRACKED files count (`git ls-files`), because that is what a clone
 *     has. A tree with none tracked — a generated repo before its first
 *     `git add` — reports that nothing was checked; outside git it fails.
 *
 * `checkAgentsChains` fails any chain over CHAIN_BUDGET_BYTES, which sits below
 * Codex's cap on purpose: a chain at the cap has no room for the next rule, and
 * the failure is silent. Node builtins only.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";

export const CODEX_PROJECT_DOC_MAX_BYTES = 32768;
export const CHAIN_BUDGET_BYTES = 28000;
export const INSTRUCTION_NAMES = ["AGENTS.override.md", "AGENTS.md"];

/**
 * Tracked instruction files under `root`, as POSIX paths relative to it, or
 * undefined when `root` is not in a git work tree. Inherited GIT_* variables
 * are dropped so a hook's GIT_DIR cannot point the listing at another repo.
 */
export function listTrackedInstructionFiles(root) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  );
  const git = spawnSync("git", ["ls-files", "-z", "--cached"], {
    cwd: root,
    env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (git.error || git.status !== 0) return undefined;
  return git.stdout
    .split("\0")
    .filter((p) => INSTRUCTION_NAMES.includes(posix.basename(p)))
    .sort();
}

/**
 * The winning file per directory.
 *
 * @param {string[]} paths tracked instruction files, POSIX, relative to the root
 * @param {(path: string) => { bytes: number, blank: boolean } | undefined} read
 *   size and whitespace-only-ness of one path, following symlinks; undefined
 *   when it is missing or a dangling link
 * @returns {{ chosen: Map<string, { path: string, bytes: number }>, notes: string[] }}
 */
export function chooseInstructionFiles(paths, read) {
  const byDir = new Map();
  for (const path of paths) {
    const dir = posix.dirname(path) === "." ? "" : posix.dirname(path);
    if (!byDir.has(dir)) byDir.set(dir, new Set());
    byDir.get(dir).add(posix.basename(path));
  }
  const chosen = new Map();
  const notes = [];
  for (const [dir, present] of byDir) {
    for (const [index, name] of INSTRUCTION_NAMES.entries()) {
      if (!present.has(name)) continue;
      const path = dir ? `${dir}/${name}` : name;
      const file = read(path);
      if (!file) {
        notes.push(`${path}: tracked but missing or a dangling link; Codex skips to the next name`);
        continue;
      }
      if (file.blank) {
        const hidden = INSTRUCTION_NAMES.slice(index + 1).filter((n) => present.has(n));
        notes.push(
          `${path}: whitespace-only, so Codex loads nothing here` +
            (hidden.length ? ` and never reads ${hidden.join(", ")}` : ""),
        );
        chosen.set(dir, { path, bytes: 0 });
      } else {
        chosen.set(dir, { path, bytes: file.bytes });
      }
      break;
    }
  }
  return { chosen, notes };
}

function ancestors(dir) {
  const out = [""];
  if (!dir) return out;
  const segments = dir.split("/");
  for (let i = 1; i <= segments.length; i++) out.push(segments.slice(0, i).join("/"));
  return out;
}

/**
 * One chain per directory whose winner has content: that file plus every
 * ancestor directory's winner, root first. Largest first.
 *
 * @returns {{ leaf: string, files: { path: string, bytes: number }[], bytes: number }[]}
 */
export function instructionChains(chosen) {
  const rows = [];
  for (const [dir, winner] of chosen) {
    if (winner.bytes === 0) continue; // its chain is its parent's
    const files = ancestors(dir)
      .map((a) => chosen.get(a))
      .filter((f) => f !== undefined && f.bytes > 0);
    rows.push({ leaf: winner.path, files, bytes: files.reduce((sum, f) => sum + f.bytes, 0) });
  }
  return rows.sort((a, b) => b.bytes - a.bytes || a.leaf.localeCompare(b.leaf));
}

function readerFor(root) {
  return (path) => {
    const full = join(root, path);
    try {
      const stat = statSync(full); // follows symlinks, as Codex does
      if (!stat.isFile()) return undefined;
      return { bytes: stat.size, blank: readFileSync(full, "utf8").trim() === "" };
    } catch {
      return undefined;
    }
  };
}

/**
 * Check every chain under `root`. `projectRoots` lists sub-directories that are
 * ALSO a project root of their own (a generated repo committed as a snapshot):
 * their chains are measured again starting there.
 *
 * @returns {{ chains: { root: string, leaf: string, files: string[], bytes: number }[],
 *   failures: string[], notes: string[], tracked: number }}
 */
export function checkAgentsChains(root, { budget = CHAIN_BUDGET_BYTES, projectRoots = [] } = {}) {
  const all = listTrackedInstructionFiles(root);
  if (all === undefined) {
    return {
      chains: [],
      notes: [],
      tracked: 0,
      failures: [
        `AGENTS.md chain check: ${root} is not inside a git work tree, so there is no tracked set to measure\n` +
          "    Fix: run it from a git checkout (git init && git add -A for a freshly generated tree).",
      ],
    };
  }
  const views = [{ base: "", paths: all }];
  for (const sub of projectRoots) {
    const prefix = `${sub.replace(/\/+$/, "")}/`;
    const paths = all.filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length));
    if (paths.length > 0) views.push({ base: prefix.slice(0, -1), paths });
  }
  const chains = [];
  const failures = [];
  const notes = [];
  for (const { base, paths } of views) {
    const shown = (p) => (base ? `${base}/${p}` : p);
    const picked = chooseInstructionFiles(paths, readerFor(join(root, base)));
    if (!base) notes.push(...picked.notes);
    for (const chain of instructionChains(picked.chosen)) {
      const files = chain.files.map((f) => `${shown(f.path)} (${f.bytes})`);
      chains.push({
        root: base || ".",
        leaf: shown(chain.leaf),
        files: chain.files.map((f) => shown(f.path)),
        bytes: chain.bytes,
      });
      if (chain.bytes > budget) {
        failures.push(
          `AGENTS.md chain ${files.join(" + ")} is ${chain.bytes} B, over the ${budget} B budget ` +
            `(Codex truncates past ${CODEX_PROJECT_DOC_MAX_BYTES} B without saying so)\n` +
            "    Fix: make the root AGENTS.md a router — move rationale into the doc it belongs to and leave one line plus a link.",
        );
      }
    }
  }
  return { chains, failures, notes, tracked: all.length };
}

/** One summary line for a passing run. */
export function describeChains({ chains, tracked }) {
  if (tracked === 0) return "no tracked AGENTS.md: chain budget not checked (commit first)";
  const largest = chains[0] && chains.reduce((a, b) => (b.bytes > a.bytes ? b : a));
  return largest
    ? `${chains.length} AGENTS.md chain(s), largest ${largest.bytes} B (${largest.files.join(" + ")})`
    : `${chains.length} AGENTS.md chain(s)`;
}
