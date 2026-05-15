import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import WebSocket from "ws";

import { DatabaseServiceStore } from "../../src/server/db.ts";
import { startDatabaseServer } from "./helpers.ts";

const servers: Array<Awaited<ReturnType<typeof startDatabaseServer>>> = [];

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (server) await server.close();
  }
});

async function boot() {
  const server = await startDatabaseServer("database-backend");
  servers.push(server);
  const login = await fetch(`${server.baseUrl}/v1/auth/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@database.local", password: "database-admin" }),
  });
  assert.equal(login.status, 200);
  const auth = await login.json() as { accessToken: string };
  return {
    ...server,
    adminToken: auth.accessToken,
  };
}

function authHeaders(token: string) {
  return {
    authorization: `Bearer ${token}`,
  };
}

test("shared brand assets and fonts are served from repo assets and referenced by the admin console html", async () => {
  const server = await boot();
  const sharedAssetsDir = path.resolve(process.cwd(), "..", "assets");

  const indexResponse = await fetch(`${server.baseUrl}/`);
  assert.equal(indexResponse.status, 200);
  const indexHtml = await indexResponse.text();
  assert.match(indexHtml, /href="\/brand\/favicon\.ico"/);
  assert.match(indexHtml, /src="\/brand\/logo\.png"/);

  const cssResponse = await fetch(`${server.baseUrl}/static/app.css`);
  assert.equal(cssResponse.status, 200);
  const cssText = await cssResponse.text();
  assert.match(cssText, /\/brand\/fonts\/source-sans-3\/source-sans-3-v18-cyrillic_latin_latin-ext-regular\.woff2/);

  const logoResponse = await fetch(`${server.baseUrl}/brand/logo.png`);
  assert.equal(logoResponse.status, 200);
  assert.deepEqual(
    Buffer.from(await logoResponse.arrayBuffer()),
    fs.readFileSync(path.join(sharedAssetsDir, "logo.png")),
  );

  const faviconResponse = await fetch(`${server.baseUrl}/brand/favicon.ico`);
  assert.equal(faviconResponse.status, 200);
  assert.deepEqual(
    Buffer.from(await faviconResponse.arrayBuffer()),
    fs.readFileSync(path.join(sharedAssetsDir, "favicon.ico")),
  );

  const fontResponse = await fetch(`${server.baseUrl}/brand/fonts/source-sans-3/source-sans-3-v18-cyrillic_latin_latin-ext-regular.woff2`);
  assert.equal(fontResponse.status, 200);
  assert.deepEqual(
    Buffer.from(await fontResponse.arrayBuffer()),
    fs.readFileSync(path.join(sharedAssetsDir, "fonts", "source-sans-3", "source-sans-3-v18-cyrillic_latin_latin-ext-regular.woff2")),
  );
});

test("namespace creation seeds protected built-ins and custom schemas keep index metadata", async () => {
  const server = await boot();

  const created = await fetch(`${server.baseUrl}/v1/namespaces`, {
    method: "POST",
    headers: {
      ...authHeaders(server.adminToken),
      "content-type": "application/json",
    },
    body: JSON.stringify({ id: "test-crm", displayName: "Test CRM" }),
  });
  assert.equal(created.status, 201);

  const collectionsResponse = await fetch(`${server.baseUrl}/v1/namespaces/test-crm/collections`, {
    headers: authHeaders(server.adminToken),
  });
  const collectionsPayload = await collectionsResponse.json() as { items: Array<{ name: string; protected: boolean }> };
  const collectionNames = collectionsPayload.items.map((item) => item.name);
  for (const expected of [
    "people",
    "tasks",
    "goals",
    "projects",
    "events",
    "reminders",
    "deadlines",
    "notes",
    "portfolios",
    "portfolio_items",
    "releases",
    "operational_checks",
    "operational_incidents",
    "feedback_items",
    "metric_snapshots",
    "import_batches",
  ]) {
    assert.ok(collectionNames.includes(expected), `missing built-in collection ${expected}`);
  }
  assert.equal(collectionsPayload.items.find((item) => item.name === "people")?.protected, true);
  assert.equal(collectionsPayload.items.find((item) => item.name === "portfolios")?.protected, true);

  const goalsCollection = await fetch(`${server.baseUrl}/v1/namespaces/test-crm/collections/goals`, {
    headers: authHeaders(server.adminToken),
  });
  assert.equal(goalsCollection.status, 200);
  const goalsPayload = await goalsCollection.json() as { fields: Array<{ name: string }> };
  assert.ok(goalsPayload.fields.some((field) => field.name === "parentId"));
  assert.ok(goalsPayload.fields.some((field) => field.name === "parentGoalId"));
  assert.ok(goalsPayload.fields.some((field) => field.name === "portfolioId"));
  assert.ok(goalsPayload.fields.some((field) => field.name === "portfolioItemId"));
  assert.ok(goalsPayload.fields.some((field) => field.name === "metricKey"));

  const remindersCollection = await fetch(`${server.baseUrl}/v1/namespaces/test-crm/collections/reminders`, {
    headers: authHeaders(server.adminToken),
  });
  assert.equal(remindersCollection.status, 200);
  const remindersPayload = await remindersCollection.json() as { fields: Array<{ name: string }> };
  assert.ok(remindersPayload.fields.some((field) => field.name === "triggerAt"));
  assert.ok(remindersPayload.fields.some((field) => field.name === "anchorType"));

  const deadlinesCollection = await fetch(`${server.baseUrl}/v1/namespaces/test-crm/collections/deadlines`, {
    headers: authHeaders(server.adminToken),
  });
  assert.equal(deadlinesCollection.status, 200);
  const deadlinesPayload = await deadlinesCollection.json() as { fields: Array<{ name: string }> };
  assert.ok(deadlinesPayload.fields.some((field) => field.name === "dueAt"));
  assert.ok(deadlinesPayload.fields.some((field) => field.name === "anchorId"));

  const customCollection = await fetch(`${server.baseUrl}/v1/namespaces/test-crm/collections`, {
    method: "POST",
    headers: {
      ...authHeaders(server.adminToken),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: "prospects",
      displayName: "Prospects",
      fields: [
        { name: "name", type: "text", required: true },
        { name: "status", type: "select", options: ["new", "qualified"] },
        { name: "website", type: "url" },
      ],
      indexes: [
        { name: "prospects_name_idx", fields: ["name"] },
      ],
    }),
  });
  assert.equal(customCollection.status, 201);
  const collectionPayload = await customCollection.json() as { indexes: Array<{ name: string }> };
  assert.equal(collectionPayload.indexes[0]?.name, "prospects_name_idx");

  const extendBuiltIn = await fetch(`${server.baseUrl}/v1/namespaces/test-crm/collections/tasks`, {
    method: "PATCH",
    headers: {
      ...authHeaders(server.adminToken),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      fields: [
        { name: "title", type: "text", required: true },
        { name: "status", type: "select", required: true, options: ["todo", "in_progress", "done"] },
        { name: "priority", type: "select", options: ["low", "medium", "high", "urgent"] },
        { name: "dueAt", type: "date" },
        { name: "assignee", type: "relation", relation: { collectionName: "people" } },
        { name: "estimateHours", type: "number" },
      ],
    }),
  });
  assert.equal(extendBuiltIn.status, 200);

  const destructiveBuiltIn = await fetch(`${server.baseUrl}/v1/namespaces/test-crm/collections/tasks`, {
    method: "PATCH",
    headers: {
      ...authHeaders(server.adminToken),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      fields: [
        { name: "status", type: "select", required: true, options: ["todo", "in_progress", "done"] },
      ],
    }),
  });
  assert.equal(destructiveBuiltIn.status, 400);
});

test("existing databases receive additive built-in upgrades without reset", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "database-migration-"));
  const dataDir = path.join(rootDir, ".data");
  const dbPath = path.join(dataDir, "core.sqlite");
  const filesDir = path.join(dataDir, "files");

  const store = new DatabaseServiceStore(dbPath, filesDir);
  store.sqlite.prepare(`
    UPDATE collections
    SET fields_json = ?, indexes_json = ?, core_fields_json = ?
    WHERE namespace_id = 'main' AND name = 'goals'
  `).run(
    JSON.stringify([
      { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
      { name: "title", type: "text", required: true },
      { name: "level", type: "select", required: true, options: ["company", "team", "personal"] },
      { name: "status", type: "select", required: true, options: ["active", "paused", "done"] },
      { name: "description", type: "text" },
      { name: "parentId", type: "relation", relation: { collectionName: "goals" } },
      { name: "ownerAgentId", type: "relation", relation: { collectionName: "company_agents" } },
    ]),
    JSON.stringify([{ name: "goals_company_idx", fields: ["companyId"] }]),
    JSON.stringify(["companyId", "title", "status"]),
  );
  store.sqlite.prepare(`
    DELETE FROM collections
    WHERE namespace_id = 'main' AND name IN ('portfolios', 'portfolio_items', 'releases')
  `).run();
  store.close();

  const upgraded = new DatabaseServiceStore(dbPath, filesDir);
  const goals = upgraded.getCollection("main", "goals");
  const portfolios = upgraded.getCollection("main", "portfolios");
  const releases = upgraded.getCollection("main", "releases");

  assert.ok(goals);
  assert.ok(goals.fields.some((field) => field.name === "parentId"));
  assert.ok(goals.fields.some((field) => field.name === "parentGoalId"));
  assert.ok(goals.fields.some((field) => field.name === "portfolioId"));
  assert.ok(goals.fields.some((field) => field.name === "portfolioItemId"));
  assert.ok(goals.fields.some((field) => field.name === "metricLabel"));
  assert.ok(portfolios);
  assert.ok(releases);

  upgraded.close();
  fs.rmSync(rootDir, { recursive: true, force: true });
});

test("record CRUD, scoped tokens, files, and realtime work together", async () => {
  const server = await boot();

  await fetch(`${server.baseUrl}/v1/namespaces`, {
    method: "POST",
    headers: {
      ...authHeaders(server.adminToken),
      "content-type": "application/json",
    },
    body: JSON.stringify({ id: "test-crm", displayName: "Test CRM" }),
  });

  await fetch(`${server.baseUrl}/v1/namespaces/test-crm/collections`, {
    method: "POST",
    headers: {
      ...authHeaders(server.adminToken),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: "prospects",
      displayName: "Prospects",
      fields: [
        { name: "name", type: "text", required: true },
        { name: "status", type: "select", options: ["new", "qualified"], required: true },
      ],
      indexes: [],
    }),
  });

  const tokenResponse = await fetch(`${server.baseUrl}/v1/namespaces/test-crm/tokens`, {
    method: "POST",
    headers: {
      ...authHeaders(server.adminToken),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      label: "crm-worker",
      collectionName: "prospects",
      operations: [
        "schema:read",
        "records:list",
        "records:read",
        "records:create",
        "records:update",
        "records:delete",
        "files:read",
        "files:write",
        "realtime:subscribe",
      ],
    }),
  });
  assert.equal(tokenResponse.status, 201);
  const tokenPayload = await tokenResponse.json() as { token: string; record: { id: string } };
  const scopedHeaders = authHeaders(tokenPayload.token);

  const subscriptionReady = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("subscription timeout")), 5_000);
    const socket = new WebSocket(`${server.baseUrl.replace("http", "ws")}/v1/realtime?token=${tokenPayload.token}`);
    socket.on("open", () => {
      socket.send(JSON.stringify({
        type: "subscribe",
        namespaceId: "test-crm",
        collectionName: "prospects",
      }));
    });
    socket.on("message", (buffer) => {
      const payload = JSON.parse(buffer.toString()) as { type: string };
      if (payload.type === "subscribed") {
        clearTimeout(timeout);
        socket.close();
        resolve();
      }
    });
    socket.on("error", reject);
  });

  const realtimeEvent = new Promise<Record<string, unknown>>((resolve, reject) => {
    const socket = new WebSocket(`${server.baseUrl.replace("http", "ws")}/v1/realtime?token=${tokenPayload.token}`);
    socket.on("open", () => {
      socket.send(JSON.stringify({
        type: "subscribe",
        namespaceId: "test-crm",
        collectionName: "prospects",
      }));
    });
    socket.on("message", (buffer) => {
      const payload = JSON.parse(buffer.toString()) as { type: string; event?: Record<string, unknown> };
      if (payload.type === "event" && payload.event) {
        resolve(payload.event);
        socket.close();
      }
    });
    socket.on("error", reject);
  });

  await subscriptionReady;

  const createdRecordResponse = await fetch(`${server.baseUrl}/v1/namespaces/test-crm/collections/prospects/records`, {
    method: "POST",
    headers: {
      ...scopedHeaders,
      "content-type": "application/json",
    },
    body: JSON.stringify({ name: "Ada", status: "new" }),
  });
  assert.equal(createdRecordResponse.status, 201);
  const createdRecord = await createdRecordResponse.json() as { id: string; name: string };
  assert.equal(createdRecord.name, "Ada");

  const event = await realtimeEvent;
  assert.equal(event.type, "record.created");
  assert.equal(event.collectionName, "prospects");

  await fetch(`${server.baseUrl}/v1/namespaces/test-crm/collections/prospects/records/${createdRecord.id}`, {
    method: "PATCH",
    headers: {
      ...scopedHeaders,
      "content-type": "application/json",
    },
    body: JSON.stringify({ status: "qualified" }),
  });

  const listed = await fetch(`${server.baseUrl}/v1/namespaces/test-crm/collections/prospects/records?filter=${encodeURIComponent(JSON.stringify({ status: "qualified" }))}&sort=-name`, {
    headers: scopedHeaders,
  });
  assert.equal(listed.status, 200);
  const listedPayload = await listed.json() as { total: number; items: Array<{ id: string; status: string }> };
  assert.equal(listedPayload.total, 1);
  assert.equal(listedPayload.items[0]?.status, "qualified");

  const forbiddenNamespace = await fetch(`${server.baseUrl}/v1/namespaces/main/collections/notes/records`, {
    headers: scopedHeaders,
  });
  assert.equal(forbiddenNamespace.status, 403);

  const form = new FormData();
  form.set("namespaceId", "test-crm");
  form.set("collectionName", "prospects");
  form.set("recordId", createdRecord.id);
  form.set("file", new Blob(["hello file"]), "hello.txt");
  const uploaded = await fetch(`${server.baseUrl}/v1/files`, {
    method: "POST",
    headers: scopedHeaders,
    body: form,
  });
  assert.equal(uploaded.status, 201);
  const uploadedPayload = await uploaded.json() as { id: string; downloadPath: string };

  const downloaded = await fetch(`${server.baseUrl}${uploadedPayload.downloadPath}`, {
    headers: scopedHeaders,
  });
  assert.equal(downloaded.status, 200);
  assert.equal(await downloaded.text(), "hello file");

  const deletedFile = await fetch(`${server.baseUrl}/v1/files/${uploadedPayload.id}`, {
    method: "DELETE",
    headers: scopedHeaders,
  });
  assert.equal(deletedFile.status, 200);

  const deletedRecord = await fetch(`${server.baseUrl}/v1/namespaces/test-crm/collections/prospects/records/${createdRecord.id}`, {
    method: "DELETE",
    headers: scopedHeaders,
  });
  assert.equal(deletedRecord.status, 200);

  const tokenList = await fetch(`${server.baseUrl}/v1/namespaces/test-crm/tokens`, {
    headers: authHeaders(server.adminToken),
  });
  const tokenListPayload = await tokenList.json() as { items: Array<{ id: string }> };
  assert.equal(tokenListPayload.items[0]?.id, tokenPayload.record.id);

  const revoke = await fetch(`${server.baseUrl}/v1/namespaces/test-crm/tokens/${tokenPayload.record.id}/revoke`, {
    method: "POST",
    headers: {
      ...authHeaders(server.adminToken),
    },
  });
  assert.equal(revoke.status, 200);

  const deniedAfterRevoke = await fetch(`${server.baseUrl}/v1/namespaces/test-crm/collections/prospects/records`, {
    headers: scopedHeaders,
  });
  assert.equal(deniedAfterRevoke.status, 401);
});
