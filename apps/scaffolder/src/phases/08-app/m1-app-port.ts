/**
 * 08-app/m1-app-port — port the apps/{{name}}-mcp/ tool itself.
 *
 * This is the biggest migration in the scaffolder: it lays down the entire
 * user-facing app — src/ (cli, index, dispatcher, tools/, tui/, commands/),
 * scripts/ (mcp-dev-proxy, stress-{mcp,tui}, screenshots/*.tape),
 * tests/ (integration), .env.example, .usage.kdl, README.md, plus all
 * config files (package.json, tsconfig.json, vite.config.ts, vitest.config.ts).
 *
 * Every file ships in lib/ with `{{name}}` and `@george43g` placeholders
 * intact; portPackage substitutes them at write time based on the user's
 * answers (config.global.repoName + config.global.scope).
 */

import { Migration, type MigrationContext, type MigrationResult } from "../../core/migration.js";
import { portPackage } from "../../core/package-port.js";

export default class AppPortMigration extends Migration {
  readonly id = "08-app/m1-app-port";
  readonly title = "Port apps/{{name}}-mcp/ (the user-facing tool)";
  readonly appliesTo = "new" as const;

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    const name = ctx.config.global.repoName.peek() ?? "starter";
    const pkgDir = `apps/${name}-mcp`;
    return portPackage(ctx, {
      pkgDir,
      libPrefix: "08-app/lib/",
    });
  }
}
