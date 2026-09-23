# Live dev-tool feedback for coding agents — handoff to dotfiles + executive

**Owner from here:** dotfiles (machine config and installs), with executive
coordinating and g-agent-skills likely drafting the skill text. George,
2026-09-24: *"this is strictly the domain of *dotfiles* agent - he manages config
of this machine, and thats all config and app installs."* mcp-starter-template did
the research only and **changed nothing**. Nothing here is approved yet: every
install and settings change still needs George's own yes.

## The question George asked

Can Claude Code get live feedback from dev tools (language server, AST, debugger)
the way the "omp" agent does, instead of coding blind and only seeing lint, test
and console output at the end?

## What omp is (verified 2026-09-24)

Oh My Pi, `can1357/oh-my-pi` (npm `@oh-my-pi/pi-coding-agent`), is a fork of
Mario Zechner's `badlogic/pi-mono`. It has 32,976 stars and was last pushed
2026-09-23 (`gh api repos/can1357/oh-my-pi`). Docs: https://omp.sh/docs/tools.

| Capability | What it does | Pushed or pulled | Source |
|---|---|---|---|
| LSP | diagnostics, definition, references, symbols, rename, code actions; 60+ servers | Diagnostics pushed after `write` (default on) but **off after `edit`** by default, for speed | repo `docs/settings.md`, `src/lsp/writethrough.ts` |
| AST | `ast_grep` search; `ast_edit` codemod shown as a preview | pulled | `docs/tools/ast-grep.md` |
| Debugger (DAP) | breakpoints, step, stack, variables, evaluate; lldb, gdb, debugpy, dlv, js-debug | pulled | `docs/tools/debug.md` |
| Browser and REPL | Puppeteer/CDP; persistent Python/JS | pulled | `src/tools/browser/`, README |

**The case against the premise:** omp's authors turned diagnostics off after
edits because waiting for them is the main latency cost. Its published
benchmark gains come from its edit format, not from these tools. No evidence
was found that its LSP or debugger measurably improves outcomes.

## What Claude Code already has (CLI 2.1.280)

- **LSP tool plus diagnostics pushed after every edit**, turned on by an LSP
  plugin: definition, references, hover, symbols, call hierarchy. There is no
  rename or code-action operation. Only one server per file extension.
  Sources: https://code.claude.com/docs/en/tools-reference and
  https://code.claude.com/docs/en/plugins-reference.
- **PostToolUse hooks** can feed output back to the model through
  `hookSpecificOutput.additionalContext` (https://code.claude.com/docs/en/hooks).
- **`mcp__ide__getDiagnostics`** returns VS Code's Problems panel when the
  session runs through the extension (https://code.claude.com/docs/en/vs-code).
- **Not built in:** a debugger and ast-grep.

## The finding that matters most: it is switched on and broken on gmac

Verified 2026-09-24 by the mcp-starter-template session.

- `~/.claude/settings.json` enables `typescript-lsp`, `rust-analyzer-lsp` and
  `lua-lsp` from `claude-plugins-official`.
- **`typescript-language-server` is not on PATH.** A call to the LSP tool failed
  with `ENOENT … Executable not found`.
- **`rust-analyzer` is a rustup proxy for a component that is not installed:**
  `error: Unknown binary 'rust-analyzer' in official toolchain 'stable-aarch64-apple-darwin'`.
- `ast-grep` and `sg` are missing. `biome` is at `~/Library/pnpm/bin/biome`.
- There are no PostToolUse hooks in user settings.

So every Claude session on this machine is coding without the post-edit
diagnostics the plugins are meant to give. Nothing reports the failure.

## Recommendations, ranked (proposals only)

1. **Install the missing language servers:** `typescript-language-server` and
   `typescript` (through mise, to be reproducible), and
   `rustup component add rust-analyzer`. This costs almost nothing and turns on
   post-edit diagnostics for TypeScript and Rust. It belongs in dotfiles. Worth
   adding a doctor check so that a plugin enabled without its binary fails
   loudly next time.
2. **A PostToolUse Biome hook** on `Edit|Write`: run `biome check` on the edited
   file and return findings through `additionalContext`, saying nothing when the
   file is clean. Biome cannot be a second LSP server for `.ts`, so a hook is the
   only way. Estimated at about 100 ms per edit (not measured). It could be
   user-scope (dotfiles) or stamped into generated repos, which all carry Biome.
   Do not hook `tsc --noEmit`: the LSP covers type errors, and a whole-project
   tsc on every edit is slow.
3. **Enable the TypeScript LSP plugin per project** in generated repos, through
   `enabledPlugins` in a stamped `.claude/settings.json`, with an AGENTS.md line
   naming the binary to install. **Untested:** whether project-scope
   `enabledPlugins` works on 2.1.280.
4. **ast-grep through its CLI**, taught by a skill. The MCP server
   (`ast-grep/ast-grep-mcp`) calls itself experimental and would add tool
   definitions to every session.
5. **Debugger: trial only.** `debugmcp/mcp-debugger` (166 stars, pushed
   2026-09-22) is the one maintained multi-language option; its benefit is
   unproven.
6. **Related tests on demand:** teach the agent `vitest related <file> --run`.
   Watch mode would flood the context.

## The template side (mcp-starter-template owns this, if approved)

Recommendations 2 and 3 could ship in every generated monorepo through
`apps/scaffolder/src/phases/11-agent-files/lib/.claude/`. mcp-starter-template
will do that part, but only after dotfiles settles the machine-level convention,
so the two do not diverge.

## Unknowns

- Whether push diagnostics measurably help, and how much context they cost per
  edit.
- Whether PostToolUse exit code 2 feeds stderr back to the model.
- Project-scope `enabledPlugins` on 2.1.280.
- How mature `mcp-debugger`'s JavaScript adapter is.
