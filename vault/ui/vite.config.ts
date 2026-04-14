import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const BACKEND = process.env.VAULT_BACKEND ?? "http://127.0.0.1:4610";

export default defineConfig({
  base: "/static/",
  plugins: [react()],
  server: {
    port: 5200,
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
});
