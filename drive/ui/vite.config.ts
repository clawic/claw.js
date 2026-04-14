import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const BACKEND = process.env.DRIVE_BACKEND ?? "http://127.0.0.1:4620";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@shared": "/../src/shared",
    },
  },
  server: {
    port: 5290,
    proxy: {
      "/brand": {
        target: BACKEND,
        changeOrigin: true,
      },
      "/v1": {
        target: BACKEND,
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    exclude: ["@shared"],
  },
});
