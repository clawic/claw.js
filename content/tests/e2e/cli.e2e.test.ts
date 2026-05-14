import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { startContentServer } from "./helpers.ts";

const execFileAsync = promisify(execFile);
const servers: Array<Awaited<ReturnType<typeof startContentServer>>> = [];
let contentDistCli = "";
let clawBin = "";

before(async () => {
  const repoRoot = path.resolve(process.cwd(), "..");
  await execFileAsync("npm", ["run", "build"], { cwd: process.cwd() });
  await execFileAsync("npm", ["run", "build:packages"], { cwd: repoRoot });
  contentDistCli = path.join(process.cwd(), "dist", "cli.js");
  clawBin = path.join(repoRoot, "packages", "clawjs", "bin", "claw.mjs");
});

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (server) await server.close();
  }
});

async function boot() {
  const server = await startContentServer("content-cli");
  servers.push(server);
  return server;
}

function parseClawJsonData<T>(stdout: string): T {
  const payload = JSON.parse(stdout) as { ok?: boolean; data?: T };
  assert.equal(payload.ok, true);
  assert.ok(payload.data);
  return payload.data;
}

test("dedicated CLI and claw bridge hit the same content service", async () => {
  const server = await boot();

  const login = await execFileAsync("node", [
    contentDistCli,
    "login",
    "--url",
    server.baseUrl,
    "--email",
    "admin@content.local",
    "--password",
    "content-admin",
    "--json",
  ], { cwd: process.cwd() });
  const token = (JSON.parse(login.stdout) as { accessToken: string }).accessToken;
  assert.ok(token);

  const brand = await execFileAsync("node", [
    contentDistCli,
    "brand",
    "create",
    "--url",
    server.baseUrl,
    "--token",
    token,
    "--name",
    "CLI Brand",
    "--json",
  ], { cwd: process.cwd() });
  const brandId = (JSON.parse(brand.stdout) as { brand: { id: string } }).brand.id;

  const destination = await execFileAsync("node", [
    contentDistCli,
    "destination",
    "create",
    "--url",
    server.baseUrl,
    "--token",
    token,
    "--brand",
    brandId,
    "--name",
    "CLI Webhook",
    "--kind",
    "webhook",
    "--policy",
    "autopublish",
    "--json",
  ], { cwd: process.cwd() });
  const destinationId = (JSON.parse(destination.stdout) as { destination: { id: string } }).destination.id;

  const entry = await execFileAsync("node", [
    contentDistCli,
    "entry",
    "create",
    "--url",
    server.baseUrl,
    "--token",
    token,
    "--brand",
    brandId,
    "--title",
    "CLI entry",
    "--body",
    "CLI body",
    "--json",
  ], { cwd: process.cwd() });
  const entryId = (JSON.parse(entry.stdout) as { entry: { id: string } }).entry.id;

  const generated = await execFileAsync("node", [
    contentDistCli,
    "entry",
    "generate-variants",
    "--url",
    server.baseUrl,
    "--token",
    token,
    "--id",
    entryId,
    "--destinations",
    destinationId,
    "--json",
  ], { cwd: process.cwd() });
  const variantId = (JSON.parse(generated.stdout) as { variants: Array<{ id: string }> }).variants[0]!.id;

  const plan = await execFileAsync("node", [
    clawBin,
    "content",
    "publish",
    "plan-create",
    "--url",
    server.baseUrl,
    "--token",
    token,
    "--variant",
    variantId,
    "--json",
  ], {
    cwd: path.resolve(process.cwd(), ".."),
    env: {
      ...process.env,
      CLAW_PUBLISHING_DIR: process.cwd(),
    },
  });
  const planId = parseClawJsonData<{ plan: { id: string } }>(plan.stdout).plan.id;

  const run = await execFileAsync("node", [
    clawBin,
    "content",
    "publish",
    "run",
    "--url",
    server.baseUrl,
    "--token",
    token,
    "--id",
    planId,
    "--json",
  ], {
    cwd: path.resolve(process.cwd(), ".."),
    env: {
      ...process.env,
      CLAW_PUBLISHING_DIR: process.cwd(),
    },
  });
  assert.equal(parseClawJsonData<{ run: { status: string } }>(run.stdout).run.status, "succeeded");
});
