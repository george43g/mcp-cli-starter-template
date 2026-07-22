/**
 * 03-configs/m1-tsconfig-pkg — packages/tsconfig/ workspace package.
 *
 * Three shared configs:
 *   base.json  — ES2022, NodeNext, strict, exactOptionalPropertyTypes, etc.
 *   node.json  — extends base, adds types:["node"]
 *   react.json — extends node, jsx: react-jsx, lib + DOM
 *
 * Plus a root tsconfig.json that extends base (so the repo root has a
 * sensible TS context for tools that look there first).
 */

import {
  appliedStatus,
  Migration,
  type MigrationContext,
  type MigrationResult,
} from "../../core/migration.js";
import { requireRepoName } from "../../core/target-inspection.js";
import { nameUpperOf, substitute } from "../../core/templating.js";

const PKG_JSON = `{
  "name": "{{scope}}/tsconfig",
  "version": "0.0.0",
  "private": true,
  "license": "MIT",
  "files": [
    "base.json",
    "node.json",
    "react.json"
  ]
}
`;

const BASE_JSON = `{
  "$schema": "https://json.schemastore.org/tsconfig",
  "display": "{{scope}}/tsconfig/base",
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "exclude": ["node_modules", "dist", "build", "coverage"]
}
`;

const NODE_JSON = `{
  "$schema": "https://json.schemastore.org/tsconfig",
  "display": "{{scope}}/tsconfig/node",
  "extends": "./base.json",
  "compilerOptions": {
    "types": ["node"]
  }
}
`;

const REACT_JSON = `{
  "$schema": "https://json.schemastore.org/tsconfig",
  "display": "{{scope}}/tsconfig/react",
  "extends": "./node.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "types": ["node", "react"],
    "lib": ["ES2022", "DOM"]
  }
}
`;

const ROOT_TSCONFIG = `{
  "extends": "{{scope}}/tsconfig/base.json",
  "files": [],
  "references": []
}
`;

// Custom substituter — handles {{scope}} on top of the standard example-repo/EXAMPLE_REPO.
function subWithScope(content: string, name: string, scope: string): string {
  return substitute(content.replace(/\{\{scope\}\}/g, scope), {
    name,
    nameUpper: nameUpperOf(name),
  });
}

export default class TsconfigPkgMigration extends Migration {
  readonly id = "03-configs/m1-tsconfig-pkg";
  readonly title = "Create packages/tsconfig/ workspace package";
  readonly appliesTo = "both" as const;

  async apply(ctx: MigrationContext): Promise<MigrationResult> {
    const name = requireRepoName(ctx.config);
    const scope = ctx.config.global.scope.peek() ?? "@george43g";
    const filesChanged: string[] = [];

    const files: Array<[string, string]> = [
      ["packages/tsconfig/package.json", PKG_JSON],
      ["packages/tsconfig/base.json", BASE_JSON],
      ["packages/tsconfig/node.json", NODE_JSON],
      ["packages/tsconfig/react.json", REACT_JSON],
      ["tsconfig.json", ROOT_TSCONFIG],
    ];

    for (const [path, template] of files) {
      const content = subWithScope(template, name, scope);
      const outcome = await ctx.fs.writeIfChanged(path, content);
      if (outcome !== "unchanged") filesChanged.push(path);
    }

    return filesChanged.length === 0
      ? { status: "noop" }
      : { status: appliedStatus(ctx.dryRun), filesChanged };
  }
}
