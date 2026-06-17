import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { renameSync, existsSync } from "fs";

// SOC – Support Operations Center Vite config
// Completely separate from OCC (vite.config.ts)
export default defineConfig({
  plugins: [
    react(),
    // Vite emittiert das HTML unter dem Quell-Dateinamen (support.html). Nginx
    // (/support-ops/ -> index.html) und scripts/sync-support-ops-artifacts.sh
    // erwarten aber index.html -> nach dem Build umbenennen.
    {
      name: "soc-html-as-index",
      writeBundle() {
        const dir = resolve(__dirname, "support-ops");
        const src = resolve(dir, "support.html");
        const dst = resolve(dir, "index.html");
        if (existsSync(src)) renameSync(src, dst);
      },
    },
  ],

  // SOC lives under /support-ops/
  base: "/support-ops/",

  root: ".",

  // No platform/public files in SOC build
  publicDir: false,

  build: {
    outDir: "support-ops",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "support.html"),
      },
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
    sourcemap: false,
    chunkSizeWarningLimit: 600,
  },

  resolve: {
    alias: {
      "@soc": resolve(__dirname, "src/support"),
    },
  },

  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
