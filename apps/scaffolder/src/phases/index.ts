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

export const PHASES: readonly Phase[] = [
  p01Bootstrap,
  p02Toolchain,
  p03Configs,
  p04Robustness,
  p05UtilityPkgs,
  p06McpKit,
  p07SharedTypes,
];
