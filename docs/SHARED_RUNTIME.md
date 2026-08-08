# Shared runtime versus generated source

The starter uses a hybrid ownership model: published packages come from npm,
project-shaped code is generated as editable source.

## Depended on, not generated

These are published to npm, and a generated tool takes a **version range** on
them. Their source is not copied into your repo:

| Package | Owns |
| --- | --- |
| `@george43g/robustness` | watchdog, shutdown/cleanup/signal/EOF/orphan handling, logging, health, timeout, retry, rate limiting |
| `@george43g/cli-kit` | commander program builder, TTY/colour/output helpers, env↔flag binder, REPL |
| `@george43g/tui-kit` | Ink theme system, hooks, components |
| `@george43g/secret-store` | env → `.env` → OS keychain → exec (opt-in) |

Customise policy through configuration rather than forking: `createWatchdog()`
and `createShutdownController()` take an environment prefix, thresholds, idle
behaviour, diagnostics, exit policy and lifecycle hooks, and both can be
reconfigured in place after construction.

The ranges are **derived**, not hand-written. `build-templates.mjs` reads the
real version out of each `packages/*/package.json` at build time and emits
`src/generated/published-versions.ts`. This is not incidental: the previously
hand-written `^0.1.0` sat in the scaffolder while robustness shipped `0.2.1`,
and a caret on a `0.x` pins the **minor** — so generated repos would have
installed `0.1.x` and silently missed every fix in `0.2.x`.

## Generated and project-owned

These stay source in each generated tool, because they normally need
product-specific changes:

- Tool implementations and app entry points.
- `mcp-kit` — unpublished; it can become a package once its consumer contract
  is proven.
- `shared-types` — arguably never a dependency: its whole job is to be edited
  alongside the consuming repo's Rust structs, with a drift test across the two.
- Native acceleration and its cross-language contract.
- Project skills, documentation, environment policy, and release decisions.
- `tsconfig`, `vitest-config`, `biome-config` — deliberately **never**
  published. They are per-monorepo shared config meant to be customised for the
  repo they live in, so a generated repo needs its own copies. A package that
  relocates to another monorepo depends on *that* repo's equivalent.

## There is no source mode

Earlier versions offered `--runtime-source source|registry`, where `source`
vendored a byte-identical copy of the published packages into the generated
repo. That flag is **removed**.

Maintaining those copies meant every edit to `packages/robustness` had to be
mirrored into the scaffolder's `lib/` tree in the same commit, enforced by a
byte-comparison test — and a stale mirror was the single most common CI failure
in this repository. Once the packages were genuinely on npm, the copies bought
nothing that a version range does not.

Practical consequences:

- A generated repo needs network access on first install, like any repo with
  dependencies.
- Upgrading the runtime is `pnpm up @george43g/robustness`, not a re-scaffold.
- To modify runtime behaviour, prefer configuration and composition. If you
  genuinely must fork, `npm pack` the version you are on and vendor it
  deliberately — as your decision, recorded in your repo.
