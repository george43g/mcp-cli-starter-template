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

export const PHASES: readonly Phase[] = [p01Bootstrap];
