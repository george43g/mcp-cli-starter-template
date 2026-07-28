# Shared runtime versus generated source

The starter uses a hybrid ownership model.

## Shared and updateable

`@george43g/robustness` is the first reusable runtime package. It owns generic
process behavior that benefits from one maintained implementation:

- Watchdog monitoring and diagnostics.
- Shutdown, cleanup, signal, EOF, and orphan handling.
- Logging, health, timeout, retry, and rate limiting.

The public package begins at `0.1.0`. New scaffolds can select
`--runtime-source registry` to depend on `@george43g/robustness:^0.1.0`.
Registry mode becomes the default only after that version is published and a
clean registry consumer passes.

Consumers customize policy through `createWatchdog()` and
`createShutdownController()`: environment prefix, thresholds, idle behavior,
diagnostics, exit policy, and lifecycle hooks are configurable.

## Generated and project-owned

The following remain source in each generated tool because they normally need
product-specific changes:

- Tool implementations and app entry points.
- Project schemas and shared types.
- Native acceleration and its cross-language contract.
- Project skills, documentation, environment policy, and release decisions.

`mcp-kit`, `tui-kit`, `cli-kit`, and `env-loader` remain local packages for now.
They can become public later only after their consumer contracts are proven.

## Choosing a runtime source

```sh
# Updateable public package, after publication
mcp-scaffold init my-tool --name my-tool --runtime-source registry

# Editable project-owned source
mcp-scaffold init my-tool --name my-tool --runtime-source source
```

Source mode generates `packages/robustness` under the selected project scope.
Registry mode does not generate that package. `add-mcp-app` detects the mode
from existing app dependencies and refuses ambiguous repositories unless
`--runtime-source` is explicit.

Existing repositories are never silently converted between the two modes.
Prefer configuration and composition before forking runtime source.
