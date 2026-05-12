import { builtinModules } from "node:module";
import { resolve } from "node:path";
import banner from "rollup-plugin-banner2";
import { defineConfig } from "vite";

/**
 * Vite library-mode build with three entry points.
 *
 *   src/index.ts       → dist/index.js     (MCP server, also a bin)
 *   src/cli.ts         → dist/cli.js       (Commander bin)
 *   src/tui/index.tsx  → dist/tui.js       (Ink TUI bin)
 *
 * All three get a `#!/usr/bin/env node` shebang via rollup-plugin-banner2
 * so they're directly executable when symlinked into `node_modules/.bin`.
 *
 * Externals: every dependency stays an `import` in the built output —
 * Node will resolve them at runtime. We never bundle our own packages
 * (workspace:*) or the SDK; users get the source-level tree.
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
        tui: resolve(__dirname, "src/tui/index.tsx"),
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: [
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
        /^@george43g\//,
        /^@modelcontextprotocol\//,
        "commander",
        "fullscreen-ink",
        "ink",
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
          // Shebang on bin entries only (the three named entries) so other
          // chunks aren't accidentally marked executable.
          if (["index", "cli", "tui"].includes(chunk.name)) {
            return "#!/usr/bin/env node\n";
          }
          return undefined;
        }),
      ],
    },
  },
});
