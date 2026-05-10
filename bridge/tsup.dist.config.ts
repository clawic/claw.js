import { defineConfig } from "tsup";

// Config used by scripts/build-tarball.sh to bundle the daemon for
// distribution. The default `npm run build` keeps the lighter config in
// package.json (just `tsup src/bin/start.ts --format esm ...`). This config
// bundles everything except native addons.
export default defineConfig({
  entry: ["src/bin/start.ts"],
  format: ["cjs"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  outExtension: () => ({ js: ".cjs" }),
  noExternal: [/^@clawjs\//, /^fastify/, /^ws/, /^zod/, /^@noble\//, /^@fastify\//],
  external: ["better-sqlite3", "ssh2", "bufferutil", "utf-8-validate", "cpu-features"],
});
