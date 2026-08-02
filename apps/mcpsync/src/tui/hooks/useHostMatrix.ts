/**
 * Reads the canonical manifest + every detected host into the grid model, and
 * exposes a `reload()` so the App can re-read after an apply. All the I/O
 * (`readCanonical`, `detectedHosts`) lives here; `buildMatrix` stays pure.
 */

import { useCallback, useState } from "react";
import { readCanonical } from "../../core/canonical.js";
import { detectedHosts } from "../../core/hosts/index.js";
import type { McpServer } from "../../core/schema.js";
import { buildMatrix, type GridMatrix } from "../model.js";

export interface HostMatrixState {
  matrix: GridMatrix;
  /** The canonical set, so the App can resolve a server for `applyServer`. */
  canonical: Record<string, McpServer>;
  /** Re-read canonical + hosts from disk (call after a write). */
  reload(): void;
}

export function useHostMatrix(config?: string | undefined): HostMatrixState {
  const read = useCallback(() => {
    const canonical = readCanonical(config);
    return { canonical, matrix: buildMatrix(canonical, detectedHosts()) };
  }, [config]);

  const [state, setState] = useState(read);
  const reload = useCallback(() => setState(read()), [read]);

  return { matrix: state.matrix, canonical: state.canonical, reload };
}
