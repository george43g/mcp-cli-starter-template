# Production install

The dev entry point is the launch wrapper in [SKILL.md](SKILL.md). This note is the other install: a published package, a plugin, or a local HTTP server. Research Nerd, 2026-10-20. Linux measurements. macOS signing and quarantine were not tested.

## Checkout tools do not bundle a runtime

A bundled Node beside a tool that already has mise, pnpm, and a checkout costs about 123 MB of binary per architecture, a second runtime to patch on every Node security release, a bundling step that can go stale, and macOS signing if the files arrive quarantined. The wrapper's mise form already starts when PATH has no `node`, without that second runtime.

cursor-agent bundles because its users have no toolchain and it ships ABI-matched native addons. A checkout of this stack has the toolchain by definition. Copying that layout for a run-from-source tool buys nothing the mise wrapper does not already do.

## When a bundle is justified

Any one of these is enough. None of them is "startup might be faster":

1. The server must start on a machine with no Node, mise, or pnpm, and it is not an MCPB plugin. MCPB's README says Node ships with Claude for macOS and Windows, so a bundle works out of the box there. Whether that Node applies to a plain desktop config entry, rather than an MCPB plugin, was not established.
2. A native addon must match one Node ABI, and that Node is not the user's toolchain.
3. The server's Node range conflicts with the host toolchain, and the host cannot run mise. MCPB can declare `compatibility.runtimes.node`. Whether Claude Desktop enforces that with its built-in Node was not established.
4. The client strips PATH and also rejects an absolute path to the user's Node or mise. Absolute paths worked in every 2026-10-20 probe.
5. Linux Claude Desktop, if MCPB's built-in Node is macOS and Windows only.
6. Offline startup with no registry access and no checkout on the machine.

## MCPB, not a private runtime copy

For a Claude plugin, use MCPB. It is the existing install that carries Node on macOS and Windows. Do not ship a second copy of Node next to the plugin unless one of the conditions above is true and MCPB does not cover it.

## Bun

Bun's runner was not measured (the lab had bun 1.4.2 and did not run it). A bundled Bun is the same cost as a bundled Node: a second ABI, a second patch channel, and a `dist/` that can be stale. Do not bundle Bun for speed until a measurement on this server beats `node --import tsx` by enough to pay that cost. The lab's 10-line program was about 76 ms through the zsh wrapper and about 490 ms through `pnpm start`. That gap is the runner, not the need for another runtime.

## Public package

A published package's `bin` key is metadata for npm, pnpm, and yarn. The shim those tools generate ends in `exec node <file> "$@"` and does not eat argv. It still needs `node` on PATH, and a TypeScript shebang of `node --import tsx` still resolves `tsx` from the caller's cwd. Ship built JavaScript with a `#!/usr/bin/env node` shebang, or a JS launcher that imports the TypeScript relative to its own file. Do not tell a public user to run `npm start` or `pnpm start`.

Someone who rarely updates gets that versioned install. A symlink, if they want one, points at the installed prefix. It does not point at a git checkout.

## Local HTTP

Stdio is the wrapper. An HTTP server for the same package is a subcommand of that same process, bound to `127.0.0.1`, with a bearer token. The starter's rules are in [HTTP_MODE.md](../../docs/HTTP_MODE.md): token from the environment, then `.env`, then the OS keychain; `POST /mcp`; `GET /health`; TLS at a reverse proxy; do not bind a public interface unless the operator sets it.

A public URL is that local server behind the proxy, or a hosted process started from the published package. It is not `pnpm --filter … mcp --http` inside an MCP client's `command`. The client cwd, PATH, and stdout rules in SKILL.md still apply to anything the client spawns. A remote HTTP client uses the URL and the bearer header, and spawns nothing.
