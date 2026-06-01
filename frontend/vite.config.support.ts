import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// SOC – Support Operations Center Vite config
// Completely separate from OCC (vite.config.ts)
export default defineConfig({
  plugins: [react()],

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
