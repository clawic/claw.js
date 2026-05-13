import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const BACKEND = process.env.CLAW_DRIVE_BACKEND ?? "http://127.0.0.1:24104";

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
