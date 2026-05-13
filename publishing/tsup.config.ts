import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/bin/server.ts", "src/bin/cli.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
});
