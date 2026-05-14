import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const docPath = path.join(rootDir, "docs", "persistent-surface.md");
const generated = execFileSync(
  process.execPath,
  [
    "--import",
    "tsx",
    "--input-type=module",
    "--eval",
    `
      import { runCli } from "./packages/clawjs/src/index.ts";
      let output = "";
      const stream = { write(chunk) { output += chunk; return true; } };
      const code = await runCli(["inspect", "render", "--format", "markdown"], {
        stdout: stream,
        stderr: process.stderr,
        cwd: process.cwd(),
      });
      if (code !== 0) process.exit(code);
      process.stdout.write(output);
    `,
  ],
  { cwd: rootDir, encoding: "utf8" },
);

const current = fs.readFileSync(docPath, "utf8");
if (current !== generated) {
  console.error("docs/persistent-surface.md is stale. Regenerate it with `claw inspect render --format markdown`.");
  process.exit(1);
}

console.log("persistent surface docs check passed");
