# [@george43g/mcp-kit-v1.0.0](https://github.com/george43g/mcp-cli-starter-template/compare/mcp-kit-v0.1.0...mcp-kit-v1.0.0) (2026-08-28)


* feat(mcp-kit)!: throw when a devOnly tool has no devOnlyEnabled predicate — cuts 1.0.0 ([#106](https://github.com/george43g/mcp-cli-starter-template/issues/106)) ([9c51a62](https://github.com/george43g/mcp-cli-starter-template/commit/9c51a623b2c8fe233d53b572d804b90c6280d5c4)), closes [#47](https://github.com/george43g/mcp-cli-starter-template/issues/47)


### BREAKING CHANGES

* buildDispatcher throws at construction if the registry contains
a devOnly tool and no devOnlyEnabled predicate is supplied. Pass the predicate,
or drop devOnly from those tool definitions.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017ecZmiZMQZDJcjvSxNozKH
