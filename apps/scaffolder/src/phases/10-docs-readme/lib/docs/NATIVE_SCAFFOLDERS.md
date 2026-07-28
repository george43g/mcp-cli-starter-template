# Native scaffolder policy

The scaffolder uses a native generator when the tool owns the operation and its
output matches the desired boundary. It keeps deterministic templates where the
repository itself owns the architecture.

## Current audit

| Surface | Current approach | Decision |
|---|---|---|
| Git repository | `git init --initial-branch=main` | Keep the native command. |
| Root package metadata | Deterministic `package.json` template | Do not replace with `npm init`/`pnpm init`; the root needs an exact workspace graph, scripts, overrides, engines, and package-manager pin. |
| Turborepo root | Deterministic `turbo.json`, workspace file, and root package | Do not run `create-turbo` inside a target. It bootstraps a whole new monorepo and its default/example apps are not this scaffold's MCP/CLI/TUI architecture. |
| MCP/CLI/TUI app | Project template + migrations | No upstream native generator produces this combined app or its dispatcher/lifecycle policies. |
| Vite, Biome, Vitest, napi-rs | Versioned dependencies plus tailored config/source | Their generic starters do not express the repository's shared packages, golden mirrors, optional native fallback, or CI contract. |
| Future framework leaf app | Not currently generated | Prefer that framework's official `create-*` command inside `apps/<name>` and integrate it using the generated `workspace-scaffolding` skill. |

Current `create-turbo` supports selecting npm, Yarn, pnpm, or Bun, skipping the
install, choosing an example, and pinning the Turbo version. Those controls make
it a good greenfield alternative or evaluation tool, but not a safe in-place
conversion primitive.

`npm init <initializer>` delegates to `create-<initializer>` and `npm init -w`
can create npm workspaces. Fresh output from this repository is pnpm-only, so
npm workspace mutation is relevant to detected npm repositories, not to the
fresh scaffold path.

## Upgrade model

Updating a generator version does not update repositories that were already
generated. Generated source becomes owned code unless the upstream project also
ships a supported codemod or migration.

Use native generators for new leaf packages to reduce boilerplate ownership.
Use dependency updates and official codemods for existing packages. Keep root
assembly deterministic so a fresh scaffold is reproducible and the golden drift
tests remain meaningful.

Generated repositories include:

- `skills/workspace-scaffolding/SKILL.md` for choosing and integrating native
  leaf generators.
- `skills/cli-artifacts/SKILL.md` for retaining CLI help, completions, and
  manpage generation even when the MCP app is removed.
