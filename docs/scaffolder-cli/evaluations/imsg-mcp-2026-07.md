# imsg-mcp retrofit evaluation

Evaluation date: 2026-07-27

This evaluation used committed `imsg-mcp` revision
`30d0ea41ec046bc314393fddf9151da5c7859288`. The evaluator made a local clone in
a temporary directory; the source checkout and its untracked research files
were not modified or copied into the evaluation.

## Legacy behavior

The pre-hardening bundled CLI completed successfully, but normal
`apply --execute` produced 127 untracked files. They included a complete
`packages/` tree, Turbo/toolchain configuration, workflows, starter
documentation, skill skeletons, and `RETROFIT.md`.

Nine divergent product files were preserved. With `--force`, the same operation
rewrote 13 tracked files, including the product README, agent guide, TypeScript
and Biome configuration, release configuration, and CI workflows.

The operation was recoverable in an isolated Git clone, but demonstrated that
`appliesTo: "both"` was not a sufficient compatibility contract for generic
existing repositories.

## Safe-profile behavior

After target-profile gating, the same committed repository under the default
safe strategy produced no tracked-file changes and only:

- `RETROFIT.md`
- `skills/imsg/SKILL.md`, marked as a project-specific skeleton

The isolated result passed frozen install, lint, typecheck, test, and build.

Use `--existing-strategy full` only for deliberate template-infrastructure
evaluation. A named `migrate <id>` remains the narrower opt-in path.

## Reproduce

```sh
pnpm --filter @george43g/mcp-scaffold build
pnpm evaluate:retrofit -- \
  --source /path/to/existing-repo \
  --output /tmp/scaffolder-evaluation \
  --strategy safe \
  --install \
  --verify lint,typecheck,test,build
```

The output contains `evaluation.json`, the full Git patch, and captured
scaffolder stdout/stderr. The temporary clone is deleted unless `--keep` is
explicit. `--install` also uses a pnpm store inside the temporary evaluation
directory, so it does not mutate the user's normal global store. It may still
access the package registry when required dependencies are not cached.
