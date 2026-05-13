import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const BACKEND = process.env.FEED_BACKEND ?? "http://127.0.0.1:4530";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5193,
    proxy: {
      "/v1": {
        target: BACKEND,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
