/**
 * 03-configs/m2-biome-pkg — packages/biome-config/ + root biome.json.
 *
 * Single source for biome rules across the workspace. The shared file is
 * `root: false` so it can be extended; the actual root biome.json is a
 * sibling with `root: true` that points at the shared one.
 */

import {
  appliedStatus,
  Migration,
  type MigrationContext,
  type MigrationResult,
} from "../../core/migration.js";

const PKG_JSON = (scope: string) => `{
  "name": "${scope}/biome-config",
  "version": "0.0.0",
  "private": true,
  "license": "MIT",
  "files": [
    "biome.json"
  ]
}
`;

const SHARED_BIOME = `{
  "root": false,
  "$schema": "https://biomejs.dev/schemas/2.5.5/schema.json",
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "trailingCommas": "all",
      "semicolons": "always",
      "arrowParentheses": "always"
    }
  },
  "json": {
    "formatter": {
      "trailingCommas": "none"
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "preset": "recommended",
      "suspicious": {
        "noExplicitAny": "off",
        "noImplicitAnyLet": "off",
        "noTemplateCurlyInString": "off",
        "noControlCharactersInRegex": "off",
        "noEmptyBlockStatements": "off",
        "useIterableCallbackReturn": "off",
        "noSelfCompare": "off"
      },
      "style": {
        "noNonNullAssertion": "off",
        "useImportType": "off",
        "useNodejsImportProtocol": "off",
        "useTemplate": "off",
        "noParameterAssign": "off"
      },
      "correctness": {
        "noUnusedImports": "warn",
        "noUnusedVariables": "warn"
      },
      "complexity": {
        "noBannedTypes": "off"
      }
    }
  }
}
`;

// Note: biome 2.x's `extends` workspace resolution is finicky — we inline the
// rules at the root and keep the shared package as a reference. If/when biome
// 2.5+ ships clean extends resolution, swap to `extends: ["{{scope}}/..."]`.
const ROOT_BIOME = `{
  "$schema": "https://biomejs.dev/schemas/2.5.5/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "ignoreUnknown": true,
    "includes": [
      "**",
      "!**/dist",
      "!**/node_modules",
      "!**/coverage",
      "!**/.turbo",
      "!apps/rust-accel/target",
      "!apps/rust-accel/index.js",
      "!apps/rust-accel/index.d.ts",
      "!**/*.tsbuildinfo"
    ]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "trailingCommas": "all",
      "semicolons": "always",
      "arrowParentheses": "always"
    }
  },
  "json": {
    "formatter": {
      "trailingCommas": "none"
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "preset": "recommended",
      "suspicious": {
        "noExplicitAny": "off",
        "noImplicitAnyLet": "off",
        "noTemplateCurlyInString": "off",
        "noControlCharactersInRegex": "off",
        "noEmptyBlockStatements": "off",
        "useIterableCallbackReturn": "off",
        "noSelfCompare": "off"
      },
      "style": {
        "noNonNullAssertion": "off",
        "useImportType": "off",
        "useNodejsImportProtocol": "off",
        "useTemplate": "off",
        "noParameterAssign": "off"
      },
      "correctness": {
        "noUnusedImports": "warn",
        "noUnusedVariables": "warn"
      },
      "complexity": {
        "noBannedTypes": "off"
      }
    }
  }
}
`;

export default class BiomePkgMigration extends Migration {
  readonly id = "03-configs/m2-biome-pkg";
  readonly title = "Create packages/biome-config/ + root biome.json";
  readonly appliesTo = "both" as const;

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    const scope = ctx.config.global.scope.peek() ?? "@george43g";
    const filesChanged: string[] = [];

    const files: Array<[string, string]> = [
      ["packages/biome-config/package.json", PKG_JSON(scope)],
      ["packages/biome-config/biome.json", SHARED_BIOME],
      ["biome.json", ROOT_BIOME],
    ];

    for (const [path, content] of files) {
      const outcome = await ctx.fs.writeIfChanged(path, content);
      if (outcome !== "unchanged") filesChanged.push(path);
    }

    return filesChanged.length === 0
      ? { status: "noop" }
      : { status: appliedStatus(ctx.dryRun), filesChanged };
  }
}
