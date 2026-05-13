import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "execution-plane-ui-"));
const repoDir = path.join(tmpDir, "repo");
fs.mkdirSync(repoDir, { recursive: true });
fs.writeFileSync(path.join(repoDir, "README.md"), "# execution-plane ui\n");
execFileSync("git", ["init", "-b", "main"], { cwd: repoDir });
execFileSync("git", ["config", "user.email", "tests@local"], { cwd: repoDir });
execFileSync("git", ["config", "user.name", "Execution UI Tests"], { cwd: repoDir });
execFileSync("git", ["add", "."], { cwd: repoDir });
execFileSync("git", ["commit", "-m", "chore(repo): seed"], { cwd: repoDir });

const commonEnv = {
  ...process.env,
  EXECUTION_PLANE_HOST: "127.0.0.1",
  EXECUTION_PLANE_PORT: "4710",
  EXECUTION_PLANE_PUBLIC_BASE_URL: "http://127.0.0.1:4710",
  EXECUTION_PLANE_DATA_DIR: path.join(tmpDir, "data"),
  EXECUTION_PLANE_DB_FILE: path.join(tmpDir, "data", "infra.sqlite"),
  EXECUTION_PLANE_DEPLOYMENTS_DIR: path.join(tmpDir, "deployments"),
  EXECUTION_PLANE_DEMO_REPO: repoDir,
  EXECUTION_PLANE_WORKER_SECRET: "execution-plane-worker-secret",
};

const server = spawn(process.execPath, ["dist/server.js"], {
  cwd: process.cwd(),
  env: commonEnv,
  stdio: "inherit",
});

const worker = spawn(process.execPath, ["dist/worker.js"], {
  cwd: process.cwd(),
  env: {
    ...commonEnv,
    EXECUTION_PLANE_URL: "http://127.0.0.1:4710",
    EXECUTION_PLANE_TENANT_ID: "demo-tenant",
    EXECUTION_PLANE_WORKER_ID: "ui-worker",
    EXECUTION_PLANE_WORKSPACE_ROOT: path.join(tmpDir, "worker"),
  },
  stdio: "inherit",
});

function shutdown() {
  worker.kill("SIGTERM");
  server.kill("SIGTERM");
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
server.on("exit", () => process.exit(0));
worker.on("exit", () => undefined);
