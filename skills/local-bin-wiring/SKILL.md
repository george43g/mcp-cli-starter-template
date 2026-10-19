---
name: local-bin-wiring
description: Wire a local CLI or MCP stdio server through one zsh launch wrapper so argv, cwd, and stdout stay intact. Use when adding a bin entry, an MCP command, a dev symlink, pnpm or npm start, mise run, or when deciding whether to bundle Node, Bun, or an MCPB plugin.
metadata:
  owner: mcp-starter-template
  origin: fleet
---

# Local bin wiring

One entry point for humans and machines: a repo `bin/` symlink to a zsh wrapper that `exec`s the runtime. The layers compose. They are not alternatives.

Checked before writing this, 2026-10-20: `cli-convention` already places a typed tool on PATH via a committed `bin/` symlink and `shell/.zshenv`. life-stack `scripts/check-harness.mjs` already fails a dangling or non-relative `bin/` link. `g-agent-skills/external.conf` plus `link-skills` already symlinks a tool-owned skill into the global stores, and dotfiles `make install` calls that linker. MCPB already ships a Node runtime inside Claude for macOS and Windows plugin bundles. None of those state the argv, cwd, or stdout rules below, so this skill is the missing layer, not a second linker.

Evidence is Research Nerd, 2026-10-20, Linux x86_64. macOS `env -S`, `readlink -f`, and Gatekeeper on a copied Node were not tested. Where this file and that note disagree, re-measure before changing the rule.

## What to copy

Copy [examples/launch-wrapper.zsh](examples/launch-wrapper.zsh) to `apps/<name>/bin/<tool>`.

```zsh
#!/bin/zsh -f
export TOOL_CALLER_CWD=$PWD
cd -- "${0:A:h:h}" || exit 70
exec node --import tsx ./main.ts "$@"
```

- `-f` skips rc files, so a startup print cannot land on stdout.
- `${0:A}` follows the `bin/` symlink to the real file. `${0:A:h:h}` is the app directory when the wrapper lives in `apps/<name>/bin/`.
- `exec` keeps one process. A `pnpm` → `sh` → `tsx` → `node` chain leaves children running after SIGTERM.
- The program resolves user paths against `TOOL_CALLER_CWD`, and falls back to `process.cwd()` only when that variable is unset.
- When the caller has no `node` (GUI, launchd, cron), use [examples/launch-wrapper-mise.zsh](examples/launch-wrapper-mise.zsh). It `exec`s mise by absolute path after the `cd`, so the app's `mise.toml` selects the Node version.

Then, for a tool a human types on a dev machine:

```sh
ln -sfn ../apps/<name>/bin/<tool> bin/<tool>
```

Commit that relative symlink. `cli-convention` owns the PATH and man-page rules. A link in `bin/` is the claim that someone types the name, so the tool ships a usage spec, `--help`, a man page, and completions, or a written decline. This example file is `exempt` because it is not itself on PATH.

Machines do not use PATH. An MCP `command`, launchd, cron, or a hook uses the absolute path of the wrapper.

## argv

The wrapper and a package `bin` shim both end in `exec … "$@"`. They do not eat flags. The runner in front of them does.

| Entry | What happens |
|---|---|
| wrapper, `node file`, `pnpm exec`, direct shim | argv intact |
| `npm start` / `npm run` | `--dry-run` and `--help` are npm's own flags unless they sit after `--` |
| `pnpm start` / `pnpm run` | a `--` you type is forwarded, and the program then treats everything after it as positional |
| `mise run` | eats `--help`, and eats the first `--` even with `raw_args` |
| `mise exec --` | argv intact |
| alias or function | absent in MCP, launchd, and `zsh -c` |

`pnpm start -- off --dry-run kitchen` and `npm start off --dry-run kitchen` are the two destructive forms. Each is safe on the other package manager. Do not use either as the entry point.

A package `bin` key does not install a shim inside its own package. pnpm writes the shim into dependents' `node_modules/.bin` or a global link. Treat `bin` as package metadata. In-repo invocation is the wrapper.

## MCP stdio

The reference SDK client spawns with `shell: false` and, on POSIX, passes only `HOME`, `LOGNAME`, `PATH`, `SHELL`, `TERM`, and `USER`. Put anything else in the client's `env`.

Safe `command` for a checkout: the absolute path of the wrapper. `args` is an array. Do not put `npm`, `pnpm`, `npx`, or `mise run` in front.

- A bare name fails when the client PATH is not the zsh PATH.
- A relative script fails because the client cwd may be `/` or `$HOME`.
- `node --import tsx` still resolves `tsx` from the client cwd. The wrapper's `cd` runs first, so the app directory is the one that resolves it.
- `pnpm` and `npm` banners go to stdout. The MCP transport allows only JSON-RPC there. `mise run`'s banner goes to stderr.
- pnpm 11 can run an install before the script and write that log to stdout.

## Dev symlink and a public install

A dev machine tracks the checkout. The committed relative symlink is the tracker. Repair is `ln -sfn` back to that target, then the repo's existing `bin/` check. life-stack's harness is that check. Do not add another linker, and do not put skill directories into `mappings.conf`.

Someone who rarely updates does not get a symlink to a git HEAD. They get a versioned install: a published package, or an MCPB plugin when Claude's built-in Node is the runtime they need. A set-and-forget symlink may point at that installed prefix. It does not point at a working tree.

## Global skill link

This skill stays in this repo at `skills/local-bin-wiring/`. The owning agent edits it here. g-agent-skills does not get a copy.

The global symlink is one row in `g-agent-skills/external.conf`. `link-skills` points `~/.agents/skills/local-bin-wiring` and `~/.claude/skills/local-bin-wiring` at this directory. Dotfiles `make install` runs that linker. `mappings.conf` does not list skills.

After this directory is on `main`, the row to add there is:

```text
mcp-cli-starter-template/skills/local-bin-wiring | launch wrapper and argv-safe local bin wiring; skill stays in this repo
```

Do not rename or move this directory after that row exists. The link is the path.

## Production

Bundling a runtime, MCPB, Bun, and a public HTTP install are in [PRODUCTION.md](PRODUCTION.md). A tool that runs from its own checkout does not get a bundled Node or Bun.

## Do not

- Do not use `pnpm start`, `npm start`, an alias, or `mise run` as the MCP command or the PATH entry.
- Do not `console.log` from the wrapper or from anything it execs before the server speaks MCP.
- Do not bundle a second Node or Bun for a checkout tool. The conditions that would change that are in PRODUCTION.md.
- Do not copy this skill into `g-agent-skills/skills/`.
