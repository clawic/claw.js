import { afterEach, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { test } from "node:test";

import { startDatabaseServer } from "./helpers.ts";

const execFileAsync = promisify(execFile);
const servers: Array<Awaited<ReturnType<typeof startDatabaseServer>>> = [];
let databaseDistCli = "";
let clawBin = "";

before(async () => {
  const repoRoot = path.resolve(process.cwd(), "..");
  await execFileAsync("npm", ["run", "build"], { cwd: process.cwd() });
  await execFileAsync("npm", ["run", "build:packages"], { cwd: repoRoot });
  databaseDistCli = path.join(process.cwd(), "dist", "cli.js");
  clawBin = path.join(repoRoot, "packages", "clawjs", "bin", "clawjs.mjs");
});

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (server) await server.close();
  }
});

async function boot() {
  const server = await startDatabaseServer("database-cli");
  servers.push(server);
  return server;
}

test("dedicated CLI and claw bridge hit the same database service", async () => {
  const server = await boot();

  const login = await execFileAsync("node", [
    databaseDistCli,
    "login",
    "--url",
    server.baseUrl,
    "--email",
    "admin@database.local",
    "--password",
    "database-admin",
    "--json",
  ], { cwd: process.cwd() });
  const loginPayload = JSON.parse(login.stdout) as { accessToken: string };
  assert.ok(loginPayload.accessToken);

  await execFileAsync("node", [
    databaseDistCli,
    "namespace",
    "create",
    "--url",
    server.baseUrl,
    "--token",
    loginPayload.accessToken,
    "--id",
    "test-sales",
    "--display-name",
    "Test Sales",
    "--json",
  ], { cwd: process.cwd() });

  await execFileAsync("node", [
    databaseDistCli,
    "collection",
    "create",
    "--url",
    server.baseUrl,
    "--token",
    loginPayload.accessToken,
    "--namespace",
    "test-sales",
    "--name",
    "partner_accounts",
    "--fields",
    JSON.stringify([{ name: "name", type: "text", required: true }]),
    "--json",
  ], { cwd: process.cwd() });

  await execFileAsync("node", [
    databaseDistCli,
    "record",
    "create",
    "--url",
    server.baseUrl,
    "--token",
    loginPayload.accessToken,
    "--namespace",
    "test-sales",
    "--collection",
    "partner_accounts",
    "--data",
    JSON.stringify({ name: "Acme" }),
    "--json",
  ], { cwd: process.cwd() });

  const listed = await execFileAsync("node", [
    clawBin,
    "database",
    "record",
    "list",
    "--url",
    server.baseUrl,
    "--token",
    loginPayload.accessToken,
    "--namespace",
    "test-sales",
    "--collection",
    "partner_accounts",
    "--json",
  ], {
    cwd: path.resolve(process.cwd(), ".."),
    env: {
      ...process.env,
      CLAW_DATABASE_DIR: process.cwd(),
    },
  });
  const listedPayload = JSON.parse(listed.stdout) as { total: number; items: Array<{ name: string }> };
  assert.equal(listedPayload.total, 1);
  assert.equal(listedPayload.items[0]?.name, "Acme");
});

test("claw db uses the same remote database service for built-ins and magic custom collections", async () => {
  const server = await boot();

  const login = await execFileAsync("node", [
    databaseDistCli,
    "login",
    "--url",
    server.baseUrl,
    "--email",
    "admin@database.local",
    "--password",
    "database-admin",
    "--json",
  ], { cwd: process.cwd() });
  const loginPayload = JSON.parse(login.stdout) as { accessToken: string };
  assert.ok(loginPayload.accessToken);

  const createdTask = await execFileAsync("node", [
    clawBin,
    "db",
    "task",
    "create",
    "Ship CLI",
    "--url",
    server.baseUrl,
    "--token",
    loginPayload.accessToken,
    "--json",
  ], {
    cwd: path.resolve(process.cwd(), ".."),
  });
  const createdTaskPayload = JSON.parse(createdTask.stdout) as { id: string; title: string; status: string };
  assert.equal(createdTaskPayload.title, "Ship CLI");
  assert.equal(createdTaskPayload.status, "todo");

  const createdLead = await execFileAsync("node", [
    clawBin,
    "db",
    "prospects",
    "create",
    "--url",
    server.baseUrl,
    "--token",
    loginPayload.accessToken,
    "--set",
    "name=Ada",
    "--set",
    "website=https://ada.dev",
    "--json",
  ], {
    cwd: path.resolve(process.cwd(), ".."),
  });
  const createdProspectPayload = JSON.parse(createdLead.stdout) as { title: string; metadata?: { website?: string } };
  assert.equal(createdProspectPayload.title, "Ada");
  assert.equal(createdProspectPayload.metadata?.website, "https://ada.dev");

  const listedTasks = await execFileAsync("node", [
    clawBin,
    "db",
    "tasks",
    "list",
    "--url",
    server.baseUrl,
    "--token",
    loginPayload.accessToken,
    "--json",
  ], {
    cwd: path.resolve(process.cwd(), ".."),
  });
  const listedTasksPayload = JSON.parse(listedTasks.stdout) as Array<{ id: string }>;
  assert.equal(listedTasksPayload.some((item) => item.id === createdTaskPayload.id), true);

  const listedLeads = await execFileAsync("node", [
    clawBin,
    "database",
    "record",
    "list",
    "--url",
    server.baseUrl,
    "--token",
    loginPayload.accessToken,
    "--namespace",
    "main",
    "--collection",
    "prospects",
    "--json",
  ], {
    cwd: path.resolve(process.cwd(), ".."),
  });
  const listedProspectsPayload = JSON.parse(listedLeads.stdout) as { total: number; items: Array<{ title: string; metadata?: { website?: string } }> };
  assert.equal(listedProspectsPayload.total, 1);
  assert.equal(listedProspectsPayload.items[0]?.title, "Ada");
  assert.equal(listedProspectsPayload.items[0]?.metadata?.website, "https://ada.dev");
});

test("claw db remote human mode shows local-first style guidance, implicit create, and schema", async () => {
  const server = await boot();

  const login = await execFileAsync("node", [
    databaseDistCli,
    "login",
    "--url",
    server.baseUrl,
    "--email",
    "admin@database.local",
    "--password",
    "database-admin",
    "--json",
  ], { cwd: process.cwd() });
  const loginPayload = JSON.parse(login.stdout) as { accessToken: string };
  assert.ok(loginPayload.accessToken);

  const createdTask = await execFileAsync("node", [
    clawBin,
    "db",
    "task",
    "Ship CLI",
    "--url",
    server.baseUrl,
    "--token",
    loginPayload.accessToken,
  ], {
    cwd: path.resolve(process.cwd(), ".."),
  });
  assert.match(createdTask.stderr, /Using remote database at/);
  assert.match(createdTask.stdout, /Created task \S+ "Ship CLI"/);

  const createdLead = await execFileAsync("node", [
    clawBin,
    "db",
    "prospects",
    "--url",
    server.baseUrl,
    "--token",
    loginPayload.accessToken,
    "--set",
    "name=Ada",
  ], {
    cwd: path.resolve(process.cwd(), ".."),
  });
  assert.match(createdLead.stderr, /Created collection "prospects"/);
  assert.match(createdLead.stderr, /Mapped "name" to "title"/);
  assert.match(createdLead.stdout, /Created prospect \S+ "Ada"/);

  const schema = await execFileAsync("node", [
    clawBin,
    "db",
    "prospects",
    "schema",
    "--url",
    server.baseUrl,
    "--token",
    loginPayload.accessToken,
    "--json",
  ], {
    cwd: path.resolve(process.cwd(), ".."),
  });
  const schemaPayload = JSON.parse(schema.stdout) as { exists: boolean; collection: { name: string; fields: Array<{ name: string }> } };
  assert.equal(schemaPayload.exists, true);
  assert.equal(schemaPayload.collection.name, "prospects");
  assert.equal(schemaPayload.collection.fields.some((field) => field.name === "title"), true);
});
