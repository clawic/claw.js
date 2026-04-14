import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";

function copyFontsPlugin() {
  return {
    name: "copy-fonts",
    buildStart() {
      const repoFonts = path.resolve(__dirname, "../../public/fonts");
      const outFonts = path.resolve(__dirname, "public/fonts");
      for (const family of ["source-sans-3", "ubuntu-mono"]) {
        const src = path.join(repoFonts, family);
        const dest = path.join(outFonts, family);
        mkdirSync(dest, { recursive: true });
        for (const f of readdirSync(src)) {
          copyFileSync(path.join(src, f), path.join(dest, f));
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyFontsPlugin()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    proxy: {
      "/v1": "http://127.0.0.1:4650",
      "/brand": "http://127.0.0.1:4650",
      "/docs": "http://127.0.0.1:4650",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
