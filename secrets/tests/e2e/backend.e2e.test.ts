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

async function createPrincipal(baseUrl: string, accessToken: string, input: { type: string; label: string }) {
  const response = await fetch(`${baseUrl}/v1/tenants/demo-tenant/principals`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  assert.equal(response.status, 201);
  return await response.json() as { principal: { id: string; token: string } };
}

async function createPolicy(baseUrl: string, accessToken: string, input: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/v1/tenants/demo-tenant/policies`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  assert.equal(response.status, 201);
}

test("secrets ui serves shared brand assets and fonts", async () => {
  const secrets = await startSecretsServer("secrets-brand");
  try {
    const sharedPublicDir = path.resolve(process.cwd(), "..", "public");

    const indexResponse = await fetch(`${secrets.baseUrl}/`);
    assert.equal(indexResponse.status, 200);
    const indexHtml = await indexResponse.text();
    assert.match(indexHtml, /href="\/brand\/favicon\.ico"/);

    const logoResponse = await fetch(`${secrets.baseUrl}/brand/logo.png`);
    assert.equal(logoResponse.status, 200);
    assert.deepEqual(
      Buffer.from(await logoResponse.arrayBuffer()),
      fs.readFileSync(path.join(sharedPublicDir, "logo.png")),
    );

    const faviconResponse = await fetch(`${secrets.baseUrl}/brand/favicon.ico`);
    assert.equal(faviconResponse.status, 200);
    assert.deepEqual(
      Buffer.from(await faviconResponse.arrayBuffer()),
      fs.readFileSync(path.join(sharedPublicDir, "favicon.ico")),
    );

    const fontResponse = await fetch(`${secrets.baseUrl}/brand/fonts/source-sans-3/source-sans-3-v18-cyrillic_latin_latin-ext-regular.woff2`);
    assert.equal(fontResponse.status, 200);
    assert.deepEqual(
      Buffer.from(await fontResponse.arrayBuffer()),
      fs.readFileSync(path.join(sharedPublicDir, "fonts", "source-sans-3", "source-sans-3-v18-cyrillic_latin_latin-ext-regular.woff2")),
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
      uiDistDir: path.join(process.cwd(), ".missing-ui"),
    },
    new URL(`file://${path.join(process.cwd(), "dist", "server.js")}`).href,
  );
  assert.equal(resolved, path.join(process.cwd(), "ui", "dist"));
});

test("secrets stores encrypted versions and never returns plaintext through metadata endpoints", async () => {
  const secrets = await startSecretsServer("secrets-metadata");
  try {
    const session = await login(secrets.baseUrl);
    const create = await fetch(`${secrets.baseUrl}/v1/tenants/demo-tenant/secrets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        secretName: "deploy_token",
        secretValue: "super-secret-v1",
        allowedHosts: ["api.example.test"],
        allowedHeaderNames: ["Authorization"],
        leaseModes: ["process"],
      }),
    });
    assert.equal(create.status, 201);
    const created = await create.json() as { secret: { secretName: string; version: number; maskedFingerprint: string; [key: string]: unknown } };
    assert.equal(created.secret.secretName, "deploy_token");
    assert.equal(created.secret.version, 1);
    assert.equal("secretValue" in created.secret, false);

    const rotateAllowed = await fetch(`${secrets.baseUrl}/v1/tenants/demo-tenant/secrets/deploy_token/versions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ secretValue: "super-secret-v2" }),
    });
    assert.equal(rotateAllowed.status, 200);
    const describe = await fetch(`${secrets.baseUrl}/v1/tenants/demo-tenant/secrets/deploy_token`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    assert.equal(describe.status, 200);
    const payload = await describe.json() as { secret: { version: number; maskedFingerprint: string; [key: string]: unknown } };
    assert.equal(payload.secret.version, 2);
    assert.equal(payload.secret.maskedFingerprint.includes("super-secret"), false);
    assert.equal("secretValue" in payload.secret, false);
  } finally {
    await secrets.close();
  }
});

test("secrets exposes typed secret catalog, capabilities, and typed actions", async () => {
  const secrets = await startSecretsServer("secrets-typed");
  const upstream = await startUpstreamServer();
  try {
    const session = await login(secrets.baseUrl);
    const upstreamHost = new URL(upstream.baseUrl).host;

    const typesResponse = await fetch(`${secrets.baseUrl}/v1/secret-types`);
    assert.equal(typesResponse.status, 200);
    const typesPayload = await typesResponse.json() as { types: Array<{ typeId: string }> };
    assert.ok(typesPayload.types.some((entry) => entry.typeId === "revenuecat.api_key"));

    const create = await fetch(`${secrets.baseUrl}/v1/tenants/demo-tenant/secrets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        secretName: "revenuecat_primary",
        secretValue: "rc_secret_123",
        typeId: "revenuecat.api_key",
        structuredFields: { baseUrl: upstream.baseUrl },
        allowedHosts: [upstreamHost, "api.revenuecat.com"],
        allowedHeaderNames: ["Authorization", "X-Platform"],
        allowLocalNetwork: true,
        leaseModes: ["process"],
      }),
    });
    assert.equal(create.status, 201);
    const created = await create.json() as { secret: { typeId: string; structuredFields: Record<string, string> } };
    assert.equal(created.secret.typeId, "revenuecat.api_key");
    assert.equal(created.secret.structuredFields.baseUrl, upstream.baseUrl);

    await createPolicy(secrets.baseUrl, session.accessToken, {
      subjectType: "tenant_admin",
      subjectId: "user-admin",
      secretName: "revenuecat_primary",
      capability: "broker.http",
      effect: "allow",
    });

    const capabilities = await fetch(`${secrets.baseUrl}/v1/tenants/demo-tenant/secrets/revenuecat_primary/capabilities`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    assert.equal(capabilities.status, 200);
    const capabilityPayload = await capabilities.json() as { capabilities: Array<{ capability: string; allowed: boolean }> };
    assert.ok(capabilityPayload.capabilities.some((entry) => entry.capability === "broker.http" && entry.allowed));

    const actions = await fetch(`${secrets.baseUrl}/v1/tenants/demo-tenant/secrets/revenuecat_primary/actions`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    assert.equal(actions.status, 200);
    const actionPayload = await actions.json() as { actions: Array<{ id: string; allowed: boolean }> };
    assert.ok(actionPayload.actions.some((entry) => entry.id === "revenuecat.projects.list" && entry.allowed));

    const run = await fetch(`${secrets.baseUrl}/v1/tenants/demo-tenant/secrets/revenuecat_primary/actions/revenuecat.projects.list`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    assert.equal(run.status, 200);
    const runPayload = await run.json() as { result: { bodyText: string } };
    const typedResponse = JSON.parse(runPayload.result.bodyText) as { authorization: string; platform: string };
    assert.equal(typedResponse.authorization, "Bearer rc_secret_123");
    assert.equal(typedResponse.platform, "clawjs-secrets");
  } finally {
    await upstream.close();
    await secrets.close();
  }
});

test("secrets broker enforces deny precedence and host constraints", async () => {
  const secrets = await startSecretsServer("secrets-broker");
  const upstream = await startUpstreamServer();
  try {
    const session = await login(secrets.baseUrl);
    const upstreamHost = new URL(upstream.baseUrl).host;
    const create = await fetch(`${secrets.baseUrl}/v1/tenants/demo-tenant/secrets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        secretName: "slack_bot",
        secretValue: "xoxb-secret-123",
        allowedHosts: [upstreamHost],
        allowedHeaderNames: ["Authorization"],
        allowLocalNetwork: true,
        leaseModes: ["process"],
      }),
    });
    assert.equal(create.status, 201);
    await createPolicy(secrets.baseUrl, session.accessToken, {
      subjectType: "tenant_admin",
      subjectId: "user-admin",
      secretName: "slack_bot",
      capability: "broker.http",
      effect: "allow",
    });
    await createPolicy(secrets.baseUrl, session.accessToken, {
      subjectType: "tenant_admin",
      subjectId: "user-admin",
      secretName: "slack_bot",
      capability: "metadata.read",
      effect: "allow",
    });

    const ok = await fetch(`${secrets.baseUrl}/v1/tenants/demo-tenant/broker/http`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        method: "POST",
        url: `${upstream.baseUrl}/echo`,
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
    assert.equal(upstreamPayload.authorization, "Bearer xoxb-secret-123");

    await createPolicy(secrets.baseUrl, session.accessToken, {
      subjectType: "tenant_admin",
      subjectId: "user-admin",
      secretName: "slack_bot",
      capability: "broker.http",
      effect: "deny",
    });
    const denied = await fetch(`${secrets.baseUrl}/v1/tenants/demo-tenant/broker/http`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        method: "GET",
        url: `${upstream.baseUrl}/echo`,
        headers: {
          Authorization: "Bearer {{slack_bot.token}}",
        },
      }),
    });
    assert.equal(denied.status, 400);

    const hostMismatch = await fetch(`${secrets.baseUrl}/v1/tenants/demo-tenant/broker/http`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        method: "GET",
        url: "https://example.com/echo",
        headers: {
          Authorization: "Bearer {{slack_bot.token}}",
        },
      }),
    });
    assert.equal(hostMismatch.status, 400);
  } finally {
    await upstream.close();
    await secrets.close();
  }
});

test("secrets sidecar stays compatible with request/list/describe and supports process and browser leases", async () => {
  const secrets = await startSecretsServer("secrets-sidecar");
  const upstream = await startUpstreamServer();
  try {
    const session = await login(secrets.baseUrl);
    const upstreamHost = new URL(upstream.baseUrl).host;
    const create = await fetch(`${secrets.baseUrl}/v1/tenants/demo-tenant/secrets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        secretName: "telegram_support_bot_token",
        secretValue: "secret-browser-token",
        allowedHosts: [upstreamHost],
        allowedHeaderNames: ["Authorization"],
        allowInURL: true,
        allowLocalNetwork: true,
        leaseModes: ["process", "browser"],
      }),
    });
    assert.equal(create.status, 201);

    const principal = await createPrincipal(secrets.baseUrl, session.accessToken, {
      type: "sidecar_principal",
      label: "test-sidecar",
    });
    for (const capability of ["metadata.read", "broker.http", "lease.process", "lease.browser"] as const) {
      await createPolicy(secrets.baseUrl, session.accessToken, {
        subjectType: "sidecar_principal",
        subjectId: principal.principal.id,
        secretName: "telegram_support_bot_token",
        capability,
        effect: "allow",
      });
    }

    const env = {
      ...process.env,
      CLAW_SECRETS_BASE_URL: secrets.baseUrl,
      CLAW_SECRETS_TOKEN: principal.principal.token,
      CLAW_SECRETS_TENANT_ID: "demo-tenant",
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
    assert.equal(requestPayload.authorization, "Bearer secret-browser-token");
    assert.equal(requestPayload.queryToken, "secret-browser-token");

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
