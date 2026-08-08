import { builtinModules } from "node:module";
import { resolve } from "node:path";
import banner from "rollup-plugin-banner2";
import { defineConfig } from "vite";

/**
 * Vite library-mode build with two entry points.
 *
 *   src/index.ts   → dist/index.js   (library — applyServer/HOSTS/readCanonical/schema)
 *   src/cli.ts     → dist/cli.js     (the single bin — subcommands: doctor/list/apply/tui/…)
 *
 * The TUI is loaded by cli.ts via dynamic `await import("./tui/index.js")` —
 * vite chunks it into dist/ automatically; ink/react stay external.
 *
 * Shebang is added only to dist/cli.js. dist/index.js is a plain library file.
 *
 * PUBLISH SHAPE: the workspace kits (@george43g/cli-kit, tui-kit) — NOTE: both
 * are now PUBLISHED, so this bundling is legacy; see DEFERRED #10 step 2
 * are BUNDLED into dist (they are devDependencies — consumers never install
 * them). Everything with a published home stays an external `import` and a
 * real dependency: @george43g/robustness (npm), the kits' own runtime deps
 * (cli-table3, picocolors), and commander/zod/ink/react/fullscreen-ink.
 */
export default defineConfig({
  build: {
    target: "node22",
    outDir: "dist",
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        cli: resolve(__dirname, "src/cli.ts"),
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: [
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
        "@george43g/robustness",
        "cli-table3",
        "commander",
        "fullscreen-ink",
        "ink",
        "picocolors",
        "react",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "zod",
      ],
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name]-[hash].js",
      },
      plugins: [
        banner((chunk) => {
          if (chunk.name === "cli") return "#!/usr/bin/env node\n";
          return undefined;
        }),
      ],
    },
  },
});
