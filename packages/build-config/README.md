# @george43g/build-config

Build identity for this monorepo's apps. **Private — never published.**

```
<semver>+<count>.<sha>[.dirty.<MMDDTHHmm>]

0.9.0+412.a1b2c3d
0.9.0+412.a1b2c3d.dirty.0809T0612
```

Semver only moves on release, so every build between two releases is otherwise
indistinguishable. This makes "is the artifact running the one I just built?" a
fact rather than a guess.

## Why it is private, and must stay that way

Vite's `define` is **compile-time textual substitution over the modules Vite
bundles**. A module marked `external` never passes through it.

The apps here list `/^@george43g\//` in `rollupOptions.external`, and generated
repos install the kits from npm as real external dependencies. So a
`buildStamp()` exported from a *published* kit would reference a
`__BUILD_STAMP__` that is never substituted in the consumer.

The failure mode is the dangerous kind: it would degrade to a plausible-looking
fallback rather than erroring, so it would look like it worked. The reader has to
live in the consuming app's own bundled graph — which is why this produces
`define` values at build time instead of exporting a runtime function.

This is the fourth sibling to `tsconfig`, `biome-config` and `vitest-config`, and
inherits their rule: shared tool config is per-monorepo, stays `private: true`,
and is never a real dependency.

## Use

```ts
// vite.config.ts
import { createRequire } from "node:module";
import { buildDefines } from "@george43g/build-config";

const { version } = createRequire(import.meta.url)("./package.json");

export default defineConfig({
  define: buildDefines(version),
  // ...
});
```

Then read it, guarding for the case where no Vite build ran:

```ts
declare const __BUILD_STAMP__: string | undefined;

if (typeof __BUILD_STAMP__ === "string") return __BUILD_STAMP__;
```

`typeof`, not a bare read — under `tsx src/cli.ts` there is no Vite, the
identifier genuinely does not exist, and a direct read throws `ReferenceError`.

Also available as a CLI:

```sh
node packages/build-config/build-stamp.mjs --print 0.9.0
```

## What each part is for

| Part | Source | Why |
|---|---|---|
| count | `git rev-list --count HEAD` | Monotonic — tells you which of two builds is newer at a glance. Derived from history rather than a committed counter, so it survives a clean checkout and agrees between a laptop and CI instead of colliding. |
| sha | `git rev-parse --short=7 HEAD` | Ties the build to source. |
| dirty | non-empty `git status --porcelain` | Two dev builds off one commit would otherwise be identical; minute resolution separates them. |

**A shallow checkout reports count `0`, not a real-looking small number.** A
depth-1 clone makes `git rev-list --count HEAD` return `1`, which is wrong and
believable — the worst combination. The stamp probes
`git rev-parse --is-shallow-repository` and degrades visibly instead. CI still
sets `fetch-depth: 0` so the count is real; this is the backstop for when someone
adds a workflow and forgets.

Every git call degrades rather than throwing, so a published tarball or a
shallow container still builds.

## Caching

`BUILD_STAMP` in the environment overrides the computed value, and turbo lists it
in the build task's `env`, so setting it makes the stamp part of the cache key.
Without that, a cached build can replay an older stamp — exactly the
stale-artifact confusion this exists to remove.

## License

MIT — see [LICENSE](../../LICENSE).
