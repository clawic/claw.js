import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.env.COMPANY_E2E_ROOT || path.join(process.cwd(), ".tmp", "playwright");
const appPort = process.env.COMPANY_E2E_APP_PORT || "4460";
const databasePort = process.env.COMPANY_E2E_DATABASE_PORT || "4516";

fs.rmSync(rootDir, { recursive: true, force: true });
fs.mkdirSync(rootDir, { recursive: true });

const databaseDataDir = path.join(rootDir, "database");
fs.mkdirSync(databaseDataDir, { recursive: true });
const rulesDir = path.join(rootDir, "rules");
fs.mkdirSync(rulesDir, { recursive: true });

function start(command, args, env) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  child.on("exit", (code) => {
    if (code !== 0) {
      process.exit(code ?? 1);
    }
  });
  return child;
}

async function waitFor(url, label) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 120_000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const database = start("npx", ["tsx", "../../database/src/bin/server.ts"], {
  DATABASE_HOST: "127.0.0.1",
  DATABASE_PORT: databasePort,
  DATABASE_DATA_DIR: databaseDataDir,
  DATABASE_DB_PATH: path.join(databaseDataDir, "clawjs.sqlite"),
  DATABASE_FILES_DIR: path.join(databaseDataDir, "files"),
  DATABASE_JWT_SECRET: "company-e2e-database-secret",
});

await waitFor(`http://127.0.0.1:${databasePort}/v1/health`, "database");

const app = start("npx", ["next", "start", "--port", appPort], {
  CLAW_DATABASE_URL: `http://127.0.0.1:${databasePort}`,
  CLAW_DATABASE_NAMESPACE: "main",
  CLAW_COMPANY_FAKE_AGENT_RUNS: "1",
  CLAW_RULES_DIR: rulesDir,
  NODE_ENV: "production",
});

await waitFor(`http://127.0.0.1:${appPort}/api/companies`, "company app");

const shutdown = () => {
  app.kill("SIGTERM");
  database.kill("SIGTERM");
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.stdin.resume();
