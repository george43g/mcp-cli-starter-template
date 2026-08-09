/**
 * Terminal size hook — current rows/columns, re-read on SIGWINCH.
 *
 * Ink itself only re-renders on resize; it does not hand the component the
 * new dimensions, so anything that has to compute a scroll window (see
 * `viewportRows`) needs this. Pair the two: `viewportRows(useTerminalSize().rows)`.
 *
 * Deliberately untested by render: `ink-testing-library`'s fake stdout defines
 * `columns` as a getter with no setter and has no `rows` at all, so a test
 * render can neither seed a size nor emit a meaningful "resize". The size
 * arithmetic lives in `viewport.ts` precisely so it can be tested without one.
 */

import { useStdout } from "ink";
import { useEffect, useState } from "react";

export interface TerminalSize {
  rows: number;
  columns: number;
}

/** Standard VT100 geometry — what a non-TTY pipe gets. */
const FALLBACK: TerminalSize = { rows: 24, columns: 80 };

function read(stdout: NodeJS.WriteStream | undefined): TerminalSize {
  const rows = stdout?.rows;
  const columns = stdout?.columns;
  return {
    rows: rows !== undefined && rows > 0 ? rows : FALLBACK.rows,
    columns: columns !== undefined && columns > 0 ? columns : FALLBACK.columns,
  };
}

export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();
  const [size, setSize] = useState<TerminalSize>(() => read(stdout));

  useEffect(() => {
    if (!stdout) return;
    const onResize = () => setSize(read(stdout));
    // Re-read once on mount: fullscreen-ink switches to the alternate screen
    // after the first paint, which can change the reported row count.
    onResize();
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);

  return size;
}
