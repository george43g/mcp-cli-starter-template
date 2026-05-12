/* eslint-disable */
// Placeholder loader — replaced at build time by `napi build` with a
// platform-aware require shim that loads the right `.node` binary.
//
// When the binary doesn't exist (e.g. on a fresh clone without `cargo`
// installed, or in a CI matrix that skipped this app), this stub throws
// on import, which the TS side's `tryLoadNative()` catches and returns
// null from — falling back to the TypeScript implementation transparently.
throw new Error(
  "rust-accel: native binary not built. Run `pnpm --filter @george43g/rust-accel build` or set MCP_DISABLE_NATIVE=1 to silence."
);
