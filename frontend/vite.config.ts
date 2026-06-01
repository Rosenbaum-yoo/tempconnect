import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // OCC lebt unter /owner-control/
  base: "/owner-control/",

  root: ".",

  // Keine platform/public-Dateien in den OCC-Build kopieren
  publicDir: false,

  build: {
    outDir: "owner-control",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // "index" → output wird index.html (nginx erwartet das für Deep-Links)
        index: resolve(__dirname, "occ.html"),
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
      "@occ": resolve(__dirname, "src/owner-control"),
    },
  },

  server: {
    port: 5173,
    // Dev: API-Proxy auf lokale API
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
