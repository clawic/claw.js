import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { resolveUiRoot } from "../../src/server/app.ts";
import { startUpstreamServer, startSecretsServer, login } from "./helpers.ts";

const execFileAsync = promisify(execFile);
const slackFixtureToken = ["xoxb", "secret", "123"].join("-");
const limitedSlackFixtureToken = ["xoxb", "limited", "secret"].join("-");

async function createPrincipal(baseUrl: string, accessToken: string, input: { type: string; label: string }, tenantId = "demo-tenant") {
  const response = await fetch(`${baseUrl}/v1/tenants/${tenantId}/principals`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  assert.equal(response.status, 201);
  return await response.json() as { principal: { id: string }; token: string };
}

async function createPolicy(baseUrl: string, accessToken: string, input: Record<string, unknown>, tenantId = "demo-tenant") {
  const response = await fetch(`${baseUrl}/v1/tenants/${tenantId}/policies`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  assert.ok(response.status === 200 || response.status === 201);
}

test("secrets ui serves shared brand assets and fonts", async () => {
  const secrets = await startSecretsServer("secrets-brand");
  try {
    const sharedAssetsDir = path.resolve(process.cwd(), "..", "assets");

    const indexResponse = await fetch(`${secrets.baseUrl}/`);
    assert.equal(indexResponse.status, 200);
    const indexHtml = await indexResponse.text();
    assert.match(indexHtml, /href="\/brand\/favicon\.ico"/);

    const logoResponse = await fetch(`${secrets.baseUrl}/brand/logo.png`);
    assert.equal(logoResponse.status, 200);
    assert.deepEqual(
      Buffer.from(await logoResponse.arrayBuffer()),
      fs.readFileSync(path.join(sharedAssetsDir, "logo.png")),
    );

    const faviconResponse = await fetch(`${secrets.baseUrl}/brand/favicon.ico`);
    assert.equal(faviconResponse.status, 200);
    assert.deepEqual(
      Buffer.from(await faviconResponse.arrayBuffer()),
      fs.readFileSync(path.join(sharedAssetsDir, "favicon.ico")),
    );

    const fontResponse = await fetch(`${secrets.baseUrl}/brand/fonts/source-sans-3/source-sans-3-v18-cyrillic_latin_latin-ext-regular.woff2`);
    assert.equal(fontResponse.status, 200);
    assert.deepEqual(
      Buffer.from(await fontResponse.arrayBuffer()),
      fs.readFileSync(path.join(sharedAssetsDir, "fonts", "source-sans-3", "source-sans-3-v18-cyrillic_latin_latin-ext-regular.woff2")),
    );
  } finally {
    await secrets.close();
  }
});

test("secrets resolves the built UI path for the packaged server entrypoint", () => {
  const resolved = resolveUiRoot(
    {
      host: "127.0.0.1",
      port: 24103,
      dataDir: path.join(process.cwd(), ".data"),
      dbPath: path.join(process.cwd(), ".data", "vault.sqlite"),
      jwtSecret: "secrets-test-secret",
      publicBaseUrl: "http://127.0.0.1:24103",
      corsOrigins: [],
      uiDistDir: path.join(process.cwd(), ".missing-ui"),
    },
    new URL(`file://${path.join(process.cwd(), "dist", "server.js")}`).href,
  );
  assert.equal(resolved, path.join(process.cwd(), "ui", "dist"));
});

test("secrets stores encrypted versions and never returns plaintext through metadata endpoints", async () => {
  const secrets = await startSecretsServer("secrets-metadata");
  try {
    const tenantId = "clawix-local";
    const session = await login(secrets.baseUrl, {
      tenantId,
      email: "admin@secrets.local",
      password: "secrets-admin",
    });
    const create = await fetch(`${secrets.baseUrl}/v1/tenants/${tenantId}/secrets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        draft: {
          internalName: "deploy_token",
          title: "Deploy Token",
          fields: [{ fieldName: "token", fieldKind: "password", placement: "header", isSecret: true, secretValue: "super-secret-v1" }],
          governance: {
            allowedHosts: ["api.example.test"],
            allowedHeaders: ["Authorization"],
          },
        },
      }),
    });
    if (create.status !== 200) assert.fail(await create.text());
    const created = await create.json() as { secret: { internalName: string; versionNumber: number; fields: Array<{ fieldName: string; hasCiphertext: boolean }>; [key: string]: unknown } };
    assert.equal(created.secret.internalName, "deploy_token");
    assert.equal(created.secret.versionNumber, 1);
    assert.equal("secretValue" in created.secret, false);
    assert.equal(created.secret.fields.find((field) => field.fieldName === "token")?.hasCiphertext, true);

    const describe = await fetch(`${secrets.baseUrl}/v1/tenants/${tenantId}/secrets/deploy_token`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    assert.equal(describe.status, 200);
    const payload = await describe.json() as { secret: { versionNumber: number; fields: Array<{ fieldName: string; publicValue: string | null; hasCiphertext: boolean }>; [key: string]: unknown } };
    assert.equal(payload.secret.versionNumber, 1);
    assert.equal("secretValue" in payload.secret, false);
    const describedToken = payload.secret.fields.find((field) => field.fieldName === "token");
    assert.equal(describedToken?.hasCiphertext, true);
    assert.equal(describedToken?.publicValue, null);
  } finally {
    await secrets.close();
  }
});

test("secrets exposes typed secret catalog and disables generic typed action execution", async () => {
  const secrets = await startSecretsServer("secrets-typed");
  const upstream = await startUpstreamServer();
  try {
    const tenantId = "clawix-local";
    const session = await login(secrets.baseUrl, {
      tenantId,
      email: "admin@secrets.local",
      password: "secrets-admin",
    });
    const upstreamHost = new URL(upstream.baseUrl).host;

    const typesResponse = await fetch(`${secrets.baseUrl}/v1/secret-types`);
    assert.equal(typesResponse.status, 200);
    const typesPayload = await typesResponse.json() as { types: Array<{ typeId: string }> };
    assert.ok(typesPayload.types.some((entry) => entry.typeId === "revenuecat.api_key"));

    const create = await fetch(`${secrets.baseUrl}/v1/tenants/${tenantId}/secrets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        draft: {
          typeId: "revenuecat.api_key",
          internalName: "revenuecat_primary",
          title: "RevenueCat Primary",
          fields: [
            { fieldName: "api_key", fieldKind: "password", placement: "header", isSecret: true, secretValue: "rc_secret_123" },
            { fieldName: "project_id", fieldKind: "text", placement: "none", isSecret: false, publicValue: "proj_demo" },
          ],
          governance: {
            allowedHosts: [upstreamHost, "api.revenuecat.com"],
            allowedHeaders: ["Authorization", "X-Platform"],
            allowLocalNetwork: true,
          },
        },
      }),
    });
    assert.equal(create.status, 200);
    const created = await create.json() as { secret: { typeId: string; [key: string]: unknown } };
    assert.equal(created.secret.typeId, "revenuecat.api_key");
    assert.equal("secretValue" in created.secret, false);

    await createPolicy(secrets.baseUrl, session.accessToken, {
      subjectType: "tenant_admin",
      subjectId: "user-admin",
      secretName: "revenuecat_primary",
      capability: "broker.http",
      effect: "allow",
    }, tenantId);

    const capabilities = await fetch(`${secrets.baseUrl}/v1/tenants/${tenantId}/secrets/revenuecat_primary/capabilities`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    assert.equal(capabilities.status, 200);
    const capabilityPayload = await capabilities.json() as { capabilities: Array<{ capability: string; allowed: boolean }> };
    assert.ok(capabilityPayload.capabilities.some((entry) => entry.capability === "broker.http" && entry.allowed));

    const actions = await fetch(`${secrets.baseUrl}/v1/tenants/${tenantId}/secrets/revenuecat_primary/actions`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    assert.equal(actions.status, 200);
    const actionPayload = await actions.json() as { actions: Array<{ id: string; allowed: boolean }> };
    assert.ok(actionPayload.actions.some((entry) => entry.id === "broker.http" && entry.allowed));

    const run = await fetch(`${secrets.baseUrl}/v1/tenants/${tenantId}/secrets/revenuecat_primary/actions/broker.http`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    assert.equal(run.status, 410);
  } finally {
    await upstream.close();
    await secrets.close();
  }
});

test("secrets broker enforces deny precedence and host constraints", async () => {
  const secrets = await startSecretsServer("secrets-broker");
  const upstream = await startUpstreamServer();
  try {
    const tenantId = "clawix-local";
    const session = await login(secrets.baseUrl, {
      tenantId,
      email: "admin@secrets.local",
      password: "secrets-admin",
    });
    const upstreamHost = new URL(upstream.baseUrl).host;
    const create = await fetch(`${secrets.baseUrl}/v1/tenants/${tenantId}/secrets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        draft: {
          internalName: "slack_bot",
          title: "Slack Bot",
          fields: [{ fieldName: "token", fieldKind: "password", placement: "header", isSecret: true, secretValue: slackFixtureToken }],
          governance: {
            allowedHosts: [upstreamHost],
            allowedHeaders: ["Authorization"],
            allowLocalNetwork: true,
            allowInsecureTransport: true,
          },
        },
      }),
    });
    assert.equal(create.status, 200);
    await createPolicy(secrets.baseUrl, session.accessToken, {
      subjectType: "tenant_admin",
      subjectId: "*",
      secretName: "slack_bot",
      capability: "broker.http",
      effect: "allow",
    }, tenantId);
    await createPolicy(secrets.baseUrl, session.accessToken, {
      subjectType: "tenant_admin",
      subjectId: "*",
      secretName: "slack_bot",
      capability: "metadata.read",
      effect: "allow",
    }, tenantId);

    const ok = await fetch(`${secrets.baseUrl}/v1/tenants/${tenantId}/broker/http`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        method: "POST",
        url: `${upstream.baseUrl}/echo`,
        capability: "broker.http",
        agent: "secrets-broker-e2e",
        riskTier: "read",
        declaredFields: [{ secretName: "slack_bot", fieldName: "token", placement: "header" }],
        headers: {
          Authorization: "Bearer {{slack_bot.token}}",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ hello: "world" }),
      }),
    });
    assert.equal(ok.status, 200);
    const brokerPayload = await ok.json() as { bodyText: string };
    const upstreamPayload = JSON.parse(brokerPayload.bodyText) as { authorization: string };
    assert.equal(upstreamPayload.authorization, "Bearer [REDACTED]");

    const binary = await fetch(`${secrets.baseUrl}/v1/tenants/${tenantId}/broker/http`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        method: "GET",
        url: `${upstream.baseUrl}/binary-echo`,
        capability: "broker.http",
        agent: "secrets-broker-e2e",
        riskTier: "read",
        declaredFields: [{ secretName: "slack_bot", fieldName: "token", placement: "header" }],
        headers: {
          Authorization: "Bearer {{slack_bot.token}}",
        },
        allowBinaryResponse: true,
      }),
    });
    assert.equal(binary.status, 200);
    const binaryPayload = await binary.json() as { bodyText: string; bodyBase64?: string };
    assert.equal(binaryPayload.bodyText, "");
    assert.equal("bodyBase64" in binaryPayload, false);

    const binaryFile = await fetch(`${secrets.baseUrl}/v1/tenants/${tenantId}/broker/http`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        method: "GET",
        url: `${upstream.baseUrl}/binary-file`,
        capability: "broker.http",
        agent: "secrets-broker-e2e",
        riskTier: "read",
        declaredFields: [{ secretName: "slack_bot", fieldName: "token", placement: "header" }],
        headers: {
          Authorization: "Bearer {{slack_bot.token}}",
        },
        allowBinaryResponse: true,
      }),
    });
    assert.equal(binaryFile.status, 200);
    const binaryFilePayload = await binaryFile.json() as { bodyText: string; bodyBase64?: string };
    assert.equal(binaryFilePayload.bodyText, "");
    assert.equal(binaryFilePayload.bodyBase64, Buffer.from([0, 1, 2, 3, 4, 5]).toString("base64"));

    const limitedCreate = await fetch(`${secrets.baseUrl}/v1/tenants/${tenantId}/secrets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        draft: {
          internalName: "limited_bot",
          title: "Limited Bot",
          fields: [{ fieldName: "token", fieldKind: "password", placement: "header", isSecret: true, secretValue: limitedSlackFixtureToken }],
          governance: {
            allowedHosts: [upstreamHost],
            allowedHeaders: ["Authorization"],
            allowLocalNetwork: true,
            allowInsecureTransport: true,
            maxUses: 1,
          },
        },
      }),
    });
    assert.equal(limitedCreate.status, 200);
    await createPolicy(secrets.baseUrl, session.accessToken, {
      subjectType: "tenant_admin",
      subjectId: "*",
      secretName: "limited_bot",
      capability: "broker.http",
      effect: "allow",
    }, tenantId);
    const limitedRequest = {
      method: "GET",
      url: `${upstream.baseUrl}/echo`,
      capability: "broker.http",
      agent: "secrets-broker-e2e",
      riskTier: "read",
      declaredFields: [{ secretName: "limited_bot", fieldName: "token", placement: "header" }],
      headers: { Authorization: "Bearer {{limited_bot.token}}" },
    };
    const limitedFirst = await fetch(`${secrets.baseUrl}/v1/tenants/${tenantId}/broker/http`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(limitedRequest),
    });
    assert.equal(limitedFirst.status, 200);
    const limitedSecond = await fetch(`${secrets.baseUrl}/v1/tenants/${tenantId}/broker/http`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(limitedRequest),
    });
    assert.equal(limitedSecond.status, 400);
    assert.match(await limitedSecond.text(), /max_uses_exhausted/);

    for (const input of [
      {
        label: "missing capability",
        body: {
          method: "GET",
          url: `${upstream.baseUrl}/echo`,
          agent: "secrets-broker-e2e",
          riskTier: "read",
          declaredFields: [{ secretName: "slack_bot", fieldName: "token", placement: "header" }],
          headers: { Authorization: "Bearer {{slack_bot.token}}" },
        },
      },
      {
        label: "missing risk tier",
        body: {
          method: "GET",
          url: `${upstream.baseUrl}/echo`,
          capability: "broker.http",
          agent: "secrets-broker-e2e",
          declaredFields: [{ secretName: "slack_bot", fieldName: "token", placement: "header" }],
          headers: { Authorization: "Bearer {{slack_bot.token}}" },
        },
      },
      {
        label: "missing declared fields",
        body: {
          method: "GET",
          url: `${upstream.baseUrl}/echo`,
          capability: "broker.http",
          agent: "secrets-broker-e2e",
          riskTier: "read",
          headers: { Authorization: "Bearer {{slack_bot.token}}" },
        },
      },
      {
        label: "undeclared placement",
        body: {
          method: "GET",
          url: `${upstream.baseUrl}/echo?token={{slack_bot.token}}`,
          capability: "broker.http",
          agent: "secrets-broker-e2e",
          riskTier: "read",
          declaredFields: [{ secretName: "slack_bot", fieldName: "token", placement: "header" }],
          headers: { Authorization: "Bearer {{slack_bot.token}}" },
        },
      },
      {
        label: "ambiguous body encoding",
        body: {
          method: "POST",
          url: `${upstream.baseUrl}/echo`,
          capability: "broker.http",
          agent: "secrets-broker-e2e",
          riskTier: "read",
          declaredFields: [{ secretName: "slack_bot", fieldName: "token", placement: "header" }],
          headers: { Authorization: "Bearer {{slack_bot.token}}" },
          body: "plain",
          bodyBase64: Buffer.from("plain").toString("base64"),
        },
      },
    ]) {
      const failed = await fetch(`${secrets.baseUrl}/v1/tenants/${tenantId}/broker/http`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input.body),
      });
      assert.equal(failed.status, 400, input.label);
    }

    const legacyExecute = await fetch(`${secrets.baseUrl}/v1/tenants/${tenantId}/secrets/slack_bot/execute/broker.http`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ args: {} }),
    });
    assert.equal(legacyExecute.status, 410);

    const legacyAction = await fetch(`${secrets.baseUrl}/v1/tenants/${tenantId}/secrets/slack_bot/actions/broker.http`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ args: {} }),
    });
    assert.equal(legacyAction.status, 410);

    const hostMismatch = await fetch(`${secrets.baseUrl}/v1/tenants/${tenantId}/broker/http`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        method: "GET",
        url: "https://example.com/echo",
        capability: "broker.http",
        agent: "secrets-broker-e2e",
        riskTier: "read",
        declaredFields: [{ secretName: "slack_bot", fieldName: "token", placement: "header" }],
        headers: {
          Authorization: "Bearer {{slack_bot.token}}",
        },
      }),
    });
    assert.equal(hostMismatch.status, 400);

    await createPolicy(secrets.baseUrl, session.accessToken, {
      subjectType: "tenant_admin",
      subjectId: "*",
      secretName: "slack_bot",
      capability: "broker.http",
      effect: "deny",
    }, tenantId);
    const denied = await fetch(`${secrets.baseUrl}/v1/tenants/${tenantId}/broker/http`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        method: "GET",
        url: `${upstream.baseUrl}/echo`,
        capability: "broker.http",
        agent: "secrets-broker-e2e",
        riskTier: "read",
        declaredFields: [{ secretName: "slack_bot", fieldName: "token", placement: "header" }],
        headers: {
          Authorization: "Bearer {{slack_bot.token}}",
        },
      }),
    });
    assert.equal(denied.status, 403);
  } finally {
    await upstream.close();
    await secrets.close();
  }
});

test("secrets sidecar stays compatible with request/list/describe and supports process and browser leases", async () => {
  const secrets = await startSecretsServer("secrets-sidecar");
  const upstream = await startUpstreamServer();
  try {
    const tenantId = "clawix-local";
    const session = await login(secrets.baseUrl, {
      tenantId,
      email: "admin@secrets.local",
      password: "secrets-admin",
    });
    const upstreamHost = new URL(upstream.baseUrl).host;
    const create = await fetch(`${secrets.baseUrl}/v1/tenants/${tenantId}/secrets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        draft: {
          internalName: "telegram_support_bot_token",
          title: "Telegram Support Bot Token",
          fields: [{ fieldName: "token", fieldKind: "password", placement: "query", isSecret: true, secretValue: "secret-browser-token" }],
          governance: {
            allowedHosts: [upstreamHost],
            allowedHeaders: ["Authorization"],
            allowInUrl: true,
            allowLocalNetwork: true,
            allowInsecureTransport: true,
          },
        },
      }),
    });
    assert.equal(create.status, 200);

    const principal = await createPrincipal(secrets.baseUrl, session.accessToken, {
      type: "sidecar_principal",
      label: "test-sidecar",
    }, tenantId);
    for (const capability of ["metadata.read", "broker.http", "lease.process", "lease.browser"] as const) {
      await createPolicy(secrets.baseUrl, session.accessToken, {
        subjectType: "sidecar_principal",
        subjectId: principal.principal.id,
        secretName: "telegram_support_bot_token",
        capability,
        effect: "allow",
      }, tenantId);
    }

    const env = {
      ...process.env,
      CLAW_SECRETS_BASE_URL: secrets.baseUrl,
      CLAW_SECRETS_TOKEN: principal.token,
      CLAW_SECRETS_TENANT_ID: tenantId,
    };
    const list = await execFileAsync(process.execPath, [path.join(process.cwd(), "dist", "sidecar.js"), "list-secrets"], { env, encoding: "utf8" });
    const listed = JSON.parse(list.stdout) as Array<{ name: string }>;
    assert.equal(listed[0]?.name, "telegram_support_bot_token");

    const describe = await execFileAsync(process.execPath, [path.join(process.cwd(), "dist", "sidecar.js"), "describe-secret", "--name", "telegram_support_bot_token"], { env, encoding: "utf8" });
    const described = JSON.parse(describe.stdout) as Array<{ name: string }>;
    assert.equal(described[0]?.name, "telegram_support_bot_token");

    const requestOutput = await execFileAsync(process.execPath, [
      path.join(process.cwd(), "dist", "sidecar.js"),
      "request",
      "--method",
      "GET",
      "--url",
      `${upstream.baseUrl}/echo?token={{telegram_support_bot_token.token}}`,
      "--header",
      "Authorization: Bearer {{telegram_support_bot_token.token}}",
    ], { env, encoding: "utf8" });
    const requestPayload = JSON.parse(requestOutput.stdout) as { authorization: string; queryToken: string };
    assert.equal(requestPayload.authorization, "Bearer [REDACTED]");
    assert.equal(requestPayload.queryToken, "[REDACTED]");

    const scriptPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "secrets-sidecar-script-")), "stdin-reader.mjs");
    fs.writeFileSync(scriptPath, "process.stdin.on('data', (chunk) => process.stdout.write(String(chunk)));");
    const processOutput = await execFileAsync(process.execPath, [
      path.join(process.cwd(), "dist", "sidecar.js"),
      "spawn-process",
      "--secret-name",
      "telegram_support_bot_token",
      "--command",
      process.execPath,
      "--arg",
      scriptPath,
    ], { env, encoding: "utf8" });
    assert.equal(processOutput.stdout, "secret-browser-token");

    const screenshotPath = path.join(process.cwd(), "artifacts", "secrets-browser-lease.png");
    await execFileAsync(process.execPath, [
      path.join(process.cwd(), "dist", "sidecar.js"),
      "browser-fill",
      "--secret-name",
      "telegram_support_bot_token",
      "--url",
      `${upstream.baseUrl}/form`,
      "--field",
      "input[name=username]::alice",
      "--secret-selector",
      "input[name=password]",
      "--submit-selector",
      "button[type=submit]",
      "--screenshot",
      screenshotPath,
    ], { env, encoding: "utf8" });
    assert.equal(fs.existsSync(screenshotPath), true);
    assert.deepEqual(upstream.getLastSubmission(), {
      username: "alice",
      password: "secret-browser-token",
    });
  } finally {
    await upstream.close();
    await secrets.close();
  }
});
