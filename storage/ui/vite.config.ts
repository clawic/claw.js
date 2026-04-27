import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const BACKEND = process.env.STORAGE_BACKEND ?? "http://127.0.0.1:47632";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5390,
    proxy: {
      "/v1/storage": { target: BACKEND, changeOrigin: true },
      "/shared/storage": { target: BACKEND, changeOrigin: true },
    },
  },
});
