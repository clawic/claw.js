import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { FastifyInstance } from "fastify";

import { ChannelApiClient } from "@clawjs/channel-base";
import { buildWebhooksApp } from "../../src/server/app.ts";

const SECRET = "webhooks-e2e-secret";

function injectFetch(app: FastifyInstance): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const response = await app.inject({
      method: init?.method ?? "GET",
      url: `${url.pathname}${url.search}`,
      headers: init?.headers as Record<string, string> | undefined,
      payload: init?.body ? String(init.body) : undefined,
    });
    return new Response(response.body, { status: response.statusCode, headers: response.headers as Record<string, string> });
  };
}

async function spinUp() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "webhooks-e2e-"));
  const built = buildWebhooksApp({ config: { host: "127.0.0.1", port: 0, dataDir: tmpDir, dbPath: path.join(tmpDir, "clawjs.sqlite"), sharedSecret: SECRET } });
  const client = new ChannelApiClient({ channel: "webhooks", baseUrl: "http://webhooks.test", token: SECRET, fetchImpl: injectFetch(built.app) });
  return { client, tmpDir, close: async () => { await built.app.close(); fs.rmSync(tmpDir, { recursive: true, force: true }); } };
}

test("webhooks: account CRUD round-trip", async () => {
  const ctx = await spinUp();
  try {
    const account = await ctx.client.createAccount({ name: "primary", credentialsRef: "vault://webhooks/primary" });
    assert.equal(account.channel, "webhooks");
    assert.equal(account.name, "primary");
    const list = await ctx.client.listAccounts();
    assert.equal(list.items.length, 1);
    const del = await ctx.client.deleteAccount(account.id);
    assert.equal(del.deleted, true);
  } finally { await ctx.close(); }
});

test("webhooks: routing assign + resolve + remove", async () => {
  const ctx = await spinUp();
  try {
    const account = await ctx.client.createAccount({ name: "primary" });
    const route = await ctx.client.assignRouting({ accountId: account.id, targetId: "target-1", agentId: "agent-a" });
    assert.equal(route.agentId, "agent-a");
    const list = await ctx.client.listRouting({ accountId: account.id });
    assert.equal(list.items.length, 1);
    const del = await ctx.client.unassignRouting(route.id);
    assert.equal(del.deleted, true);
  } finally { await ctx.close(); }
});

test("webhooks: send via stub transport records outbound message", async () => {
  const ctx = await spinUp();
  try {
    const account = await ctx.client.createAccount({ name: "primary" });
    const msg = await ctx.client.sendMessage({ accountId: account.id, targetId: "target-1", content: "hola desde webhooks" });
    assert.equal(msg.direction, "outbound");
    assert.equal(msg.providerStatus, "stub_delivered");
    assert.match(msg.providerMessageId ?? "", /^stub_/);
  } finally { await ctx.close(); }
});

test("webhooks: inbound webhook lands in messages table", async () => {
  const ctx = await spinUp();
  try {
    const account = await ctx.client.createAccount({ name: "primary" });
    const msg = await ctx.client.inboundWebhook({ accountId: account.id, targetId: "target-1", content: "respuesta entrante", senderLabel: "Tester" });
    assert.equal(msg.direction, "inbound");
    assert.equal(msg.role, "user");
    const list = await ctx.client.listMessages({ accountId: account.id, direction: "inbound" });
    assert.equal(list.items.length, 1);
  } finally { await ctx.close(); }
});

test("webhooks: send to unknown account returns 404", async () => {
  const ctx = await spinUp();
  try {
    await assert.rejects(() => ctx.client.sendMessage({ accountId: "missing", targetId: "x", content: "y" }), /account_not_found|404/);
  } finally { await ctx.close(); }
});
