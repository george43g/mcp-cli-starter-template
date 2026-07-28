---
name: cli-artifacts
description: Maintain a CLI usage specification and its generated help documentation, shell completions, and manpage. Use when adding or renaming CLI commands, changing flags or arguments, fixing usage artifact drift, moving CLI tooling between workspace packages, or removing the scaffolded MCP app while retaining a CLI.
---

# Maintain CLI artifacts

Treat the usage specification as the source of truth and generated files as a
committed, byte-checked interface.

## Update the current CLI

1. Find the package containing `.usage.kdl`, its `bin` entry, and the real CLI
   command tree. Confirm all three names agree.
2. Change the CLI implementation and `.usage.kdl` together.
3. Run `mise install` if the pinned `usage(1)` tool is unavailable.
4. Run `pnpm artifacts` in the CLI package.
5. Run `pnpm check:usage`.
6. Review and commit `.usage.kdl`, `completions/`, `man/`, and `docs/cli/`
   together.

Do not hand-edit generated artifacts. Keep the `usage` version pinned in the
package's `mise.toml`; generator upgrades require an intentional full
regeneration.

## Retain this system without the MCP app

The artifact pipeline is CLI-specific, not MCP-specific. Before deleting or
replacing `apps/<name>-mcp/`, move these files into the surviving CLI package:

- `.usage.kdl`
- the `docs:cli`, `completions`, `manpage`, `artifacts`, and `check:usage`
  package scripts
- the matching `mise.toml` tasks and pinned `usage` tool
- `scripts/check-usage-freshness.mjs`
- `scripts/install-completions.sh`
- `completions/`, `man/`, and `docs/cli/`

Then update the spec's `name` and `bin`, artifact filenames, package `bin`
mapping, workspace CI filter, and package tarball `files` list. Regenerate and
run the actual CLI `--help` before removing the old package.

## Add the system to another CLI package

Copy the files above from an existing generated CLI package, replace its bin
name, and reduce `.usage.kdl` to the new command surface. Preserve the
byte-comparison check instead of relying only on a successful generator exit.

If a project does not use mise, keep the same pinned `usage(1)` version in its
chosen tool manager and expose equivalent `artifacts` and `check:usage` scripts.
