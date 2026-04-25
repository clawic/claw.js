import { defineConfig } from "vite";
import { resolve, dirname, isAbsolute } from "path";
import { readFileSync } from "fs";

function htmlInclude() {
  const INCLUDE_RE = /^[^\n]*<!--\s*@include\s+(\S+)\s*-->[^\n]*\n/gm;
  return {
    name: "html-include",
    enforce: "pre",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        const baseDir = ctx && ctx.filename ? dirname(ctx.filename) : __dirname;
        return html.replace(INCLUDE_RE, (_match, includePath) => {
          const full = isAbsolute(includePath) ? includePath : resolve(baseDir, includePath);
          return readFileSync(full, "utf8");
        });
      },
    },
  };
}

export default defineConfig({
  root: ".",
  publicDir: "../public",
  plugins: [htmlInclude()],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
      },
    },
  },
});
