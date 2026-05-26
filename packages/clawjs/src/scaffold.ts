import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { applySourceModeToProject, resolveSourceModeStatus } from "./source-mode.ts";

export type SupportedPackageManager = "npm" | "pnpm";

export interface ScaffoldContext {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  cwd: string;
  runCommand?: (command: string, args: string[], options: { cwd: string }) => Promise<void>;
}

export interface ScaffoldProjectOptions {
  context: ScaffoldContext;
  targetPath: string;
  templateDir: string;
  replacements: Record<string, string>;
  packageManager: SupportedPackageManager;
  install?: boolean;
  git?: boolean;
  sourceMode?: boolean;
  sourceRoot?: string;
  successLabel: string;
  nextSteps: string[];
  completionNote?: string;
}

export function detectPackageManager(): SupportedPackageManager {
  const userAgent = process.env.npm_config_user_agent ?? "";
  return userAgent.startsWith("pnpm/") ? "pnpm" : "npm";
}

export function createPackageName(value: string, fallback: string): string {
  const normalize = (candidate: string): string => candidate
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/[._/-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalize(value) || normalize(fallback) || "claw-project";
}

export function createTitle(value: string, fallback: string): string {
  const rendered = value
    .split(/[-_\s]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return rendered || fallback;
}

export function createPascalCase(value: string, fallback: string): string {
  const rendered = createTitle(value, fallback).replace(/\s+/g, "");
  return rendered || fallback;
}

function ensureTargetDirectory(targetPath: string): void {
  if (!fs.existsSync(targetPath)) return;

  const linkStat = fs.lstatSync(targetPath);
  if (linkStat.isSymbolicLink()) {
    throw new Error(`Target path must not be a symbolic link: ${targetPath}`);
  }

  const stat = fs.statSync(targetPath);
  if (!stat.isDirectory()) {
    throw new Error(`Target path already exists and is not a directory: ${targetPath}`);
  }

  const existingEntries = fs.readdirSync(targetPath);
  if (existingEntries.length > 0) {
    throw new Error(`Target directory is not empty: ${targetPath}`);
  }
}

function temporaryScaffoldPath(targetPath: string): string {
  return path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
}

function pathStaysInside(basePath: string, targetPath: string): boolean {
  const relative = path.relative(basePath, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function nearestExistingAncestor(targetPath: string): string {
  let current = path.resolve(targetPath);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

function assertTargetPathInsideCwd(cwd: string, targetPath: string): void {
  const basePath = path.resolve(cwd);
  const resolvedTarget = path.resolve(targetPath);
  if (!pathStaysInside(basePath, resolvedTarget)) {
    throw new Error(`Target path must stay inside the current workspace: ${targetPath}`);
  }

  const realBase = fs.realpathSync(basePath);
  const realAncestor = fs.realpathSync(nearestExistingAncestor(resolvedTarget));
  if (!pathStaysInside(realBase, realAncestor)) {
    throw new Error(`Target path must stay inside the current workspace: ${targetPath}`);
  }
}

async function copyTemplateDirectory(
  sourceDir: string,
  targetDir: string,
  replacements: Record<string, string>,
): Promise<void> {
  const entries = await fsp.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetName = entry.name === "gitignore" ? ".gitignore" : entry.name;
    const targetPath = path.join(targetDir, targetName);

    if (entry.isDirectory()) {
      await fsp.mkdir(targetPath, { recursive: true });
      await copyTemplateDirectory(sourcePath, targetPath, replacements);
      continue;
    }

    const raw = await fsp.readFile(sourcePath, "utf8");
    const rendered = Object.entries(replacements).reduce(
      (current, [token, value]) => current.replaceAll(token, value),
      raw,
    );
    await fsp.writeFile(targetPath, rendered, "utf8");
  }
}

async function runCommand(command: string, args: string[], options: { cwd: string }): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`));
    });
  });
}

function relativeStep(baseDir: string, targetDir: string): string | null {
  if (baseDir === targetDir) return null;
  return path.relative(baseDir, targetDir) || null;
}

export async function scaffoldProject(options: ScaffoldProjectOptions): Promise<{ createdPath: string }> {
  const install = options.install ?? true;
  const git = options.git ?? false;
  const exec = options.context.runCommand ?? runCommand;

  assertTargetPathInsideCwd(options.context.cwd, options.targetPath);
  ensureTargetDirectory(options.targetPath);
  fs.mkdirSync(path.dirname(options.targetPath), { recursive: true });
  const tempPath = temporaryScaffoldPath(options.targetPath);
  try {
    await fsp.mkdir(tempPath, { recursive: true });
    await copyTemplateDirectory(options.templateDir, tempPath, options.replacements);
    if (fs.existsSync(options.targetPath)) {
      ensureTargetDirectory(options.targetPath);
      fs.rmdirSync(options.targetPath);
    }
    await fsp.rename(tempPath, options.targetPath);
  } catch (error) {
    await fsp.rm(tempPath, { recursive: true, force: true });
    throw error;
  }

  const sourceStatus = resolveSourceModeStatus({
    cwd: options.context.cwd,
    sourceRoot: options.sourceRoot,
    requested: options.sourceMode,
    allowCheckout: false,
  });
  const sourceResult = applySourceModeToProject(options.targetPath, sourceStatus);

  if (install) {
    options.context.stdout.write(`Installing dependencies with ${options.packageManager}...\n`);
    await exec(options.packageManager, ["install"], { cwd: options.targetPath });
  }

  if (git) {
    options.context.stdout.write("Initializing git repository...\n");
    await exec("git", ["init"], { cwd: options.targetPath });
  }

  const cdStep = relativeStep(options.context.cwd, options.targetPath);
  options.context.stdout.write(`Created ${options.successLabel} at ${options.targetPath}\n`);
  options.context.stdout.write("Next steps:\n");
  if (cdStep) {
    options.context.stdout.write(`  cd ${cdStep}\n`);
  }
  if (!install) {
    options.context.stdout.write(`  ${options.packageManager} install\n`);
  }
  for (const step of options.nextSteps) {
    options.context.stdout.write(`  ${step}\n`);
  }
  if (sourceResult.applied) {
    options.context.stdout.write(`Source mode: ${sourceResult.packageNames.length} ClawJS package(s) resolve from ${sourceStatus.sourceRoot}\n`);
  }
  if (options.completionNote) {
    options.context.stdout.write("\n");
    options.context.stdout.write(`${options.completionNote}\n`);
  }

  return { createdPath: options.targetPath };
}
