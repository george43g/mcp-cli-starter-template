---
name: workspace-scaffolding
description: Choose and run native project generators for new apps or packages inside a monorepo without clobbering repository policy. Use when adding a framework app, CLI, library, or other workspace; deciding whether to use create-turbo, npm init, or a framework create command; or upgrading the generator used for future workspace creation.
---

# Scaffold workspace packages

Prefer an official framework or package generator for a new leaf workspace when
its output matches the requested product. Keep the repository-level workspace,
task graph, shared configs, and CI under this repo's control.

## Choose the boundary

- Use `create-turbo` for a separate greenfield Turborepo or to inspect an
  official example. Do not run it over an existing monorepo: it bootstraps an
  entire repository, not one leaf package or an in-place conversion.
- Use a framework's official `create-*` command for a new app under `apps/`.
- Use a language/package initializer for a simple new package only when it
  preserves the root package-manager and workspace conventions.
- Use the repository's existing migration/template when the output is bespoke
  infrastructure such as the MCP/CLI/TUI app, shared configs, robustness
  policy, or CI.

## Run a native generator safely

1. Read the current official generator documentation and inspect its version.
2. Run it on a clean branch or worktree with an explicit target directory.
3. Pin the initializer version in automation. Use `latest` only for deliberate
   evaluation, then record the resolved version.
4. Pass the existing package manager and skip nested installs when supported.
5. Inspect every generated file before merging it with shared configs.
6. Install once from the monorepo root.
7. Run lint, typecheck, tests, and build for the new workspace and the root.

Never assume rerunning a newer generator upgrades existing generated code.
Generator output becomes owned source; upgrades still require a reviewed diff
or an official codemod.

## Turborepo-specific rule

The current root is a deterministic custom Turborepo template. Updating the
`turbo` dependency updates the task runner. Updating `create-turbo` would only
affect future repositories created by that external generator, not existing
workspace structure or bespoke MCP packages.
