# [@george43g/mcp-kit-v2.0.0](https://github.com/george43g/mcp-cli-starter-template/compare/mcp-kit-v1.0.0...mcp-kit-v2.0.0) (2026-08-30)


* feat(mcp-kit)!: robustness becomes a peerDependency, removing the split-instance failure ([#109](https://github.com/george43g/mcp-cli-starter-template/issues/109)) ([02ef4dc](https://github.com/george43g/mcp-cli-starter-template/commit/02ef4dce0ad8719fe2b31f8f321b9aed9c41bc7a)), closes [george43g/golden-mcp#test](https://github.com/george43g/golden-mcp/issues/test)


### BREAKING CHANGES

* @george43g/robustness moved from dependencies to
peerDependencies. Consumers that relied on mcp-kit to install it transitively
must now declare it themselves; any 0.x range satisfies the peer.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017ecZmiZMQZDJcjvSxNozKH

* fix(scaffolder): make `test` depend on its own build, not just upstream's

The log-prefix test added in this PR exercises the BUILT bin, and the E2E smoke
proved the task graph does not guarantee one exists:

# [@george43g/mcp-kit-v1.0.0](https://github.com/george43g/mcp-cli-starter-template/compare/mcp-kit-v0.1.0...mcp-kit-v1.0.0) (2026-08-28)


* feat(mcp-kit)!: throw when a devOnly tool has no devOnlyEnabled predicate — cuts 1.0.0 ([#106](https://github.com/george43g/mcp-cli-starter-template/issues/106)) ([9c51a62](https://github.com/george43g/mcp-cli-starter-template/commit/9c51a623b2c8fe233d53b572d804b90c6280d5c4)), closes [#47](https://github.com/george43g/mcp-cli-starter-template/issues/47)


### BREAKING CHANGES

* buildDispatcher throws at construction if the registry contains
a devOnly tool and no devOnlyEnabled predicate is supplied. Pass the predicate,
or drop devOnly from those tool definitions.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017ecZmiZMQZDJcjvSxNozKH
