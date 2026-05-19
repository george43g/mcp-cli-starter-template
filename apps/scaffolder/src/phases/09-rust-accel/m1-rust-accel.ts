/**
 * 09-rust-accel/m1-rust-accel — port apps/rust-accel/ (optional napi-rs v3 crate).
 *
 * Includes Cargo.toml, build.rs, src/{lib,types}.rs, package.json,
 * index.js (auto-generated napi loader, checked-in), index.d.ts, README.md,
 * .gitignore.
 *
 * Files use `{{name}}` placeholders (in lib.rs comments and Cargo.toml
 * description); portPackage substitutes them. The pkgDir is fixed as
 * `apps/rust-accel/` (not user-customizable — the package name is
 * conventionally rust-accel across all template clones).
 *
 * Gated on config.features.rustAccel (default true; opt-out via --no-rust).
 */

import {
  Migration,
  type MigrationContext,
  type MigrationResult,
  type RetrofitIntent,
} from "../../core/migration.js";
import { portPackage } from "../../core/package-port.js";

export default class RustAccelMigration extends Migration {
  readonly id = "09-rust-accel/m1-rust-accel";
  readonly title = "Port apps/rust-accel/ (optional napi-rs v3 crate)";
  readonly appliesTo = "new" as const;

  override async shouldRun(ctx: MigrationContext): Promise<boolean> {
    // Default to including rust-accel unless explicitly disabled.
    return ctx.config.features.rustAccel.peek() !== false;
  }

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    return portPackage(ctx, {
      pkgDir: "apps/rust-accel",
      libPrefix: "09-rust-accel/lib/",
    });
  }

  override retrofitIntent(_ctx: MigrationContext): RetrofitIntent | undefined {
    return {
      summary: "Add the optional napi-rs v3 acceleration crate at apps/rust-accel/.",
      rationale:
        "appliesTo=new — Rust acceleration is opt-in and only worth adding when you have a measurable hot path. The crate hand-mirrors Zod types from @<scope>/shared-types, with a CI drift-check test. Force-adding it to an existing repo without a use case is pure overhead.",
      manualSteps: [
        "Decide whether you actually need it. Acceleration helps a tight loop in a tool handler; skip if your bottleneck is I/O or network.",
        "Copy apps/rust-accel/ from https://github.com/george43g/mcp-cli-starter-template wholesale.",
        "Hand-mirror your Zod schemas into src/types.rs (field names + JSON tags must match exactly).",
        "Add a drift-check test in packages/shared-types/ that fails CI if the Rust struct field names diverge from the Zod schemas.",
        "Wire native-bridge.ts to tryLoadNative() with an env escape (MCP_DISABLE_NATIVE=1) so the TS fallback path is always reachable.",
      ],
      prompt:
        `Add napi-rs v3 acceleration to my MCP server, matching the pattern at ` +
        `https://github.com/george43g/mcp-cli-starter-template/tree/main/apps/rust-accel. ` +
        `Before writing any code, ask me: which specific tool handler is the hot path? If I ` +
        `can't name one with profiler evidence, push back — Rust acceleration is overhead ` +
        `without a real workload.\n` +
        `\n` +
        `Once justified, do these in order:\n` +
        `\n` +
        `1. Create apps/rust-accel/ with Cargo.toml (napi v3, tokio, serde, serde_json — no ` +
        `domain deps), build.rs (\`napi_build::setup()\`), src/lib.rs, src/types.rs.\n` +
        `2. Add an apps/rust-accel/package.json that runs \`napi build --release\` and ` +
        `produces index.js + index.d.ts + *.node. Check in the generated index.{js,d.ts} ` +
        `(they're stable bindings, NOT the .node binary).\n` +
        `3. Hand-mirror my Zod schemas (from packages/shared-types/, or wherever I keep them) ` +
        `into apps/rust-accel/src/types.rs. Field names + serde rename attrs must EXACTLY ` +
        `match the JSON shape my Zod schemas produce.\n` +
        `4. Add a drift-check test in packages/shared-types/tests/drift.test.ts that parses ` +
        `apps/rust-accel/src/types.rs at test time and asserts every Zod schema's fields are ` +
        `present in the Rust struct (and vice versa).\n` +
        `5. Add apps/<name>-mcp/src/native-bridge.ts: \`tryLoadNative()\` requires the .node ` +
        `binary at runtime, with a try/catch + MCP_DISABLE_NATIVE=1 env escape that returns ` +
        `undefined to force the TS fallback path. Every accelerated tool handler must work ` +
        `with OR without the native module.\n` +
        `6. Add a CI step that builds Rust and runs both \`pnpm test\` (native available) and ` +
        `\`MCP_DISABLE_NATIVE=1 pnpm test\` (fallback path).\n` +
        `\n` +
        `When done, give me the perf measurement (before/after) for the hot path I identified.`,
    };
  }
}
