# example-repo-dev (cloud-agent skill)

> This file is a thin pointer for cloud agents. The canonical skill lives at `skills/example-repo/SKILL.md`.

## Before doing any work

1. Confirm Node 24+ is active. Cloud workspaces sometimes default to older versions:
   ```bash
   nvm install 24 && nvm use 24
   ```

2. Activate corepack so pnpm 10.x is available:
   ```bash
   corepack enable pnpm
   ```

3. Install workspace deps:
   ```bash
   pnpm install --frozen-lockfile
   ```

4. Build before tests (turbo caches between runs):
   ```bash
   pnpm build
   ```

## Native acceleration in cloud workspaces

Cloud runners often lack a Rust toolchain. The native build is **optional** —
the `build:native:optional` script silently skips on missing `rustc`. The
TypeScript fallback path is used automatically. CI test matrices include
both paths (`pnpm test` and `pnpm test:no-native`).

## When you're done

Match the post-step verification rule in `AGENTS.md`:

```bash
pnpm verify              # lint + typecheck + test + build
pnpm stress              # only if you touched dispatcher / lifecycle / transport
```
