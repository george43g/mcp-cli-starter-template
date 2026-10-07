import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

/**
 * The single-file browser build: `dist/keymap.iife.js`, global `GeorgeKeymap`.
 *
 * Runs AFTER `tsc` (see the `build` script), so `emptyOutDir` must stay false
 * or it deletes the ESM entry and its declarations.
 *
 * Webviews vendor this file (wm-stack copies it under web/views/lib/) and check
 * it against `keymap.iife.js.sha256`, written here in `shasum -a 256` format so
 * `shasum -a 256 -c` verifies it directly. Target ES2022 because the source uses
 * `Object.hasOwn` and `Array.prototype.at` (Safari 15.4+). Unminified: a vendored
 * copy is read in diffs.
 */
const FILE = "keymap.iife.js";

function sha256File(): Plugin {
  return {
    name: "keymap-iife-sha256",
    writeBundle(options) {
      const dir = options.dir ?? resolve(__dirname, "dist");
      const hash = createHash("sha256")
        .update(readFileSync(resolve(dir, FILE)))
        .digest("hex");
      writeFileSync(resolve(dir, `${FILE}.sha256`), `${hash}  ${FILE}\n`);
    },
  };
}

export default defineConfig({
  plugins: [sha256File()],
  build: {
    outDir: "dist",
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
    target: "es2022",
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "GeorgeKeymap",
      formats: ["iife"],
      fileName: () => FILE,
    },
  },
});
