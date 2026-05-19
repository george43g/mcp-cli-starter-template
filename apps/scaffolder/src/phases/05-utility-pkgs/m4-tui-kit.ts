/**
 * 05-utility-pkgs/m4-tui-kit — port packages/tui-kit/.
 *
 * Reusable Ink/React building blocks: accent-driven theme system,
 * useDevStats/useMouse/useVimKeys hooks, FullScreenInk wrapper integrated
 * with the shutdown registry, DevStatsPanel, bounded-list eviction helper,
 * TTL+memory-pressure cache.
 *
 * Conditionally skipped via `config.features.tui = false`.
 */

import { Migration, type MigrationContext, type MigrationResult } from "../../core/migration.js";
import {
  portPackage,
  standardReactTsconfig,
  standardVitestConfig,
} from "../../core/package-port.js";

const PKG_JSON = (scope: string) => `{
  "name": "${scope}/tui-kit",
  "version": "0.0.0",
  "private": true,
  "description": "Reusable Ink/React TUI building blocks: accent-driven theme system, useDevStats / useMouse / useVimKeys hooks, FullScreenInk wrapper integrated with the shutdown registry, DevStatsPanel, bounded-list eviction helper, and TTL+memory-pressure cache.",
  "type": "module",
  "license": "MIT",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./theme": {
      "types": "./dist/theme/index.d.ts",
      "import": "./dist/theme/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "clean": "rm -rf dist coverage"
  },
  "dependencies": {
    "${scope}/robustness": "workspace:*",
    "fullscreen-ink": "^0.1.0",
    "ink": "^7.0.0",
    "react": "^19.0.0"
  },
  "devDependencies": {
    "${scope}/tsconfig": "workspace:*",
    "${scope}/vitest-config": "workspace:*",
    "@types/node": "^24.0.0",
    "@types/react": "^19.0.0",
    "ink-testing-library": "^4.0.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
`;

export default class TuiKitMigration extends Migration {
  readonly id = "05-utility-pkgs/m4-tui-kit";
  readonly title = "Port packages/tui-kit/ (theme + hooks + components)";
  readonly appliesTo = "both" as const;

  override async shouldRun(ctx: MigrationContext): Promise<boolean> {
    // Opt-out via `config.features.tui = false` (set by --no-tui flag).
    // Peek-only check: don't trigger a prompt — if the user hasn't set it,
    // default to including the TUI.
    return ctx.config.features.tui.peek() !== false;
  }

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    return portPackage(ctx, {
      pkgDir: "packages/tui-kit",
      packageJson: PKG_JSON,
      tsconfig: standardReactTsconfig,
      vitestConfig: standardVitestConfig,
      libPrefix: "05-utility-pkgs/lib/tui-kit/",
    });
  }
}
