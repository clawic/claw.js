import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

import { CliHandledError } from "./cli-errors.ts";
import { repoRootFromCliPackage } from "./cli-open-state.ts";
import type { OpenSurface } from "./cli-open-surfaces.ts";

export function ensureSurfaceBuild(surface: OpenSurface): void {
  if (!surface.dir || !surface.buildCheck) return;
  const repoRoot = repoRootFromCliPackage();
  const surfaceDir = path.join(repoRoot, surface.dir);
  if (!fs.existsSync(surfaceDir)) {
    throw new CliHandledError("dashboard_unavailable", `${surface.id} dashboard is not available in this installation.`);
  }
  if (fs.existsSync(path.join(surfaceDir, surface.buildCheck))) return;
  if (fs.existsSync(path.join(surfaceDir, "package.json")) && !fs.existsSync(path.join(surfaceDir, "node_modules"))) {
    const install = spawnSync("npm", ["--prefix", surfaceDir, "install"], {
      cwd: repoRoot,
      stdio: "ignore",
      env: {
        ...process.env,
        npm_config_audit: "false",
        npm_config_fund: "false",
      },
    });
    if (install.status !== 0) {
      throw new CliHandledError("dashboard_install_failed", `Failed to install ${surface.id} dashboard dependencies.`);
    }
  }
  const result = spawnSync("npm", ["--prefix", surfaceDir, "run", "build"], {
    cwd: repoRoot,
    stdio: "ignore",
    env: {
      ...process.env,
      npm_config_audit: "false",
      npm_config_fund: "false",
    },
  });
  if (result.status !== 0) {
    throw new CliHandledError("dashboard_build_failed", `Failed to build ${surface.id} dashboard.`);
  }
}

export function prepareOpenSurface(surface: OpenSurface, workspace: string): void {
  if (surface.kind !== "memory") return;
  if (fs.existsSync(path.join(workspace, ".memory"))) return;
  const repoRoot = repoRootFromCliPackage();
  const memoryCli = path.join(repoRoot, "memory", "dist", "cli.js");
  const result = spawnSync(process.execPath, [memoryCli, "init", "--dir", workspace], {
    cwd: workspace,
    stdio: "ignore",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new CliHandledError("dashboard_prepare_failed", "Failed to initialize memory dashboard workspace.");
  }
}

function cliBinPath(): string {
  const currentArgv = process.argv[1];
  if (currentArgv && fs.existsSync(currentArgv)) return currentArgv;
  const packagedBin = fileURLToPath(new URL("../bin/claw.mjs", import.meta.url));
  if (fs.existsSync(packagedBin)) return packagedBin;
  return fileURLToPath(import.meta.url);
}

export function buildSurfaceCommand(surface: OpenSurface, input: { host: string; port: number; workspace: string }): { command: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv } {
  const repoRoot = repoRootFromCliPackage();
  const surfaceDir = surface.dir ? path.join(repoRoot, surface.dir) : repoRoot;
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (surface.envHost) env[surface.envHost] = input.host;
  if (surface.envPort) env[surface.envPort] = String(input.port);

  if (surface.kind === "internal-database" || surface.kind === "internal-storage") {
    return {
      command: process.execPath,
      args: [
        cliBinPath(),
        "__open-server",
        surface.id,
        "--host",
        input.host,
        "--port",
        String(input.port),
        "--workspace",
        input.workspace,
      ],
      cwd: repoRoot,
      env,
    };
  }

  if (surface.kind === "memory") {
    return {
      command: process.execPath,
      args: [path.join(surfaceDir, "dist", "cli.js"), "serve", "--port", String(input.port)],
      cwd: input.workspace,
      env,
    };
  }

  if (surface.kind === "cli-serve") {
    return {
      command: process.execPath,
      args: [path.join(surfaceDir, "dist", "cli.js"), "serve", "--host", input.host, "--port", String(input.port)],
      cwd: surfaceDir,
      env,
    };
  }

  if (surface.kind === "server-script") {
    return {
      command: process.execPath,
      args: [path.join(surfaceDir, surface.script ?? "dist/server.js")],
      cwd: surfaceDir,
      env,
    };
  }

  if (surface.kind === "agenda") {
    return {
      command: process.execPath,
      args: [path.join(surfaceDir, "dist", "serve-dashboard.js"), "--port", String(input.port), "--root", input.workspace],
      cwd: surfaceDir,
      env,
    };
  }

  return {
    command: "npm",
    args: ["--prefix", surfaceDir, "exec", "--", "next", "start", "--hostname", input.host, "--port", String(input.port)],
    cwd: surfaceDir,
    env,
  };
}
