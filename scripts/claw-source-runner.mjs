#!/usr/bin/env node
import { runCli } from "../packages/clawjs/src/index.ts";

const exitCode = await runCli(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  cwd: process.cwd(),
  binName: "claw",
});

process.exitCode = exitCode;
