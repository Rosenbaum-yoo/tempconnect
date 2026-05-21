import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Staff Control Center – vollständig getrennte Vite-App.
// Kein Code-Sharing mit OCC (@occ) oder SOC (@soc).
// Nur für TempConnect-eigenes Team zugänglich.
export default defineConfig({
  plugins: [react()],

  // SCC lebt unter /staff/
  base: "/staff/",

  root: ".",
  publicDir: false,

  build: {
    // Ersetzt das bestehende vanilla-JS SCC
    outDir: "public/staff",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "staff.html"),
      },
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
    sourcemap: false,
    chunkSizeWarningLimit: 700,
  },

  resolve: {
    alias: {
      "@scc": resolve(__dirname, "src/staff"),
    },
  },

  server: {
    port: 5175,
    proxy: {
      "/staff/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
