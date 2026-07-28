import type { MigrationContext } from "./migration.js";

export const PUBLIC_ROBUSTNESS_PACKAGE = "@george43g/robustness";
export const PUBLIC_ROBUSTNESS_RANGE = "^0.1.0";

export function runtimePackageName(ctx: MigrationContext, scope?: string): string {
  return ctx.config.global.runtimeSource.peek() === "registry"
    ? PUBLIC_ROBUSTNESS_PACKAGE
    : `${scope ?? ctx.config.global.scope.peek() ?? "@george43g"}/robustness`;
}

export function runtimeDependencyRange(ctx: MigrationContext): string {
  return ctx.config.global.runtimeSource.peek() === "registry"
    ? PUBLIC_ROBUSTNESS_RANGE
    : "workspace:*";
}
