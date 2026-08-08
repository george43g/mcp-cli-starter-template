/**
 * 06-mcp-kit/m1-mcp-kit — port packages/mcp-kit/.
 *
 * MCP server building blocks: tool registry types, dispatcher with
 * timeout/perf/abort/error-wrap baked in, stdio + Streamable HTTP transports,
 * sanitize() for user content, UUID-gated prompt-injection helpers.
 */

import { Migration, type MigrationContext, type MigrationResult } from "../../core/migration.js";
import {
  portPackage,
  standardNodeTsconfig,
  standardVitestConfig,
} from "../../core/package-port.js";
import { PUBLIC_SCOPE, rangeFor } from "../../core/runtime-source.js";

const PKG_JSON = (scope: string, ctx: MigrationContext) => `{
  "name": "${scope}/mcp-kit",
  "version": "0.0.0",
  "private": true,
  "description": "MCP server building blocks: tool registry types, dispatcher with timeout/perf/abort/error-wrap baked in, stdio + Streamable HTTP transports, sanitize() for user content, UUID-gated prompt-injection helpers.",
  "type": "module",
  "license": "MIT",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./http": {
      "types": "./dist/transports/http.d.ts",
      "import": "./dist/transports/http.js"
    },
    "./stdio": {
      "types": "./dist/transports/stdio.d.ts",
      "import": "./dist/transports/stdio.js"
    }
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "clean": "rm -rf dist coverage"
  },
  "dependencies": {
    "${PUBLIC_SCOPE}/robustness": "${rangeFor(`${PUBLIC_SCOPE}/robustness`)}",
    "@modelcontextprotocol/sdk": "^1.29.0",
    "zod": "^3.23.0",
    "zod-to-json-schema": "^3.25.0"
  },
  "devDependencies": {
    "${scope}/tsconfig": "workspace:*",
    "${scope}/vitest-config": "workspace:*",
    "@types/node": "^24.13.3",
    "typescript": "^5.7.0",
    "vitest": "^3.2.7"
  }
}
`;

export default class McpKitMigration extends Migration {
  readonly id = "06-mcp-kit/m1-mcp-kit";
  readonly title = "Port packages/mcp-kit/ (tool-registry + dispatcher + transports + guardrails)";
  readonly appliesTo = "both" as const;

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    return portPackage(ctx, {
      pkgDir: "packages/mcp-kit",
      packageJson: PKG_JSON,
      tsconfig: standardNodeTsconfig,
      vitestConfig: standardVitestConfig,
      libPrefix: "06-mcp-kit/lib/",
    });
  }
}
