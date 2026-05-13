import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { startErpServer } from "./helpers.ts";

const execFileAsync = promisify(execFile);
const servers: Array<Awaited<ReturnType<typeof startErpServer>>> = [];
let erpDistCli = "";
let clawBin = "";

before(async () => {
  const repoRoot = path.resolve(process.cwd(), "..");
  await execFileAsync("npm", ["run", "build"], { cwd: process.cwd() });
  await execFileAsync("npm", ["run", "build:packages"], { cwd: repoRoot });
  erpDistCli = path.join(process.cwd(), "dist", "cli.js");
  clawBin = path.join(repoRoot, "packages", "clawjs", "bin", "clawjs.mjs");
});

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (server) await server.close();
  }
});

async function boot() {
  const server = await startErpServer("erp-cli");
  servers.push(server);
  return server;
}

test("dedicated CLI and claw bridge hit the same erp service", async () => {
  const server = await boot();

  const login = await execFileAsync("node", [
    erpDistCli,
    "login",
    "--url",
    server.baseUrl,
    "--email",
    "admin@erp.local",
    "--password",
    "erp-admin",
    "--json",
  ], { cwd: process.cwd() });
  const token = (JSON.parse(login.stdout) as { accessToken: string }).accessToken;
  assert.ok(token);

  const bootstrap = await execFileAsync("node", [
    erpDistCli,
    "tenant",
    "bootstrap",
    "--url",
    server.baseUrl,
    "--token",
    token,
    "--name",
    "CLI ERP",
    "--pack",
    "es_eu",
    "--json",
  ], { cwd: process.cwd() });
  const bootstrapPayload = JSON.parse(bootstrap.stdout) as {
    tenant: { id: string };
    legalEntity: { id: string };
    branch: { id: string };
  };
  const tenantId = bootstrapPayload.tenant.id;
  const legalEntityId = bootstrapPayload.legalEntity.id;
  const branchId = bootstrapPayload.branch.id;

  await execFileAsync("node", [
    erpDistCli,
    "ar",
    "invoice-create",
    "--url",
    server.baseUrl,
    "--token",
    token,
    "--tenant",
    tenantId,
    "--entity",
    legalEntityId,
    "--branch",
    branchId,
    "--customer",
    "CLI Customer",
    "--amount",
    "120000",
    "--json",
  ], { cwd: process.cwd() });

  const dashboard = await execFileAsync("node", [
    clawBin,
    "erp",
    "reports",
    "dashboard",
    "--url",
    server.baseUrl,
    "--token",
    token,
    "--tenant",
    tenantId,
    "--entity",
    legalEntityId,
    "--json",
  ], {
    cwd: path.resolve(process.cwd(), ".."),
    env: {
      ...process.env,
      CLAW_ERP_DIR: process.cwd(),
    },
  });
  const dashboardPayload = JSON.parse(dashboard.stdout) as { metrics: { revenueCents: number } };
  assert.equal(dashboardPayload.metrics.revenueCents, 120000);
});
