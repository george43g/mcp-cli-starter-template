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

import { Migration, type MigrationContext, type MigrationResult } from "../../core/migration.js";
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
}
