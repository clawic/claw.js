import fs from "node:fs";
import path from "node:path";

import { runCli } from "../cli/parser.ts";

async function main() {
  const exitCode = await runCli(process.argv.slice(2), {
    stdout: process.stdout,
    stderr: process.stderr,
    readFile: (p: string) => fs.readFileSync(p, "utf8"),
    fileExists: (p: string) => fs.existsSync(p),
    resolveCwd: (p: string) => path.resolve(process.cwd(), p),
  });
  process.exit(exitCode);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
