/**
 * Phase barrel — statically imports every phase manifest so vite can bundle
 * them. Adding a new phase: drop the dir under src/phases/<NN-name>/, then
 * add a `phases.push(<phase>)` line below in numeric order.
 *
 * We could discover phases via fs.readdir + dynamic import (cleaner-looking),
 * but that requires running unbundled — and we want a single-file dist/cli.js
 * for `npx mcp-scaffold`. Static imports keep the bundle tidy.
 */

import type { Phase } from "../core/migration.js";
import { phase as p01Bootstrap } from "./01-bootstrap/index.js";
import { phase as p02Toolchain } from "./02-toolchain/index.js";
import { phase as p03Configs } from "./03-configs/index.js";
import { phase as p04Robustness } from "./04-robustness/index.js";
import { phase as p05UtilityPkgs } from "./05-utility-pkgs/index.js";
import { phase as p06McpKit } from "./06-mcp-kit/index.js";
import { phase as p07SharedTypes } from "./07-shared-types/index.js";
import { phase as p08App } from "./08-app/index.js";
import { phase as p09RustAccel } from "./09-rust-accel/index.js";
import { phase as p10DocsReadme } from "./10-docs-readme/index.js";
import { phase as p11AgentFiles } from "./11-agent-files/index.js";
import { phase as p12CiRelease } from "./12-ci-release/index.js";

/**
 * Phase 13-cli-completions and 14-screenshots from the original plan are
 * intentionally absent — they're already covered by earlier phases:
 *   - 13-cli-completions: .usage.kdl ships in 08-app/lib/, mise tasks for
 *     completions/manpage/markdown ship in 02-toolchain/lib/mise.toml.
 *   - 14-screenshots: VHS .tape file ships in 08-app/lib/scripts/screenshots/,
 *     CI workflow ships in 12-ci-release/lib/.github/workflows/.
 *
 * Adding them as no-op phases would just add UI noise. The plan §4 dirs are
 * a planning artifact, not a strict 1:1 with shipped phases.
 */
export const PHASES: readonly Phase[] = [
  p01Bootstrap,
  p02Toolchain,
  p03Configs,
  p04Robustness,
  p05UtilityPkgs,
  p06McpKit,
  p07SharedTypes,
  p08App,
  p09RustAccel,
  p10DocsReadme,
  p11AgentFiles,
  p12CiRelease,
];
