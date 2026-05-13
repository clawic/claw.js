import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { once } from "node:events";

import { NodeProcessHost } from "../host/process.ts";
import {
  brokerSecretHttp,
  describeSecret,
  doctorKeychain,
  ensureSecretReference,
  ensureTelegramBotSecretReference,
  getSecretCapabilities,
  listSecretActions,
  listSecretLeases,
  listSecrets,
  listSecretTypes,
  runSecretAction,
} from "./index.ts";

function createFakeSecretsProxy(): { proxyPath: string; env: NodeJS.ProcessEnv } {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-secrets-proxy-"));
  const proxyPath = path.join(binDir, "secrets-proxy");
  const statePath = path.join(binDir, "secrets.json");
  fs.writeFileSync(statePath, JSON.stringify([
    {
      name: "telegram_bot_token",
      kind: "generic",
      allowedHosts: ["api.telegram.org"],
      allowedHeaderNames: [],
      readOnly: false,
      allowInURL: true,
      allowInRequestBody: false,
      allowInsecureTransport: false,
      allowLocalNetwork: false,
    },
    {
      name: "openai_api_key",
      kind: "generic",
      allowedHosts: ["api.openai.com"],
      allowedHeaderNames: ["Authorization"],
      readOnly: true,
      allowInURL: false,
      allowInRequestBody: false,
      allowInsecureTransport: false,
      allowLocalNetwork: false,
    },
  ], null, 2));

  fs.writeFileSync(proxyPath, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(process.env.FAKE_SECRETS_PROXY_STATE, "utf8"));
if (args[0] === "doctor-keychain") {
  process.stdout.write("Keychain OK\\n");
  process.exit(0);
}
if (args[0] === "list-secrets") {
  const searchIndex = args.indexOf("--search");
  const search = searchIndex === -1 ? "" : String(args[searchIndex + 1] || "").toLowerCase();
  const entries = !search ? state : state.filter((entry) => String(entry.name).toLowerCase().includes(search));
  process.stdout.write(JSON.stringify(entries));
  process.exit(0);
}
if (args[0] === "describe-secret") {
  const name = String(args[args.indexOf("--name") + 1] || "");
  const match = state.filter((entry) => entry.name === name);
  process.stdout.write(JSON.stringify(match));
  process.exit(0);
}
process.stderr.write("unsupported\\n");
process.exit(1);
`, { mode: 0o755 });

  return {
    proxyPath,
    env: {
      ...process.env,
      CLAW_SECRETS_PROXY_PATH: proxyPath,
      FAKE_SECRETS_PROXY_STATE: statePath,
    },
  };
}

async function createFakeSecretsServer() {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (url.pathname === "/v1/health") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ ok: true, service: "secrets", host: "127.0.0.1", port: 0 }));
      return;
    }
    if (url.pathname === "/v1/secret-types") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        types: [{
          typeId: "revenuecat.api_key",
          label: "RevenueCat API key",
          description: "RevenueCat secret API key for brokered API calls.",
          kind: "revenuecat_api_key",
          defaultAllowedHosts: ["api.revenuecat.com"],
          defaultAllowedHeaderNames: ["Authorization", "X-Platform"],
          defaultAllowInURL: false,
          defaultAllowInRequestBody: false,
          defaultAllowLocalNetwork: false,
          defaultReadOnly: true,
          defaultLeaseModes: ["process"],
          defaultCapabilities: ["metadata.read", "broker.http", "lease.process"],
          fields: [{ id: "baseUrl", label: "Override base URL", kind: "url", required: false }],
          actions: [{ id: "revenuecat.projects.list", label: "List projects", description: "Call RevenueCat list projects through the broker.", capability: "broker.http", method: "GET" }],
        }],
      }));
      return;
    }
    if (url.pathname === "/v1/tenants/demo-tenant/secrets") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        secrets: [{
          secretName: "revenuecat_primary",
          name: "revenuecat_primary",
          kind: "revenuecat_api_key",
          typeId: "revenuecat.api_key",
          allowedHosts: ["api.revenuecat.com"],
          allowedHeaderNames: ["Authorization", "X-Platform"],
          readOnly: true,
          allowInURL: false,
          allowInRequestBody: false,
          allowLocalNetwork: false,
          leaseModes: ["process"],
          maskedFingerprint: "sha256:demo",
          version: 1,
          updatedAt: "2026-04-14T00:00:00.000Z",
        }],
      }));
      return;
    }
    if (url.pathname === "/v1/tenants/demo-tenant/secrets/revenuecat_primary") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        secret: {
          secretName: "revenuecat_primary",
          name: "revenuecat_primary",
          kind: "revenuecat_api_key",
          typeId: "revenuecat.api_key",
          structuredFields: { baseUrl: "http://127.0.0.1:9999" },
          allowedHosts: ["api.revenuecat.com"],
          allowedHeaderNames: ["Authorization", "X-Platform"],
          readOnly: true,
          allowInURL: false,
          allowInRequestBody: false,
          allowLocalNetwork: false,
          leaseModes: ["process"],
          maskedFingerprint: "sha256:demo",
          version: 1,
          updatedAt: "2026-04-14T00:00:00.000Z",
        },
      }));
      return;
    }
    if (url.pathname === "/v1/tenants/demo-tenant/secrets/revenuecat_primary/capabilities") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        secret: { secretName: "revenuecat_primary", typeId: "revenuecat.api_key" },
        capabilities: [
          { capability: "metadata.read", allowed: true },
          { capability: "broker.http", allowed: true },
        ],
      }));
      return;
    }
    if (url.pathname === "/v1/tenants/demo-tenant/secrets/revenuecat_primary/actions") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        secret: { secretName: "revenuecat_primary", typeId: "revenuecat.api_key" },
        actions: [
          { id: "revenuecat.projects.list", label: "List projects", description: "List projects", capability: "broker.http", method: "GET", allowed: true },
        ],
      }));
      return;
    }
    if (url.pathname === "/v1/tenants/demo-tenant/leases") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ leases: [] }));
      return;
    }
    if (url.pathname === "/v1/tenants/demo-tenant/broker/http" && request.method === "POST") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        status: 200,
        headers: { "content-type": "application/json" },
        ok: true,
        bodyText: JSON.stringify({ authorization: "Bearer xoxb-secret-123" }),
      }));
      return;
    }
    if (url.pathname === "/v1/tenants/demo-tenant/secrets/slack_bot/actions/slack.authTest" && request.method === "POST") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        action: { id: "slack.authTest", label: "Auth test", description: "Call Slack auth.test through the broker.", capability: "broker.http", method: "POST" },
        result: {
          status: 200,
          headers: { "content-type": "application/json" },
          ok: true,
          bodyText: JSON.stringify({ authorization: "Bearer xoxb-secret-123" }),
        },
      }));
      return;
    }
    response.statusCode = 404;
    response.end("Not found");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

test("listSecrets and describeSecret read metadata through secrets-proxy", async () => {
  const fake = createFakeSecretsProxy();
  const runner = new NodeProcessHost();

  const listed = await listSecrets(runner, { search: "telegram", env: fake.env });
  const described = await describeSecret(runner, { name: "telegram_bot_token", env: fake.env });

  assert.equal(listed.length, 1);
  assert.equal(listed[0].name, "telegram_bot_token");
  assert.equal(described?.allowInURL, true);
});

test("doctorKeychain reports proxy health without leaking implementation details", async () => {
  const fake = createFakeSecretsProxy();
  const runner = new NodeProcessHost();
  const result = await doctorKeychain(runner, { env: fake.env });
  assert.equal(result.ok, true);
  assert.match(result.output, /Keychain OK/);
});

test("ensureSecretReference detects missing capabilities on an existing secret", async () => {
  const fake = createFakeSecretsProxy();
  const runner = new NodeProcessHost();
  const result = await ensureSecretReference(runner, {
    name: "openai_api_key",
    allowedHosts: ["api.openai.com", "api.anthropic.com"],
    allowedHeaderNames: ["Authorization", "X-API-Key"],
    readOnly: false,
    allowInURL: false,
    allowInRequestBody: false,
    allowInsecureTransport: false,
    allowLocalNetwork: false,
  }, { env: fake.env });

  assert.equal(result.status, "update_required");
  assert.deepEqual(result.missingHosts, ["api.anthropic.com"]);
  assert.deepEqual(result.missingHeaderNames, ["X-API-Key"]);
  assert.equal(result.mismatched.includes("readOnly"), true);
});

test("ensureTelegramBotSecretReference validates Telegram-specific URL requirements", async () => {
  const fake = createFakeSecretsProxy();
  const runner = new NodeProcessHost();
  const result = await ensureTelegramBotSecretReference(runner, {
    name: "telegram_bot_token",
  }, { env: fake.env });

  assert.equal(result.status, "configured");
  assert.equal(result.requirement.allowInURL, true);
  assert.deepEqual(result.requirement.allowedHosts, ["api.telegram.org"]);
});

test("secrets backend is used directly for list/types/capabilities/actions/leases", async () => {
  const secrets = await createFakeSecretsServer();
  try {
    const runner = new NodeProcessHost();
    const env = {
      ...process.env,
      SECRETS_BASE_URL: secrets.baseUrl,
      SECRETS_TOKEN: "secrets-token",
      SECRETS_TENANT_ID: "demo-tenant",
    };

    const listed = await listSecrets(runner, { env });
    const described = await describeSecret(runner, { name: "revenuecat_primary", env });
    const types = await listSecretTypes(runner, { env });
    const capabilities = await getSecretCapabilities(runner, { name: "revenuecat_primary", env });
    const actions = await listSecretActions(runner, { name: "revenuecat_primary", env });
    const leases = await listSecretLeases(runner, { env });
    const doctor = await doctorKeychain(runner, { env });

    assert.equal(listed[0]?.name, "revenuecat_primary");
    assert.equal(described?.typeId, "revenuecat.api_key");
    assert.ok(types.some((entry) => entry.typeId === "revenuecat.api_key"));
    assert.ok(capabilities.capabilities.some((entry) => entry.capability === "broker.http" && entry.allowed));
    assert.ok(actions.actions.some((entry) => entry.id === "revenuecat.projects.list" && entry.allowed));
    assert.equal(leases.length, 0);
    assert.equal(doctor.ok, true);
  } finally {
    await secrets.close();
  }
});

test("secrets backend brokers generic HTTP and typed actions without exposing plaintext", async () => {
  const secrets = await createFakeSecretsServer();
  try {
    const runner = new NodeProcessHost();
    const env = {
      ...process.env,
      SECRETS_BASE_URL: secrets.baseUrl,
      SECRETS_TOKEN: "secrets-token",
      SECRETS_TENANT_ID: "demo-tenant",
    };

    const generic = await brokerSecretHttp(runner, {
      method: "POST",
      url: "http://127.0.0.1:9999/echo",
      headers: {
        Authorization: "Bearer {{slack_bot}}",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ hello: "world" }),
    }, { env });
    const genericPayload = JSON.parse(generic.bodyText) as { authorization: string };
    assert.equal(genericPayload.authorization, "Bearer xoxb-secret-123");

    const typed = await runSecretAction(runner, { name: "slack_bot", actionId: "slack.authTest", env });
    assert.equal(typed.action.id, "slack.authTest");
    const typedPayload = JSON.parse(typed.result.bodyText) as { authorization: string };
    assert.equal(typedPayload.authorization, "Bearer xoxb-secret-123");
  } finally {
    await secrets.close();
  }
});
