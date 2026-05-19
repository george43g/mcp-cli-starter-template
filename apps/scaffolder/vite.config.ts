import { builtinModules } from "node:module";
import { resolve } from "node:path";
import banner from "rollup-plugin-banner2";
import { defineConfig } from "vite";

/**
 * Vite library-mode build — single bin entry.
 *
 *   bin/cli.ts → dist/cli.js   (shebang-prefixed, executable)
 *
 * Externals: builtins + all runtime deps. We never bundle commander,
 * inquirer, execa, etc.
 */
export default defineConfig({
  build: {
    target: "node22",
    outDir: "dist",
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    lib: {
      entry: { cli: resolve(__dirname, "bin/cli.ts") },
      formats: ["es"],
    },
    rollupOptions: {
      external: [
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
        "@inquirer/prompts",
        "commander",
        "execa",
        "kleur",
        "ora",
      ],
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name]-[hash].js",
      },
      plugins: [banner((chunk) => (chunk.name === "cli" ? "#!/usr/bin/env node\n" : undefined))],
    },
  },
});
