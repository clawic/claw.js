// @ts-nocheck
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

import type { CliContext } from "./index.ts";
import { runEmbeddedDatabaseCli } from "./database-advanced.ts";
import { CLI_EXIT_FAILURE } from "./cli-errors.ts";

function resolveDatabaseDirectory(flags: Record<string, string>, contextCwd: string): string {
  if (flags["database-dir"]) {
    return path.resolve(contextCwd, flags["database-dir"]);
  }
  if (process.env.CLAW_DATABASE_DIR?.trim()) {
    return path.resolve(process.env.CLAW_DATABASE_DIR);
  }
  return path.resolve(fileURLToPath(new URL("../../../database", import.meta.url)));
}

function resolveIotDirectory(flags: Record<string, string>, contextCwd: string): string {
  if (flags["iot-dir"]) {
    return path.resolve(contextCwd, flags["iot-dir"]);
  }
  if (process.env.CLAW_IOT_DIR?.trim()) {
    return path.resolve(process.env.CLAW_IOT_DIR);
  }
  return path.resolve(fileURLToPath(new URL("../../../iot", import.meta.url)));
}

function resolveErpDirectory(flags: Record<string, string>, contextCwd: string): string {
  if (flags["erp-dir"]) {
    return path.resolve(contextCwd, flags["erp-dir"]);
  }
  if (process.env.CLAW_ERP_DIR?.trim()) {
    return path.resolve(process.env.CLAW_ERP_DIR);
  }
  return path.resolve(fileURLToPath(new URL("../../../erp", import.meta.url)));
}

function resolveContentDirectory(flags: Record<string, string>, contextCwd: string): string {
  if (flags["content-dir"]) {
    return path.resolve(contextCwd, flags["content-dir"]);
  }
  if (process.env.CLAW_PUBLISHING_DIR?.trim()) {
    return path.resolve(process.env.CLAW_PUBLISHING_DIR);
  }
  return path.resolve(fileURLToPath(new URL("../../../content", import.meta.url)));
}

export async function runDelegatedDatabaseCli(
  argv: string[],
  flags: Record<string, string>,
  context: CliContext,
): Promise<number> {
  if (!flags["database-dir"] && !process.env.CLAW_DATABASE_DIR?.trim()) {
    return await runEmbeddedDatabaseCli({
      argv: argv.slice(1),
      flags,
      stdout: context.stdout,
      stderr: context.stderr,
    });
  }
  const databaseDir = resolveDatabaseDirectory(flags, context.cwd);
  if (!fs.existsSync(path.join(databaseDir, "package.json"))) {
    context.stderr.write(`Database CLI not found at ${databaseDir}\n`);
    return CLI_EXIT_FAILURE;
  }

  const distCliPath = path.join(databaseDir, "dist", "cli.js");
  const command = fs.existsSync(distCliPath) ? process.execPath : "npm";
  const args = fs.existsSync(distCliPath)
    ? [distCliPath, ...argv.slice(1)]
    : ["--prefix", databaseDir, "run", "cli", "--silent", "--", ...argv.slice(1)];

  return await new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: context.cwd,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve(code ?? CLI_EXIT_FAILURE);
    });
  });
}

export async function runDelegatedIotCli(
  argv: string[],
  flags: Record<string, string>,
  context: CliContext,
): Promise<number> {
  const iotDir = resolveIotDirectory(flags, context.cwd);
  if (!fs.existsSync(path.join(iotDir, "package.json"))) {
    context.stderr.write(`IoT CLI not found at ${iotDir}\n`);
    return CLI_EXIT_FAILURE;
  }

  const distCliPath = path.join(iotDir, "dist", "cli.js");
  const command = fs.existsSync(distCliPath) ? process.execPath : "npm";
  const args = fs.existsSync(distCliPath)
    ? [distCliPath, ...argv.slice(1)]
    : ["--prefix", iotDir, "run", "cli", "--silent", "--", ...argv.slice(1)];

  return await new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: context.cwd,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve(code ?? CLI_EXIT_FAILURE);
    });
  });
}

export async function runDelegatedErpCli(
  argv: string[],
  flags: Record<string, string>,
  context: CliContext,
): Promise<number> {
  const erpDir = resolveErpDirectory(flags, context.cwd);
  if (!fs.existsSync(path.join(erpDir, "package.json"))) {
    context.stderr.write(`ERP CLI not found at ${erpDir}\n`);
    return CLI_EXIT_FAILURE;
  }

  const distCliPath = path.join(erpDir, "dist", "cli.js");
  const command = fs.existsSync(distCliPath) ? process.execPath : "npm";
  const args = fs.existsSync(distCliPath)
    ? [distCliPath, ...argv.slice(1)]
    : ["--prefix", erpDir, "run", "cli", "--silent", "--", ...argv.slice(1)];

  return await new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: context.cwd,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve(code ?? CLI_EXIT_FAILURE);
    });
  });
}

export async function runDelegatedContentCli(
  argv: string[],
  flags: Record<string, string>,
  context: CliContext,
): Promise<number> {
  const contentDir = resolveContentDirectory(flags, context.cwd);
  if (!fs.existsSync(path.join(contentDir, "package.json"))) {
    context.stderr.write(`Content CLI not found at ${contentDir}\n`);
    return CLI_EXIT_FAILURE;
  }

  const distCliPath = path.join(contentDir, "dist", "cli.js");
  const command = fs.existsSync(distCliPath) ? process.execPath : "npm";
  const args = fs.existsSync(distCliPath)
    ? [distCliPath, ...argv.slice(1)]
    : ["--prefix", contentDir, "run", "cli", "--silent", "--", ...argv.slice(1)];

  return await new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: context.cwd,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve(code ?? CLI_EXIT_FAILURE);
    });
  });
}
