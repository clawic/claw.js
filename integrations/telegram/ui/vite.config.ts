import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const BACKEND = process.env.CLAW_TELEGRAM_BACKEND ?? "http://127.0.0.1:24150";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5290,
    proxy: {
      "/v1": {
        target: BACKEND,
        changeOrigin: true,
      },
    },
  },
});
