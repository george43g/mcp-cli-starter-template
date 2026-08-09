# [@george43g/robustness-v0.6.0](https://github.com/george43g/mcp-cli-starter-template/compare/robustness-v0.5.3...robustness-v0.6.0) (2026-08-09)


### Features

* **robustness:** give the logger an env prefix, a level gate, and PID-aware log reads ([0fb77ee](https://github.com/george43g/mcp-cli-starter-template/commit/0fb77ee5c014d2cec1c8c2922e534a5e7ddffc83))

# [@george43g/robustness-v0.5.3](https://github.com/george43g/mcp-cli-starter-template/compare/robustness-v0.5.2...robustness-v0.5.3) (2026-08-09)


### Bug Fixes

* **exports:** add the "./package.json" subpath to every package ([30137bd](https://github.com/george43g/mcp-cli-starter-template/commit/30137bd3710dbb8837afc86b6504bc78e122e14e))

# [@george43g/robustness-v0.5.2](https://github.com/george43g/mcp-cli-starter-template/compare/robustness-v0.5.1...robustness-v0.5.2) (2026-08-09)


### Bug Fixes

* **robustness:** keep the watchdog force-exit net armed through a kill ([fa9976a](https://github.com/george43g/mcp-cli-starter-template/commit/fa9976a346823d62efb9da331ec5fa585bbdffad))

# [@george43g/robustness-v0.5.1](https://github.com/george43g/mcp-cli-starter-template/compare/robustness-v0.5.0...robustness-v0.5.1) (2026-08-09)


### Bug Fixes

* **exports:** add a default condition so CJS consumers can require() the packages ([eb9632b](https://github.com/george43g/mcp-cli-starter-template/commit/eb9632be11b7a0c2a497814ce9caf58ba8bfa7c1))

# [@george43g/robustness-v0.5.0](https://github.com/george43g/mcp-cli-starter-template/compare/robustness-v0.4.0...robustness-v0.5.0) (2026-08-09)


### Features

* **robustness,tui-kit:** 16a kit hardening — redaction, logger knobs, shutdown trail, useDevStats(visible) ([9af30ec](https://github.com/george43g/mcp-cli-starter-template/commit/9af30eccecef63a9b4ad694fa4dafa6bf167d5b1)), closes [#16](https://github.com/george43g/mcp-cli-starter-template/issues/16) [#19](https://github.com/george43g/mcp-cli-starter-template/issues/19)

# [@george43g/robustness-v0.4.0](https://github.com/george43g/mcp-cli-starter-template/compare/robustness-v0.3.0...robustness-v0.4.0) (2026-08-09)


### Bug Fixes

* **robustness:** read env knobs on use, not at module load ([445f074](https://github.com/george43g/mcp-cli-starter-template/commit/445f074f0c01df0413f4363170b3d6422b39528c))


### Features

* **robustness:** ship src alongside the source maps ([bd9da70](https://github.com/george43g/mcp-cli-starter-template/commit/bd9da700884f5abf6076c381a5e69e2bd28e3582))

# [@george43g/robustness-v0.3.0](https://github.com/george43g/mcp-cli-starter-template/compare/robustness-v0.2.1...robustness-v0.3.0) (2026-08-08)


### Features

* **vitest-config:** make the coverage gates actually run ([7b54070](https://github.com/george43g/mcp-cli-starter-template/commit/7b54070086699c2e8870fe67f97426f6ce41a271)), closes [#16a](https://github.com/george43g/mcp-cli-starter-template/issues/16a)

# [@george43g/robustness-v0.2.1](https://github.com/george43g/mcp-cli-starter-template/compare/robustness-v0.2.0...robustness-v0.2.1) (2026-08-08)


### Bug Fixes

* **robustness:** preserve registered state when reconfiguring the singletons ([790bbd3](https://github.com/george43g/mcp-cli-starter-template/commit/790bbd3dea02eba42e9a3a4ab25acd89b2ead5df)), closes [#14](https://github.com/george43g/mcp-cli-starter-template/issues/14)
* **robustness:** record the orphan-watchdog interval only once armed ([fea1a4b](https://github.com/george43g/mcp-cli-starter-template/commit/fea1a4b1799fb8220c38ac9d2c69235b4c9476f1))

# [@george43g/robustness-v0.2.0](https://github.com/george43g/mcp-cli-starter-template/compare/robustness-v0.1.1...robustness-v0.2.0) (2026-08-08)


### Features

* **packages:** publish cli-kit + tui-kit, generalize the release pipeline ([5a0f313](https://github.com/george43g/mcp-cli-starter-template/commit/5a0f3136588b4344ecc65f9d08ad3e004ca65be5)), closes [#10](https://github.com/george43g/mcp-cli-starter-template/issues/10)

# [@george43g/robustness-v0.1.1](https://github.com/george43g/mcp-cli-starter-template/compare/robustness-v0.1.0...robustness-v0.1.1) (2026-07-31)


### Bug Fixes

* **release:** pin @semantic-release/npm to v13 for real OIDC support ([9615341](https://github.com/george43g/mcp-cli-starter-template/commit/9615341dc1cd190c1dafcffc55cb88642ebca795))
